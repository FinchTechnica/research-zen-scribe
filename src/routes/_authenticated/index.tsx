import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FileText, LayoutGrid, Columns, Archive } from "lucide-react";
import { Countdown } from "@/components/countdown";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Tasks — ScholarTasks" }] }),
  component: Dashboard,
});

type Task = {
  id: string; title: string; description: string | null; deadline: string | null;
  completed: boolean; category_id: string | null; created_at: string; archived: boolean;
};
type Category = { id: string; name: string; color: string };
type RefCount = Record<string, number>;

type View = "list" | "kanban";
type Sort = "newest" | "deadline" | "refs";

function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [refCounts, setRefCounts] = useState<RefCount>({});
  const [filter, setFilter] = useState<string>("all");
  const [view, setView] = useState<View>(() => (typeof window !== "undefined" && (localStorage.getItem("task_view") as View)) || "list");
  const [sort, setSort] = useState<Sort>("newest");
  const [open, setOpen] = useState(false);

  async function load() {
    const [t, c, refs] = await Promise.all([
      supabase.from("tasks").select("*").eq("archived", false).order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("name"),
      supabase.from("references").select("task_id"),
    ]);
    setTasks((t.data as Task[]) ?? []);
    setCats((c.data as Category[]) ?? []);
    const counts: RefCount = {};
    for (const r of (refs.data ?? []) as { task_id: string }[]) {
      counts[r.task_id] = (counts[r.task_id] ?? 0) + 1;
    }
    setRefCounts(counts);
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("task_view", view); }, [view]);

  async function toggle(t: Task) {
    await supabase.from("tasks").update({ completed: !t.completed, completed_at: !t.completed ? new Date().toISOString() : null }).eq("id", t.id);
    load();
  }
  async function remove(id: string) {
    await supabase.from("tasks").delete().eq("id", id);
    load();
  }
  async function archive(id: string) {
    await supabase.from("tasks").update({ archived: true }).eq("id", id);
    toast.success("Archived");
    load();
  }

  const filtered = useMemo(() => {
    let xs = tasks.filter((t) =>
      filter === "all" ? true : filter === "active" ? !t.completed : filter === "done" ? t.completed : t.category_id === filter,
    );
    if (sort === "deadline") {
      xs = [...xs].sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
    } else if (sort === "refs") {
      xs = [...xs].sort((a, b) => (refCounts[b.id] ?? 0) - (refCounts[a.id] ?? 0));
    }
    return xs;
  }, [tasks, filter, sort, refCounts]);

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Research Tasks</h1>
          <p className="text-sm text-muted-foreground">Plan tasks and let the agent source academic articles for you.</p>
        </div>
        <NewTaskDialog open={open} onOpenChange={setOpen} cats={cats} onCreated={load} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {[
          { id: "all", label: "All" },
          { id: "active", label: "Active" },
          { id: "done", label: "Done" },
        ].map((f) => (
          <Button key={f.id} size="sm" variant={filter === f.id ? "default" : "outline"} onClick={() => setFilter(f.id)}>{f.label}</Button>
        ))}
        {cats.map((c) => (
          <Button key={c.id} size="sm" variant={filter === c.id ? "default" : "outline"} onClick={() => setFilter(c.id)}>
            <span className="h-2 w-2 rounded-full mr-2" style={{ background: c.color }} />{c.name}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="deadline">Closest deadline</SelectItem>
              <SelectItem value="refs">Most references</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex rounded-md border bg-background">
            <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" className="rounded-r-none" onClick={() => setView("list")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={view === "kanban" ? "secondary" : "ghost"} size="sm" className="rounded-l-none" onClick={() => setView("kanban")}>
              <Columns className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No tasks yet. Create one to get started.</CardContent></Card>
      ) : view === "kanban" ? (
        <KanbanBoard tasks={filtered} cats={cats} refCounts={refCounts} onToggle={toggle} />
      ) : (
        <div className="grid gap-3">
          {filtered.map((t) => (
            <TaskRow key={t.id} t={t} cats={cats} refs={refCounts[t.id] ?? 0} onToggle={() => toggle(t)} onArchive={() => archive(t.id)} onDelete={() => remove(t.id)} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function TaskRow({ t, cats, refs, onToggle, onArchive, onDelete }: { t: Task; cats: Category[]; refs: number; onToggle: () => void; onArchive: () => void; onDelete: () => void }) {
  const cat = cats.find((c) => c.id === t.category_id);
  return (
    <Card className={t.completed ? "opacity-60" : ""}>
      <CardContent className="py-4 flex items-start gap-3">
        <Checkbox checked={t.completed} onCheckedChange={onToggle} className="mt-1" />
        <div className="flex-1 min-w-0">
          <Link to="/tasks/$taskId" params={{ taskId: t.id }} className="block">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={"font-medium " + (t.completed ? "line-through" : "")}>{t.title}</h3>
              {cat && <Badge variant="secondary" style={{ borderColor: cat.color }}>{cat.name}</Badge>}
              {refs > 0 && <Badge variant="outline">{refs} ref{refs === 1 ? "" : "s"}</Badge>}
            </div>
            {t.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{t.description}</p>}
            <div className="mt-2 flex gap-3 items-center">
              {t.deadline && !t.completed && <Countdown deadline={t.deadline} />}
              <span className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" />Open research</span>
            </div>
          </Link>
        </div>
        <Button variant="ghost" size="icon" onClick={onArchive} aria-label="Archive"><Archive className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
      </CardContent>
    </Card>
  );
}

function KanbanBoard({ tasks, cats, refCounts, onToggle }: { tasks: Task[]; cats: Category[]; refCounts: RefCount; onToggle: (t: Task) => void }) {
  const now = Date.now();
  const columns: { id: string; title: string; items: Task[] }[] = [
    { id: "overdue", title: "Overdue", items: [] },
    { id: "soon", title: "Due ≤ 24h", items: [] },
    { id: "later", title: "Upcoming", items: [] },
    { id: "none", title: "No deadline", items: [] },
    { id: "done", title: "Done", items: [] },
  ];
  for (const t of tasks) {
    if (t.completed) { columns[4].items.push(t); continue; }
    if (!t.deadline) { columns[3].items.push(t); continue; }
    const ms = new Date(t.deadline).getTime() - now;
    if (ms < 0) columns[0].items.push(t);
    else if (ms <= 24 * 3600 * 1000) columns[1].items.push(t);
    else columns[2].items.push(t);
  }
  return (
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
      {columns.map((col) => (
        <div key={col.id} className="bg-muted/40 rounded-lg p-2 min-h-[200px]">
          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between">
            {col.title}
            <span className="text-[10px] rounded-full bg-background px-1.5">{col.items.length}</span>
          </div>
          <div className="space-y-2 mt-1">
            {col.items.map((t) => {
              const cat = cats.find((c) => c.id === t.category_id);
              return (
                <Card key={t.id} className={t.completed ? "opacity-60" : ""}>
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-start gap-2">
                      <Checkbox checked={t.completed} onCheckedChange={() => onToggle(t)} className="mt-0.5" />
                      <Link to="/tasks/$taskId" params={{ taskId: t.id }} className="flex-1 min-w-0">
                        <p className={"text-sm font-medium leading-snug " + (t.completed ? "line-through" : "")}>{t.title}</p>
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center pl-6">
                      {cat && <Badge variant="secondary" className="text-[10px]" style={{ borderColor: cat.color }}>{cat.name}</Badge>}
                      {(refCounts[t.id] ?? 0) > 0 && <Badge variant="outline" className="text-[10px]">{refCounts[t.id]} refs</Badge>}
                      {t.deadline && !t.completed && <Countdown deadline={t.deadline} compact />}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function NewTaskDialog({ open, onOpenChange, cats, onCreated }: { open: boolean; onOpenChange: (b: boolean) => void; cats: Category[]; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [deadline, setDeadline] = useState("");

  async function create() {
    if (!title.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("tasks").insert({
      user_id: user.id,
      title: title.trim(),
      description: description || null,
      category_id: categoryId === "none" ? null : categoryId,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    });
    if (error) { console.error(error); return toast.error("Could not create task."); }
    toast.success("Task created");
    setTitle(""); setDescription(""); setDeadline(""); setCategoryId("none");
    onOpenChange(false); onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New task</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New research task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Literature review: spaced repetition" /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What are you researching?" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Deadline</Label><Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}