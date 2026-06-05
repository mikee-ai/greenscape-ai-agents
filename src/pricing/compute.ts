/**
 * Deterministic pricing engine — the single source of truth for money.
 *
 * The LLM never computes a price. It only decides WHICH catalog items apply and
 * HOW MUCH of each; every dollar below is a pure function of integer cents.
 * This module has zero I/O and zero LLM dependency, so it is exhaustively
 * unit-testable and impossible for a model to corrupt.
 */
import type { PricingSettings, Totals } from "./types.ts";

/** line total = quantity × unit cost × (1 + margin), rounded to whole cents. */
export function computeLineTotalCents(
  quantity: number,
  unitPriceCents: number,
  marginPct: number,
): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPriceCents) || !Number.isFinite(marginPct)) {
    return 0;
  }
  if (quantity <= 0 || unitPriceCents <= 0) return 0;
  return Math.round(quantity * unitPriceCents * (1 + marginPct));
}

/** Roll up line items into subtotal / tax / total / deposit (+ render flag). */
export function computeTotals(
  items: ReadonlyArray<{ lineTotalCents: number; taxable: boolean }>,
  settings: PricingSettings,
): Totals {
  const subtotalCents = items.reduce((sum, i) => sum + (i.lineTotalCents || 0), 0);
  const taxableBase = items
    .filter((i) => i.taxable)
    .reduce((sum, i) => sum + (i.lineTotalCents || 0), 0);

  const taxCents = Math.round((taxableBase * settings.taxRateBps) / 10_000);
  const totalCents = subtotalCents + taxCents;
  const depositCents = Math.round((totalCents * settings.depositPct) / 100);
  const needsRender = totalCents >= settings.renderThresholdCents;

  return { subtotalCents, taxCents, totalCents, depositCents, needsRender };
}
