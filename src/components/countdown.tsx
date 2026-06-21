import { useEffect, useState } from "react";

function diff(deadline: Date) {
  const ms = deadline.getTime() - Date.now();
  const past = ms < 0;
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  return { past, d, h, m, s };
}

export function Countdown({ deadline, compact = false }: { deadline: string; compact?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const d = new Date(deadline);
  const { past, d: dd, h, m, s } = diff(d);
  const label = past ? "overdue by" : "due in";
  const parts = dd > 0 ? `${dd}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  return (
    <span
      className={
        "tabular-nums text-xs font-medium " +
        (past ? "text-destructive" : compact ? "text-muted-foreground" : "text-primary")
      }
    >
      {label} {parts}
    </span>
  );
}