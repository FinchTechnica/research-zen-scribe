import { Link, useNavigate } from "@tanstack/react-router";
import { ReactNode } from "react";
import { BookOpen, LayoutGrid, Settings, LogOut, Library, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { PalettePicker } from "@/components/palette-picker";
import { Button } from "@/components/ui/button";
import { NotificationsWatcher } from "@/components/notifications-watcher";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }
  return (
    <div className="min-h-screen bg-background relative">
      <NotificationsWatcher />
      <header className="border-b sticky top-0 z-20 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <BookOpen className="h-4 w-4" />
            </div>
            ScholarTasks
          </Link>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/"><LayoutGrid className="h-4 w-4 mr-2" />Tasks</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/library"><Library className="h-4 w-4 mr-2" />Library</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/archive"><Archive className="h-4 w-4 mr-2" />Archive</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/settings"><Settings className="h-4 w-4 mr-2" />Settings</Link>
            </Button>
            <PalettePicker />
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 relative z-10">{children}</main>
    </div>
  );
}