import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

/** Build a typed Drizzle client over the D1 binding (Workers) or pass through
 *  an already-constructed Drizzle (libSQL) instance injected on Node. */
export function getDb(binding: any): DB {
  // On Node we inject an already-built Drizzle (libSQL) instance, which has .select
  if (binding && typeof binding.select === "function") return binding as DB;
  return drizzleD1(binding as D1Database, { schema });
}

export type DB = ReturnType<typeof drizzleD1<typeof schema>>;
export { schema };
