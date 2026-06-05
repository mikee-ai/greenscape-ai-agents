import { describe, it, expect } from "vitest";
import { computeLineTotalCents, computeTotals } from "../src/pricing/compute.ts";
import type { PricingSettings } from "../src/pricing/types.ts";

const settings: PricingSettings = {
  taxRateBps: 860, // 8.6%
  depositPct: 50,
  renderThresholdCents: 3_000_000, // $30k
  lowConfidenceThreshold: 0.7,
};

describe("computeLineTotalCents", () => {
  it("applies margin and rounds to whole cents", () => {
    // 600 sqft × $11.50 cost × 1.35 = 931,500 cents = $9,315.00
    expect(computeLineTotalCents(600, 1150, 0.35)).toBe(931_500);
  });

  it("handles fractional quantity with correct rounding", () => {
    const expected = Math.round(412.5 * 1500 * 1.38);
    expect(computeLineTotalCents(412.5, 1500, 0.38)).toBe(expected);
  });

  it("supports zero margin (e.g. pass-through permit)", () => {
    expect(computeLineTotalCents(1, 85_000, 0)).toBe(85_000);
  });

  it("returns 0 for zero or negative quantity", () => {
    expect(computeLineTotalCents(0, 1000, 0.35)).toBe(0);
    expect(computeLineTotalCents(-5, 1000, 0.35)).toBe(0);
  });

  it("returns 0 for non-finite inputs (never NaN out)", () => {
    expect(computeLineTotalCents(NaN, 1000, 0.35)).toBe(0);
    expect(computeLineTotalCents(10, Infinity, 0.35)).toBe(0);
    expect(computeLineTotalCents(10, 1000, NaN)).toBe(0);
  });
});

describe("computeTotals", () => {
  it("sums subtotal, taxes only taxable lines, derives deposit + render flag", () => {
    const items = [
      { lineTotalCents: 2_000_000, taxable: true }, // materials
      { lineTotalCents: 500_000, taxable: false }, // non-taxable fee
    ];
    const t = computeTotals(items, settings);
    expect(t.subtotalCents).toBe(2_500_000);
    expect(t.taxCents).toBe(172_000); // 8.6% of 2,000,000 only
    expect(t.totalCents).toBe(2_672_000);
    expect(t.depositCents).toBe(1_336_000); // 50%
    expect(t.needsRender).toBe(false); // < $30k
  });

  it("triggers render flag exactly at the $30k threshold", () => {
    const t = computeTotals([{ lineTotalCents: 3_000_000, taxable: false }], settings);
    expect(t.totalCents).toBe(3_000_000);
    expect(t.needsRender).toBe(true);
  });

  it("does not trigger render just below the threshold", () => {
    const t = computeTotals([{ lineTotalCents: 2_999_999, taxable: false }], settings);
    expect(t.needsRender).toBe(false);
  });

  it("returns all zeros for an empty proposal", () => {
    expect(computeTotals([], settings)).toEqual({
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
      depositCents: 0,
      needsRender: false,
    });
  });

  it("tolerates missing lineTotalCents without producing NaN", () => {
    const t = computeTotals([{ lineTotalCents: NaN as unknown as number, taxable: true }], settings);
    expect(Number.isNaN(t.totalCents)).toBe(false);
  });
});
