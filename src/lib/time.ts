/** Human-friendly time helpers (pure). */

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Whole-hours/days between two timestamps, for cycle-time display. */
export function durationLabel(fromTs: number, toTs: number): string {
  const ms = Math.max(0, toTs - fromTs);
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const hrs = ms / 3_600_000;
  if (hrs < 48) return `${hrs.toFixed(1)} hrs`;
  return `${(ms / 86_400_000).toFixed(1)} days`;
}
