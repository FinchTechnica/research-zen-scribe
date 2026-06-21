import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Plus, Trash2, FileText } from "lucide-react";
import { Countdown } from "@/components/countdown";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Tasks — ScholarTasks" }] }),
  component: Dashboard,
});

type Task = {
  id: string; title: string; description: string | null; deadline: string | null;
  completed: boolean; category_id: string | null; created_at: string;
};
type Category = { id: string; name: string; color: string };

function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);

  async function load() {
    const [t, c] = await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("name"),
    ]);
    setTasks((t.data as Task[]) ?? []);
    setCats((c.data as Category[]) ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function toggle(t: Task) {
    await supabase.from("tasks").update({ completed: !t.completed, completed_at: !t.completed ? new Date().toISOString() : null }).eq("id", t.id);
    load();
  }
  async function remove(id: string) {
    await supabase.from("tasks").delete().eq("id", id);
    load();
  }

  const filtered = tasks.filter((t) =>
    filter === "all" ? true : filter === "active" ? !t.completed : filter === "done" ? t.completed : t.category_id === filter,
  );

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Research Tasks</h1>
          <p className="text-sm text-muted-foreground">Plan tasks and let the agent source academic articles for you.</p>
        </div>
        <NewTaskDialog open={open} onOpenChange={setOpen} cats={cats} onCreated={load} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
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
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No tasks yet. Create one to get started.</CardContent></Card>
        )}
        {filtered.map((t) => {
          const cat = cats.find((c) => c.id === t.category_id);
          return (
            <Card key={t.id} className={t.completed ? "opacity-60" : ""}>
              <CardContent className="py-4 flex items-start gap-3">
                <Checkbox checked={t.completed} onCheckedChange={() => toggle(t)} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <Link to="/tasks/$taskId" params={{ taskId: t.id }} className="block">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={"font-medium " + (t.completed ? "line-through" : "")}>{t.title}</h3>
                      {cat && <Badge variant="secondary" style={{ borderColor: cat.color }}>{cat.name}</Badge>}
                    </div>
                    {t.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{t.description}</p>}
                    <div className="mt-2 flex gap-3 items-center">
                      {t.deadline && !t.completed && <Countdown deadline={t.deadline} />}
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" />Open research</span>
                    </div>
                  </Link>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(t.id)} aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
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
    if (error) return toast.error(error.message);
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