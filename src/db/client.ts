import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

/** Build a typed Drizzle client over the D1 binding. */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type DB = ReturnType<typeof getDb>;
export { schema };
