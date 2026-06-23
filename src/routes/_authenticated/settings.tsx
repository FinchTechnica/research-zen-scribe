import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Bell } from "lucide-react";
import { toast } from "sonner";
import { applyTemplate, TEMPLATE_TOKENS } from "@/lib/cite";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — ScholarTasks" }] }),
  component: SettingsPage,
});

const SAMPLE = {
  title: "Spaced retrieval and long-term retention",
  authors: ["Karpicke, J. D.", "Roediger, H. L."],
  year: 2008,
  journal: "Science",
  doi: "10.1126/science.1152408",
  url: "https://doi.org/10.1126/science.1152408",
};

type Prefs = { browser: boolean; email: boolean; deadline_24h: boolean; deadline_overdue: boolean };
type Feedback = { id: string; submission_number: number; kind: string; subject: string; message: string; status: string; created_at: string };

function SettingsPage() {
  const [cats, setCats] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [tplId, setTplId] = useState<string | null>(null);
  const [format, setFormat] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [prefs, setPrefs] = useState<Prefs>({ browser: true, email: false, deadline_24h: true, deadline_overdue: true });
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [fbKind, setFbKind] = useState("feedback");
  const [fbSubject, setFbSubject] = useState("");
  const [fbMessage, setFbMessage] = useState("");

  async function load() {
    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user?.email) setEmail(userRes.user.email);
    const [c, t, p, f] = await Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("reference_templates").select("*").eq("is_default", true).maybeSingle(),
      supabase.from("profiles").select("full_name, notification_prefs").eq("id", userRes.user?.id ?? "").maybeSingle(),
      supabase.from("feedback").select("*").order("submission_number", { ascending: false }),
    ]);
    setCats(c.data ?? []);
    if (t.data) { setTplId(t.data.id); setFormat(t.data.format); }
    if (p.data) {
      setFullName(p.data.full_name ?? "");
      const np = p.data.notification_prefs as Partial<Prefs> | null;
      if (np) setPrefs({ browser: !!np.browser, email: !!np.email, deadline_24h: !!np.deadline_24h, deadline_overdue: !!np.deadline_overdue });
    }
    setFeedback((f.data as Feedback[]) ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function addCat() {
    if (!name.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("categories").insert({ user_id: user.id, name: name.trim(), color });
    if (error) { console.error(error); return toast.error("Could not add category."); }
    setName(""); load();
  }
  async function delCat(id: string) {
    await supabase.from("categories").delete().eq("id", id);
    load();
  }
  async function saveTpl() {
    if (!tplId) return;
    const { error } = await supabase.from("reference_templates").update({ format }).eq("id", tplId);
    if (error) { console.error(error); return toast.error("Could not save template."); }
    toast.success("Template saved");
  }

  async function saveProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    if (error) { console.error(error); return toast.error("Could not save profile."); }
    toast.success("Profile saved");
  }

  async function savePrefs(next: Prefs) {
    setPrefs(next);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ notification_prefs: next }).eq("id", user.id);
    if (error) { console.error(error); toast.error("Could not save preferences."); }
  }
  async function enableBrowser() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return toast.error("Browser notifications aren't supported in this browser.");
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return toast.error("Notification permission denied.");
    await savePrefs({ ...prefs, browser: true });
    toast.success("Browser notifications enabled");
  }

  async function submitFeedback() {
    const subject = fbSubject.trim();
    const message = fbMessage.trim();
    if (!subject || !message) return toast.error("Subject and message are required.");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("feedback")
      .insert({ user_id: user.id, subject, message, kind: fbKind })
      .select()
      .single();
    if (error) { console.error(error); return toast.error("Could not submit feedback."); }
    setFbSubject(""); setFbMessage("");
    toast.success(`Submitted (#${data.submission_number})`);
    load();
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-semibold tracking-tight mb-6">Settings</h1>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How you appear in the app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Email</Label><Input value={email} disabled /></div>
            <div><Label>Display name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <Button onClick={saveProfile}>Save profile</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" />Notifications</CardTitle>
            <CardDescription>Get alerted when a task deadline is close or overdue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <PrefRow label="Browser notifications" hint="Sent while the app is open in a tab." checked={prefs.browser} onChange={(v) => v ? enableBrowser() : savePrefs({ ...prefs, browser: false })} />
            <PrefRow label="Email alerts" hint="Coming soon — set up in a follow-up turn." checked={prefs.email} onChange={(v) => savePrefs({ ...prefs, email: v })} disabled />
            <div className="h-px bg-border my-2" />
            <PrefRow label="24 hours before deadline" checked={prefs.deadline_24h} onChange={(v) => savePrefs({ ...prefs, deadline_24h: v })} />
            <PrefRow label="When a task becomes overdue" checked={prefs.deadline_overdue} onChange={(v) => savePrefs({ ...prefs, deadline_overdue: v })} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Organize tasks by topic.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="e.g. Thesis chapter 2" value={name} onChange={(e) => setName(e.target.value)} />
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-14 p-1" />
              <Button onClick={addCat}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-2">
              {cats.map((c) => (
                <div key={c.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: c.color }} />{c.name}</div>
                  <Button variant="ghost" size="icon" onClick={() => delCat(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {cats.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reference template</CardTitle>
            <CardDescription>This format is applied to every selected article in your .docx exports.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label>Template string</Label>
            <Textarea rows={4} value={format} onChange={(e) => setFormat(e.target.value)} className="font-mono text-sm" />
            <div className="flex flex-wrap gap-1">
              {TEMPLATE_TOKENS.map((t) => (
                <Badge key={t} variant="outline" className="cursor-pointer" onClick={() => setFormat((f) => f + `{${t}}`)}>
                  {"{" + t + "}"}
                </Badge>
              ))}
            </div>
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground mb-1">Preview</p>
              <p className="text-sm">{applyTemplate(format || "", SAMPLE as any)}</p>
            </div>
            <Button onClick={saveTpl}>Save template</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Submit feedback</CardTitle>
            <CardDescription>Report an issue or share an idea. Each submission gets a tracking number.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <select className="h-9 rounded-md border bg-background px-3 text-sm col-span-1" value={fbKind} onChange={(e) => setFbKind(e.target.value)}>
                <option value="feedback">Feedback</option>
                <option value="bug">Bug</option>
                <option value="idea">Idea</option>
              </select>
              <Input className="col-span-2" placeholder="Subject" value={fbSubject} onChange={(e) => setFbSubject(e.target.value)} maxLength={200} />
            </div>
            <Textarea placeholder="What happened? What did you expect?" value={fbMessage} onChange={(e) => setFbMessage(e.target.value)} rows={4} maxLength={4000} />
            <Button onClick={submitFeedback}>Submit</Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Your feedback log</CardTitle>
            <CardDescription>A history of every submission, with a per-user tracking number.</CardDescription>
          </CardHeader>
          <CardContent>
            {feedback.length === 0 ? (
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
            ) : (
              <div className="space-y-2">
                {feedback.map((f) => (
                  <div key={f.id} className="border rounded-md p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">#{f.submission_number}</Badge>
                      <Badge variant="secondary">{f.kind}</Badge>
                      <Badge>{f.status}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(f.created_at).toLocaleString()}</span>
                    </div>
                    <p className="font-medium text-sm mt-1.5">{f.subject}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{f.message}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function PrefRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}