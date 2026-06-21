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
import { Trash2, Plus } from "lucide-react";
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

function SettingsPage() {
  const [cats, setCats] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [tplId, setTplId] = useState<string | null>(null);
  const [format, setFormat] = useState("");

  async function load() {
    const [c, t] = await Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("reference_templates").select("*").eq("is_default", true).maybeSingle(),
    ]);
    setCats(c.data ?? []);
    if (t.data) { setTplId(t.data.id); setFormat(t.data.format); }
  }
  useEffect(() => { void load(); }, []);

  async function addCat() {
    if (!name.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("categories").insert({ user_id: user.id, name: name.trim(), color });
    if (error) return toast.error(error.message);
    setName(""); load();
  }
  async function delCat(id: string) {
    await supabase.from("categories").delete().eq("id", id);
    load();
  }
  async function saveTpl() {
    if (!tplId) return;
    const { error } = await supabase.from("reference_templates").update({ format }).eq("id", tplId);
    if (error) return toast.error(error.message);
    toast.success("Template saved");
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-semibold tracking-tight mb-6">Settings</h1>
      <div className="grid lg:grid-cols-2 gap-6">
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
      </div>
    </AppShell>
  );
}