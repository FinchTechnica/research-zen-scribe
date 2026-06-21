import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SYSTEM = `You are a focused academic research assistant inside a task management app.
Each conversation is scoped to ONE task. Your job:
1. Help the user clarify what publications they need for the task.
2. Use the searchArticles tool to find peer-reviewed sources via OpenAlex.
3. For each result, briefly summarize relevance to the task (2-3 sentences).
4. When the user wants to keep an article, use the saveReference tool to add it to their references list.
5. Be concise, cite years, use markdown lists. Never invent DOIs or papers — only return what tools provide.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          },
        );
        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as { messages: any[]; taskId?: string };
        const { messages, taskId } = body;
        if (!taskId) return new Response("taskId required", { status: 400 });

        // Persist latest user message
        const last = messages[messages.length - 1];
        if (last?.role === "user") {
          await supabase.from("messages").insert({
            task_id: taskId,
            user_id: userId,
            role: "user",
            parts: last.parts ?? [{ type: "text", text: last.content ?? "" }],
          });
        }

        const gateway = createLovableAiGatewayProvider(apiKey);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM,
          messages: convertToModelMessages(messages),
          stopWhen: stepCountIs(50),
          tools: {
            searchArticles: tool({
              description:
                "Search OpenAlex for academic publications. Returns up to 8 articles with title, authors, year, journal, DOI, URL, abstract.",
              inputSchema: z.object({
                query: z.string().describe("Search query, e.g. 'spaced repetition memory retention'"),
              }),
              execute: async ({ query }) => {
                const url = new URL("https://api.openalex.org/works");
                url.searchParams.set("search", query);
                url.searchParams.set("per-page", "8");
                url.searchParams.set(
                  "select",
                  "id,title,publication_year,doi,primary_location,authorships,abstract_inverted_index,host_venue",
                );
                const res = await fetch(url.toString(), {
                  headers: { "User-Agent": "ScholarTasks/1.0" },
                });
                if (!res.ok) return { error: `OpenAlex error ${res.status}`, results: [] };
                const json = (await res.json()) as { results?: any[] };
                const results = (json.results ?? []).map((w: any) => {
                  const authors = (w.authorships ?? [])
                    .map((a: any) => a?.author?.display_name)
                    .filter(Boolean);
                  const journal =
                    w.host_venue?.display_name ?? w.primary_location?.source?.display_name ?? null;
                  const doi = w.doi
                    ? String(w.doi).replace(/^https?:\/\/doi\.org\//, "")
                    : null;
                  let abstract: string | null = null;
                  const inv = w.abstract_inverted_index as Record<string, number[]> | undefined;
                  if (inv) {
                    const words: string[] = [];
                    for (const [word, positions] of Object.entries(inv))
                      for (const p of positions) words[p] = word;
                    abstract = words.filter(Boolean).join(" ").slice(0, 600);
                  }
                  return {
                    title: w.title ?? "Untitled",
                    authors,
                    year: w.publication_year ?? null,
                    journal,
                    doi,
                    url:
                      w.primary_location?.landing_page_url ??
                      (doi ? `https://doi.org/${doi}` : null),
                    abstract,
                    source: "OpenAlex",
                  };
                });
                return { results };
              },
            }),
            saveReference: tool({
              description:
                "Save an article to the current task's reference list. Use exactly the fields returned by searchArticles.",
              inputSchema: z.object({
                title: z.string(),
                authors: z.array(z.string()).default([]),
                year: z.number().nullable().optional(),
                journal: z.string().nullable().optional(),
                doi: z.string().nullable().optional(),
                url: z.string().nullable().optional(),
                abstract: z.string().nullable().optional(),
              }),
              execute: async (article) => {
                const { data, error } = await supabase
                  .from("references")
                  .insert({
                    task_id: taskId,
                    user_id: userId,
                    title: article.title,
                    authors: article.authors ?? [],
                    year: article.year ?? null,
                    journal: article.journal ?? null,
                    doi: article.doi ?? null,
                    url: article.url ?? null,
                    abstract: article.abstract ?? null,
                    source: "OpenAlex",
                    selected: true,
                  })
                  .select()
                  .single();
                if (error) return { ok: false, error: error.message };
                return { ok: true, id: data.id, title: data.title };
              },
            }),
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onFinish: async ({ responseMessage }) => {
            try {
              await supabase.from("messages").insert({
                task_id: taskId,
                user_id: userId,
                role: "assistant",
                parts: responseMessage.parts,
              });
            } catch (e) {
              console.error("Failed to persist assistant message", e);
            }
          },
        });
      },
    },
  },
});