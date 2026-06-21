import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ArticleHit = {
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  source: string;
};

/** Search OpenAlex for academic articles. */
export const searchArticles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const v = input as { query?: string; perPage?: number };
    if (!v || typeof v.query !== "string" || v.query.trim().length === 0) {
      throw new Error("query is required");
    }
    return { query: v.query.trim(), perPage: Math.min(Math.max(v.perPage ?? 8, 1), 20) };
  })
  .handler(async ({ data }) => {
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("search", data.query);
    url.searchParams.set("per-page", String(data.perPage));
    url.searchParams.set(
      "select",
      "id,title,publication_year,doi,primary_location,authorships,abstract_inverted_index,host_venue",
    );
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "ScholarTasks/1.0 (mailto:hello@lovable.dev)" },
    });
    if (!res.ok) throw new Error(`OpenAlex error: ${res.status}`);
    const json = (await res.json()) as { results?: any[] };
    const results: ArticleHit[] = (json.results ?? []).map((w: any) => {
      const authors: string[] = (w.authorships ?? [])
        .map((a: any) => a?.author?.display_name)
        .filter(Boolean);
      const journal =
        w.host_venue?.display_name ?? w.primary_location?.source?.display_name ?? null;
      const landing = w.primary_location?.landing_page_url ?? null;
      const doi: string | null = w.doi
        ? String(w.doi).replace(/^https?:\/\/doi\.org\//, "")
        : null;
      // Reconstruct abstract from inverted index
      let abstract: string | null = null;
      const inv = w.abstract_inverted_index as Record<string, number[]> | undefined;
      if (inv) {
        const words: string[] = [];
        for (const [word, positions] of Object.entries(inv)) {
          for (const p of positions) words[p] = word;
        }
        abstract = words.filter(Boolean).join(" ");
      }
      return {
        title: w.title ?? "Untitled",
        authors,
        year: w.publication_year ?? null,
        journal,
        doi,
        url: landing ?? (doi ? `https://doi.org/${doi}` : null),
        abstract,
        source: "OpenAlex",
      };
    });
    return { results };
  });

export const saveReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = input as { taskId: string; article: ArticleHit };
    if (!v?.taskId || !v?.article?.title) throw new Error("taskId and article required");
    return v;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { article, taskId } = data;
    const { data: row, error } = await supabase
      .from("references")
      .insert({
        task_id: taskId,
        user_id: userId,
        title: article.title,
        authors: article.authors ?? [],
        year: article.year,
        journal: article.journal,
        doi: article.doi,
        url: article.url,
        abstract: article.abstract,
        source: article.source ?? "OpenAlex",
        selected: true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const exportReferencesDocx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = input as { taskId: string; templateId?: string };
    if (!v?.taskId) throw new Error("taskId required");
    return v;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: task }, refsRes, tplRes] = await Promise.all([
      supabase.from("tasks").select("title").eq("id", data.taskId).eq("user_id", userId).maybeSingle(),
      supabase
        .from("references")
        .select("*")
        .eq("task_id", data.taskId)
        .eq("user_id", userId)
        .eq("selected", true)
        .order("created_at"),
      data.templateId
        ? supabase.from("reference_templates").select("*").eq("id", data.templateId).eq("user_id", userId).maybeSingle()
        : supabase.from("reference_templates").select("*").eq("user_id", userId).eq("is_default", true).maybeSingle(),
    ]);
    const refs = refsRes.data ?? [];
    const template = tplRes.data?.format ?? "{authors} ({year}). {title}. {journal}. {doi}";
    const { applyTemplate } = await import("./cite");
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");
    const heading = new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "References", bold: true })],
    });
    const sub = new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: task?.title ?? "Research Task", italics: true })],
    });
    const body = refs.map(
      (r) =>
        new Paragraph({
          spacing: { after: 200 },
          indent: { left: 720, hanging: 720 },
          children: [new TextRun(applyTemplate(template, r as any))],
        }),
    );
    const doc = new Document({
      styles: { default: { document: { run: { font: "Calibri", size: 24 } } } },
      sections: [
        {
          properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
          children: [heading, sub, ...body],
        },
      ],
    });
    const buffer = await Packer.toBase64String(doc);
    return { base64: buffer, filename: `references-${(task?.title ?? "task").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.docx`, count: refs.length };
  });