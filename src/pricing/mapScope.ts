/**
 * Turn validated AI scope into priced line items.
 *
 * Guardrails live here:
 *   • a SKU the model returns that isn't in the catalog → flagged "unmapped" at $0
 *   • missing/zero/NaN quantity → flagged "missing_quantity"
 *   • per-item confidence below threshold → flagged "low_confidence"
 *   • unmapped observations → $0 lines for Marcus to price
 *
 * overallConfidence is pessimistic (min across mapped items) to surface the
 * weakest link, and needsReviewReason summarizes why the human gate is required.
 */
import { computeLineTotalCents } from "./compute.ts";
import type {
  CatalogLookup,
  PricedLineItem,
  PricingSettings,
  ScopeResult,
} from "./types.ts";

export interface MapResult {
  items: PricedLineItem[];
  overallConfidence: number;
  needsReviewReason: string | null;
}

export function mapScopeToLineItems(
  scope: ScopeResult,
  catalog: ReadonlyArray<CatalogLookup>,
  settings: PricingSettings,
): MapResult {
  const bySku = new Map(catalog.map((c) => [c.sku, c]));
  const items: PricedLineItem[] = [];
  let sort = 0;

  for (const li of scope.lineItems ?? []) {
    const cat = bySku.get(li.sku);

    // Hallucinated / unknown SKU → never trust it; surface for manual pricing.
    if (!cat) {
      items.push({
        catalogSku: null,
        name: li.sku, // show what the model claimed
        unit: li.unit || "each",
        quantity: Number.isFinite(li.quantity) && li.quantity > 0 ? li.quantity : 0,
        unitPriceCents: 0,
        marginPct: 0,
        lineTotalCents: 0,
        taxable: true,
        confidence: li.confidence ?? null,
        isFlagged: true,
        flagReason: "unmapped",
        source: "ai",
        notes: li.rationale ?? "AI referenced a SKU not in the catalog — set a price.",
        sortOrder: sort++,
      });
      continue;
    }

    const qtyMissing = !Number.isFinite(li.quantity) || li.quantity <= 0;
    const quantity = qtyMissing ? 0 : li.quantity;
    const lineTotalCents = computeLineTotalCents(quantity, cat.unitPriceCents, cat.defaultMarginPct);
    const lowConf = (li.confidence ?? 0) < settings.lowConfidenceThreshold;

    const flagReason = qtyMissing ? "missing_quantity" : lowConf ? "low_confidence" : null;
    items.push({
      catalogSku: cat.sku,
      name: cat.name,
      unit: cat.unit,
      quantity,
      unitPriceCents: cat.unitPriceCents,
      marginPct: cat.defaultMarginPct,
      lineTotalCents,
      taxable: cat.taxable,
      confidence: li.confidence ?? null,
      isFlagged: flagReason !== null,
      flagReason,
      source: "ai",
      notes: li.rationale ?? null,
      sortOrder: sort++,
    });
  }

  // Things the AI saw but couldn't map → $0 lines for Marcus to complete.
  for (const u of scope.unmapped ?? []) {
    items.push({
      catalogSku: null,
      name: u.observation,
      unit: u.suggestedUnit || "each",
      quantity: Number.isFinite(u.estQuantity ?? NaN) ? (u.estQuantity as number) : 0,
      unitPriceCents: 0,
      marginPct: 0,
      lineTotalCents: 0,
      taxable: true,
      confidence: null,
      isFlagged: true,
      flagReason: "unmapped",
      source: "ai",
      notes: "AI could not match this to the catalog — add a SKU and price.",
      sortOrder: sort++,
    });
  }

  const mapped = items.filter((i) => i.catalogSku !== null);
  const overallConfidence = mapped.length
    ? Math.min(...mapped.map((i) => i.confidence ?? 1))
    : 0;

  let needsReviewReason: string | null = null;
  if (items.length === 0) needsReviewReason = "no_scope_found";
  else if (items.some((i) => i.flagReason === "unmapped")) needsReviewReason = "unmapped_items";
  else if (overallConfidence < settings.lowConfidenceThreshold) needsReviewReason = "low_confidence";

  return { items, overallConfidence, needsReviewReason };
}
