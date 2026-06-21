export type ReferenceRecord = {
  title: string | null;
  authors: string[] | null;
  year: number | null;
  journal: string | null;
  doi: string | null;
  url: string | null;
  abstract?: string | null;
  source?: string | null;
};

export function formatAuthors(authors: string[] | null | undefined) {
  if (!authors || authors.length === 0) return "";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors.slice(0, -1).join(", ")} & ${authors[authors.length - 1]}`;
}

export function applyTemplate(template: string, ref: ReferenceRecord): string {
  const values: Record<string, string> = {
    authors: formatAuthors(ref.authors),
    year: ref.year ? String(ref.year) : "n.d.",
    title: ref.title ?? "",
    journal: ref.journal ?? "",
    doi: ref.doi ?? "",
    url: ref.url ?? "",
    abstract: ref.abstract ?? "",
    source: ref.source ?? "",
  };
  return template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
}

export const TEMPLATE_TOKENS = ["authors", "year", "title", "journal", "doi", "url", "source"];