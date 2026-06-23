import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/countdown";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Send, Download, ExternalLink, Trash2, Loader2, Archive, Plus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { exportReferencesDocx } from "@/lib/research.functions";
import { applyTemplate } from "@/lib/cite";

export const Route = createFileRoute("/_authenticated/tasks/$taskId")({
  head: () => ({ meta: [{ title: "Research — ScholarTasks" }] }),
  component: TaskPage,
});

type RefRow = {
  id: string; title: string; authors: string[]; year: number | null; journal: string | null;
  doi: string | null; url: string | null; abstract: string | null; selected: boolean;
};

type Subtask = { id: string; title: string; completed: boolean };

function TaskPage() {
  const { taskId } = Route.useParams();
  const [task, setTask] = useState<any>(null);
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSub, setNewSub] = useState("");
  const [template, setTemplate] = useState<string>("{authors} ({year}). {title}. {journal}. {doi}");
  const [initialMessages, setInitialMessages] = useState<any[] | null>(null);
  const exportFn = useServerFn(exportReferencesDocx);

  async function loadAll() {
    const [{ data: t }, { data: rs }, { data: st }, { data: tpl }, { data: { session } }] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", taskId).maybeSingle(),
      supabase.from("references").select("*").eq("task_id", taskId).order("created_at"),
      supabase.from("subtasks").select("id, title, completed").eq("task_id", taskId).order("position").order("created_at"),
      supabase.from("reference_templates").select("format").eq("is_default", true).maybeSingle(),
      supabase.auth.getSession(),
    ]);
    setTask(t);
    setRefs((rs as RefRow[]) ?? []);
    setSubtasks((st as Subtask[]) ?? []);
    if (tpl?.format) setTemplate(tpl.format);

    const { data: msgs } = await supabase
      .from("messages").select("*").eq("task_id", taskId).order("created_at");
    const hydrated = (msgs ?? []).map((m: any) => ({
      id: m.id,
      role: m.role,
      parts: Array.isArray(m.parts) ? m.parts : [{ type: "text", text: String(m.parts) }],
    }));
    setInitialMessages(hydrated);
    void session;
  }
  useEffect(() => { void loadAll(); }, [taskId]);

  async function refreshRefs() {
    const { data } = await supabase.from("references").select("*").eq("task_id", taskId).order("created_at");
    setRefs((data as RefRow[]) ?? []);
  }
  async function toggleRef(r: RefRow) {
    await supabase.from("references").update({ selected: !r.selected }).eq("id", r.id);
    refreshRefs();
  }
  async function deleteRef(id: string) {
    await supabase.from("references").delete().eq("id", id);
    refreshRefs();
  }

  async function addSubtask() {
    const title = newSub.trim();
    if (!title) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("subtasks").insert({
      task_id: taskId, user_id: user.id, title, position: subtasks.length,
    });
    if (error) { console.error(error); return toast.error("Could not add subtask."); }
    setNewSub("");
    loadAll();
  }
  async function toggleSub(s: Subtask) {
    await supabase.from("subtasks").update({ completed: !s.completed }).eq("id", s.id);
    setSubtasks((xs) => xs.map((x) => (x.id === s.id ? { ...x, completed: !x.completed } : x)));
  }
  async function delSub(id: string) {
    await supabase.from("subtasks").delete().eq("id", id);
    setSubtasks((xs) => xs.filter((x) => x.id !== id));
  }
  async function archiveTask() {
    await supabase.from("tasks").update({ archived: true }).eq("id", taskId);
    toast.success("Archived");
  }

  async function exportDocx() {
    const t = toast.loading("Generating .docx…");
    try {
      const res = await exportFn({ data: { taskId } });
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
      toast.error(e.message ?? "Export failed", { id: t });
    }
  }

  if (!task || initialMessages === null) {
    return <AppShell><div className="text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm"><Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />All tasks</Link></Button>
      </div>
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl">{task.title}</CardTitle>
                  {task.description && <p className="text-sm text-muted-foreground mt-1">{task.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {task.deadline && !task.completed && <Countdown deadline={task.deadline} />}
                  <Button variant="ghost" size="sm" onClick={archiveTask}><Archive className="h-4 w-4 mr-1" />Archive</Button>
                </div>
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Subtasks <Badge variant="secondary" className="ml-1">{subtasks.filter((s) => s.completed).length}/{subtasks.length}</Badge></CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }} placeholder="Add a subtask…" />
                <Button size="icon" onClick={addSubtask} aria-label="Add subtask"><Plus className="h-4 w-4" /></Button>
              </div>
              {subtasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No subtasks yet.</p>
              ) : (
                <ul className="space-y-1">
                  {subtasks.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 group">
                      <Checkbox checked={s.completed} onCheckedChange={() => toggleSub(s)} />
                      <span className={"flex-1 text-sm " + (s.completed ? "line-through text-muted-foreground" : "")}>{s.title}</span>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100" onClick={() => delSub(s.id)} aria-label="Delete subtask"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Chat taskId={taskId} initialMessages={initialMessages} onActivity={refreshRefs} />
        </div>
        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">References <Badge variant="secondary">{refs.length}</Badge></h2>
            <Button size="sm" onClick={exportDocx} disabled={refs.filter(r => r.selected).length === 0}>
              <Download className="h-4 w-4 mr-2" />Export .docx
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Selected entries are written with your template (edit it in Settings).</p>
          {refs.length === 0 && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Ask the agent to find sources for this task.</CardContent></Card>
          )}
          {refs.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-3">
                <div className="flex items-start gap-2">
                  <Checkbox checked={r.selected} onCheckedChange={() => toggleRef(r)} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{(r.authors ?? []).slice(0, 3).join(", ")}{r.authors && r.authors.length > 3 ? " et al." : ""} {r.year ? `· ${r.year}` : ""} {r.journal ? `· ${r.journal}` : ""}</p>
                    <p className="text-[11px] text-muted-foreground/80 mt-2 font-mono break-words">{applyTemplate(template, r as any)}</p>
                    <div className="flex gap-1 mt-2">
                      {r.url && <Button asChild variant="ghost" size="sm"><a href={r.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 mr-1" />Open</a></Button>}
                      <Button variant="ghost" size="sm" onClick={() => deleteRef(r.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </aside>
      </div>
    </AppShell>
  );
}

function Chat({ taskId, initialMessages, onActivity }: { taskId: string; initialMessages: any[]; onActivity: () => void }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { messages, sendMessage, status } = useChat({
    id: taskId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { taskId },
      fetch: async (input, init) => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const headers = new Headers(init?.headers);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    }),
    onFinish: () => onActivity(),
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || status === "submitted" || status === "streaming") return;
    setInput("");
    sendMessage({ text });
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <Card className="flex flex-col h-[calc(100vh-260px)] min-h-[480px]">
      <CardHeader className="border-b">
        <CardTitle className="text-base">Research Agent</CardTitle>
      </CardHeader>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-12">
            Ask the agent to find papers, e.g. <em>"Find recent reviews on spaced repetition in medical education"</em>.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={"flex " + (m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={"max-w-[85%] rounded-2xl px-4 py-2.5 text-sm " + (m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {m.parts.map((p: any, i: number) => {
                if (p.type === "text") {
                  return (
                    <div key={i} className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{p.text}</ReactMarkdown>
                    </div>
                  );
                }
                if (p.type?.startsWith?.("tool-")) {
                  const name = p.type.replace("tool-", "");
                  const state = p.state;
                  return (
                    <div key={i} className="my-1 text-xs italic opacity-80 flex items-center gap-2">
                      {state !== "output-available" && <Loader2 className="h-3 w-3 animate-spin" />}
                      {name === "searchArticles" ? "Searching OpenAlex…" : name === "saveReference" ? "Saving reference…" : `Using ${name}…`}
                      {state === "output-available" && " ✓"}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
        {(status === "submitted" || status === "streaming") && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start"><div className="bg-muted rounded-2xl px-4 py-2.5 text-sm flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Thinking…</div></div>
        )}
      </div>
      <form onSubmit={submit} className="border-t p-3 flex gap-2">
        <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask for papers, summaries, or to save a reference…" autoFocus />
        <Button type="submit" size="icon" disabled={!input.trim() || status === "streaming" || status === "submitted"}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}