/**
 * Model selection + cost accounting.
 *
 *   • Extraction  → Haiku 4.5: cheap, structured entity-extraction against a
 *                   provided catalog. The catalog dominates input tokens, so
 *                   sending it to Sonnet on every lead would be wasteful.
 *   • Drafting    → Sonnet 4.6: customer-facing prose for a premium brand on
 *                   $28k average deals; quality is visible, so pay for it.
 *   • Reactivation→ Sonnet 4.6: authentic, personal voice is the whole point.
 */
export const MODELS = {
  extract: "claude-haiku-4-5",
  draft: "claude-sonnet-4-6",
  reactivate: "claude-sonnet-4-6",
} as const;

// USD per million tokens.
export const PRICING: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
};

export interface Usage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheCreate?: number;
}

/** Integer cents for one call, accounting for cache read (0.1×) / write (1.25×). */
export function costCents(model: string, u: Usage): number {
  const p = PRICING[model] ?? { in: 3, out: 15 };
  const dollars =
    (u.input * p.in +
      (u.cacheRead ?? 0) * p.in * 0.1 +
      (u.cacheCreate ?? 0) * p.in * 1.25 +
      u.output * p.out) /
    1_000_000;
  return Math.round(dollars * 100);
}
