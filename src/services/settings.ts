import { eq } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { settings, type Settings } from "../db/schema.ts";
import type { PricingSettings } from "../pricing/types.ts";

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  companyName: "Greenscape Pro",
  taxRateBps: 860,
  depositPct: 50,
  defaultMarginPct: 0.35,
  renderThresholdCents: 3_000_000,
  lowConfidenceThreshold: 0.7,
  brandVoiceNotes: null,
  updatedAt: 0,
};

export async function getSettings(db: DB): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return row ?? DEFAULT_SETTINGS;
}

export function toPricingSettings(s: Settings): PricingSettings {
  return {
    taxRateBps: s.taxRateBps,
    depositPct: s.depositPct,
    renderThresholdCents: s.renderThresholdCents,
    lowConfidenceThreshold: s.lowConfidenceThreshold,
  };
}
