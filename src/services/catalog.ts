import { asc, eq } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { pricingCatalog, type CatalogItem } from "../db/schema.ts";

export async function getActiveCatalog(db: DB): Promise<CatalogItem[]> {
  return db
    .select()
    .from(pricingCatalog)
    .where(eq(pricingCatalog.active, true))
    .orderBy(asc(pricingCatalog.category), asc(pricingCatalog.name));
}

export async function findCatalogBySku(db: DB, sku: string): Promise<CatalogItem | null> {
  const [row] = await db.select().from(pricingCatalog).where(eq(pricingCatalog.sku, sku)).limit(1);
  return row ?? null;
}
