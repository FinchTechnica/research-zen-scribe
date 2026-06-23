import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type Prefs = {
  browser?: boolean;
  email?: boolean;
  deadline_24h?: boolean;
  deadline_overdue?: boolean;
};

/**
 * Polls user's tasks every 60s and triggers browser notifications when a
 * deadline crosses the 24h mark or becomes overdue. Tracks notified IDs in
 * localStorage so we don't spam on every poll.
 */
export function NotificationsWatcher() {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      if (typeof window === "undefined" || !("Notification" in window)) return;

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("notification_prefs")
        .eq("id", user.id)
        .maybeSingle();
      const prefs = (profile?.notification_prefs as Prefs | null) ?? {
        browser: true,
        deadline_24h: true,
        deadline_overdue: true,
      };
      if (!prefs.browser) return;
      if (Notification.permission !== "granted") return;

      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, deadline, completed, archived")
        .eq("user_id", user.id)
        .eq("completed", false)
        .eq("archived", false)
        .not("deadline", "is", null);
      if (!tasks) return;

      const seenKey = "notified_deadlines";
      const seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) ?? "[]"));
      const now = Date.now();

      for (const t of tasks) {
        if (!t.deadline) continue;
        const ms = new Date(t.deadline).getTime() - now;
        const overdue = ms < 0;
        const within24h = ms > 0 && ms <= 24 * 60 * 60 * 1000;

        if (within24h && prefs.deadline_24h) {
          const key = `24h:${t.id}`;
          if (!seen.has(key)) {
            new Notification("Deadline approaching", {
              body: `${t.title} is due within 24 hours.`,
              tag: key,
            });
            seen.add(key);
          }
        }
        if (overdue && prefs.deadline_overdue) {
          const key = `overdue:${t.id}`;
          if (!seen.has(key)) {
            new Notification("Task overdue", {
              body: `${t.title} is past its deadline.`,
              tag: key,
            });
            seen.add(key);
          }
        }
      }
      localStorage.setItem(seenKey, JSON.stringify([...seen].slice(-200)));
    }

    void tick();
    timer.current = window.setInterval(tick, 60_000) as unknown as number;
    return () => {
      cancelled = true;
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  return null;
}