/** Money formatting helpers (cents ↔ dollars). Pure; used in UI + tests. */

export function formatCents(cents: number | null | undefined): string {
  const dollars = (cents ?? 0) / 100;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Compact form for stat tiles, e.g. $784k, $1.2M. */
export function formatCentsCompact(cents: number | null | undefined): string {
  const d = (cents ?? 0) / 100;
  if (Math.abs(d) >= 1_000_000) return `$${(d / 1_000_000).toFixed(d % 1_000_000 === 0 ? 0 : 1)}M`;
  if (Math.abs(d) >= 1_000) return `$${Math.round(d / 1_000)}k`;
  return `$${Math.round(d)}`;
}

export const dollarsToCents = (d: number): number => Math.round(d * 100);
export const centsToDollars = (c: number): number => c / 100;
