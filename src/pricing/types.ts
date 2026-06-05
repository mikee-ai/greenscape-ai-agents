/**
 * Canonical data shapes for scope → pricing. These are pure data types with no
 * dependency on the AI or DB layers; the AI layer validates model output INTO
 * `ScopeResult`, and the pricing engine turns it into `PricedLineItem[]`.
 */

/** One catalog-mapped item the AI extracted from the site-walk notes. */
export interface ScopeLineItem {
  sku: string;
  quantity: number;
  unit: string;
  confidence: number; // 0..1
  rationale?: string;
}

/** Something the AI noticed but could not confidently map to a catalog SKU. */
export interface UnmappedItem {
  observation: string;
  suggestedUnit?: string;
  estQuantity?: number;
}

/** Validated output of the extraction step. */
export interface ScopeResult {
  lineItems: ScopeLineItem[];
  unmapped: UnmappedItem[];
  specialConditions: string[];
}

/** Minimal catalog fields the pricing engine needs (subset of CatalogItem). */
export interface CatalogLookup {
  sku: string;
  name: string;
  unit: string;
  unitPriceCents: number;
  defaultMarginPct: number;
  taxable: boolean;
}

/** A priced line ready to persist to proposal_line_items. */
export interface PricedLineItem {
  catalogSku: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  marginPct: number;
  lineTotalCents: number;
  taxable: boolean;
  confidence: number | null;
  isFlagged: boolean;
  flagReason: FlagReason | null;
  source: "ai" | "manual";
  notes: string | null;
  sortOrder: number;
}

export type FlagReason = "unmapped" | "low_confidence" | "missing_quantity" | "price_overridden";

/** Settings the pricing math depends on. */
export interface PricingSettings {
  taxRateBps: number; // e.g. 860 = 8.6%
  depositPct: number; // e.g. 50
  renderThresholdCents: number; // e.g. 3_000_000 = $30k
  lowConfidenceThreshold: number; // e.g. 0.7
}

export interface Totals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  needsRender: boolean;
}
