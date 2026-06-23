import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/archive")({
  head: () => ({ meta: [{ title: "Archive — ScholarTasks" }] }),
  component: ArchivePage,
});

type Task = { id: string; title: string; description: string | null; completed: boolean; completed_at: string | null };

function ArchivePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, description, completed, completed_at")
      .eq("archived", true)
      .order("completed_at", { ascending: false });
    setTasks((data as Task[]) ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function unarchive(id: string) {
    await supabase.from("tasks").update({ archived: false }).eq("id", id);
    toast.success("Restored");
    load();
  }
  async function remove(id: string) {
    await supabase.from("tasks").delete().eq("id", id);
    toast.success("Deleted permanently");
    load();
  }

  const filtered = tasks.filter((t) => !q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase()) || (t.description ?? "").toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <AppShell>
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Archive</h1>
      <p className="text-sm text-muted-foreground mb-4">Archived tasks are hidden from the dashboard but their research threads and references stay searchable.</p>
      <Input className="max-w-sm mb-4" placeholder="Search archived tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nothing in the archive.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <Card key={t.id}>
              <CardContent className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <Link to="/tasks/$taskId" params={{ taskId: t.id }} className="block">
                    <p className="font-medium">{t.title} {t.completed && <Badge variant="secondary" className="ml-1">Done</Badge>}</p>
                    {t.description && <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>}
                  </Link>
                </div>
                <Button variant="ghost" size="icon" onClick={() => unarchive(t.id)} aria-label="Restore"><ArchiveRestore className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(t.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}