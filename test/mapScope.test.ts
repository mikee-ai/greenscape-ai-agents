import { describe, it, expect } from "vitest";
import { mapScopeToLineItems } from "../src/pricing/mapScope.ts";
import type { CatalogLookup, PricingSettings, ScopeResult } from "../src/pricing/types.ts";

const catalog: CatalogLookup[] = [
  { sku: "PAVER_STD", name: "Paver Patio — Standard", unit: "sqft", unitPriceCents: 1150, defaultMarginPct: 0.35, taxable: true },
  { sku: "FIRE_PIT", name: "Gas Fire Pit", unit: "each", unitPriceCents: 280_000, defaultMarginPct: 0.44, taxable: true },
  { sku: "PERMIT", name: "Permit", unit: "lump", unitPriceCents: 85_000, defaultMarginPct: 0, taxable: false },
];

const settings: PricingSettings = {
  taxRateBps: 860,
  depositPct: 50,
  renderThresholdCents: 3_000_000,
  lowConfidenceThreshold: 0.7,
};

const scope = (partial: Partial<ScopeResult>): ScopeResult => ({
  lineItems: [],
  unmapped: [],
  specialConditions: [],
  ...partial,
});

describe("mapScopeToLineItems", () => {
  it("maps a valid SKU and prices it deterministically", () => {
    const res = mapScopeToLineItems(
      scope({ lineItems: [{ sku: "PAVER_STD", quantity: 600, unit: "sqft", confidence: 0.9 }] }),
      catalog,
      settings,
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0].catalogSku).toBe("PAVER_STD");
    expect(res.items[0].lineTotalCents).toBe(931_500);
    expect(res.items[0].isFlagged).toBe(false);
    expect(res.needsReviewReason).toBeNull();
  });

  it("flags a hallucinated SKU as unmapped at $0 (never invents a price)", () => {
    const res = mapScopeToLineItems(
      scope({ lineItems: [{ sku: "DEFINITELY_FAKE", quantity: 10, unit: "each", confidence: 0.99 }] }),
      catalog,
      settings,
    );
    expect(res.items[0].catalogSku).toBeNull();
    expect(res.items[0].lineTotalCents).toBe(0);
    expect(res.items[0].flagReason).toBe("unmapped");
    expect(res.needsReviewReason).toBe("unmapped_items");
  });

  it("flags missing / zero quantity", () => {
    const res = mapScopeToLineItems(
      scope({ lineItems: [{ sku: "PAVER_STD", quantity: 0, unit: "sqft", confidence: 0.9 }] }),
      catalog,
      settings,
    );
    expect(res.items[0].flagReason).toBe("missing_quantity");
    expect(res.items[0].lineTotalCents).toBe(0);
  });

  it("flags low-confidence items and escalates needsReviewReason", () => {
    const res = mapScopeToLineItems(
      scope({ lineItems: [{ sku: "PAVER_STD", quantity: 600, unit: "sqft", confidence: 0.4 }] }),
      catalog,
      settings,
    );
    expect(res.items[0].flagReason).toBe("low_confidence");
    expect(res.overallConfidence).toBe(0.4);
    expect(res.needsReviewReason).toBe("low_confidence");
  });

  it("includes unmapped observations as $0 lines for manual pricing", () => {
    const res = mapScopeToLineItems(
      scope({
        lineItems: [{ sku: "PAVER_STD", quantity: 600, unit: "sqft", confidence: 0.95 }],
        unmapped: [{ observation: "Remove old hot tub" }],
      }),
      catalog,
      settings,
    );
    expect(res.items).toHaveLength(2);
    const unm = res.items.find((i) => i.name === "Remove old hot tub")!;
    expect(unm.flagReason).toBe("unmapped");
    expect(unm.lineTotalCents).toBe(0);
    expect(res.needsReviewReason).toBe("unmapped_items");
  });

  it("uses the pessimistic min confidence across mapped items", () => {
    const res = mapScopeToLineItems(
      scope({
        lineItems: [
          { sku: "PAVER_STD", quantity: 600, unit: "sqft", confidence: 0.95 },
          { sku: "FIRE_PIT", quantity: 1, unit: "each", confidence: 0.8 },
        ],
      }),
      catalog,
      settings,
    );
    expect(res.overallConfidence).toBe(0.8);
    expect(res.needsReviewReason).toBeNull(); // both ≥ 0.7, none unmapped
  });

  it("returns no_scope_found for empty extraction", () => {
    const res = mapScopeToLineItems(scope({}), catalog, settings);
    expect(res.items).toHaveLength(0);
    expect(res.overallConfidence).toBe(0);
    expect(res.needsReviewReason).toBe("no_scope_found");
  });

  it("preserves taxable=false for fee SKUs", () => {
    const res = mapScopeToLineItems(
      scope({ lineItems: [{ sku: "PERMIT", quantity: 1, unit: "lump", confidence: 0.99 }] }),
      catalog,
      settings,
    );
    expect(res.items[0].taxable).toBe(false);
  });
});
