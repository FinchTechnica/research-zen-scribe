import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { bulkExportReferencesDocx } from "@/lib/research.functions";
import { applyTemplate } from "@/lib/cite";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({ meta: [{ title: "Reference Library — ScholarTasks" }] }),
  component: LibraryPage,
});

type Ref = {
  id: string; task_id: string; title: string; authors: string[]; year: number | null;
  journal: string | null; doi: string | null; url: string | null; abstract: string | null;
};
type Task = { id: string; title: string };

function LibraryPage() {
  const [refs, setRefs] = useState<Ref[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [template, setTemplate] = useState("{authors} ({year}). {title}. {journal}. {doi}");
  const [taskFilter, setTaskFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const exportFn = useServerFn(bulkExportReferencesDocx);

  async function load() {
    const [r, t, tpl] = await Promise.all([
      supabase.from("references").select("*").order("created_at", { ascending: false }),
      supabase.from("tasks").select("id, title"),
      supabase.from("reference_templates").select("format").eq("is_default", true).maybeSingle(),
    ]);
    setRefs((r.data as Ref[]) ?? []);
    setTasks((t.data as Task[]) ?? []);
    if (tpl.data?.format) setTemplate(tpl.data.format);
  }
  useEffect(() => { void load(); }, []);

  const taskTitle = (id: string) => tasks.find((t) => t.id === id)?.title ?? "Unknown task";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return refs.filter((r) => {
      if (taskFilter !== "all" && r.task_id !== taskFilter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.authors ?? []).some((a) => a.toLowerCase().includes(q)) ||
        (r.journal ?? "").toLowerCase().includes(q)
      );
    });
  }, [refs, taskFilter, query]);

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function pickAllVisible() {
    setPicked(new Set(visible.map((r) => r.id)));
  }
  function clearPicks() { setPicked(new Set()); }

  async function bulkExport() {
    if (picked.size === 0) return;
    const t = toast.loading("Generating .docx…");
    try {
      const res = await exportFn({ data: { referenceIds: [...picked] } });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.count} reference(s)`, { id: t });
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed", { id: t });
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reference Library</h1>
          <p className="text-sm text-muted-foreground">All saved references across every task. Pick any subset and export a single .docx.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="secondary">{picked.size} selected</Badge>
          <Button variant="outline" size="sm" onClick={pickAllVisible} disabled={visible.length === 0}>Select visible</Button>
          <Button variant="outline" size="sm" onClick={clearPicks} disabled={picked.size === 0}>Clear</Button>
          <Button size="sm" onClick={bulkExport} disabled={picked.size === 0}><Download className="h-4 w-4 mr-2" />Export .docx</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="Search title, author, journal…" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-sm" />
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={taskFilter}
          onChange={(e) => setTaskFilter(e.target.value)}
        >
          <option value="all">All tasks</option>
          {tasks.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
        </select>
      </div>

      {visible.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No references match your filters.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const isPicked = picked.has(r.id);
            return (
              <Card key={r.id} className={isPicked ? "ring-1 ring-primary" : ""}>
                <CardContent className="py-3 flex items-start gap-3">
                  <Checkbox checked={isPicked} onCheckedChange={() => toggle(r.id)} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(r.authors ?? []).slice(0, 3).join(", ")}{(r.authors?.length ?? 0) > 3 ? " et al." : ""}
                      {r.year ? ` · ${r.year}` : ""}{r.journal ? ` · ${r.journal}` : ""}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground/80 mt-1 break-words">{applyTemplate(template, r as any)}</p>
                    <div className="flex gap-2 mt-1.5 items-center">
                      <Link to="/tasks/$taskId" params={{ taskId: r.task_id }} className="text-xs underline text-muted-foreground">
                        {taskTitle(r.task_id)}
                      </Link>
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />open
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}