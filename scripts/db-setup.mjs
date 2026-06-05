import { createClient } from "@libsql/client";
import { readFileSync, mkdirSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "file:./data/greenscape.db";
if (url.startsWith("file:")) {
  try {
    mkdirSync(new URL(url).pathname.replace(/[^/]+$/, "") || "data", { recursive: true });
  } catch {}
  try {
    mkdirSync("data", { recursive: true });
  } catch {}
}

const client = createClient({ url });
// Apply every migration in journal order (not just 0000) so a clean DB gets all
// later columns (e.g. leads.ghl_opportunity_id from 0001).
const journal = JSON.parse(readFileSync("migrations/meta/_journal.json", "utf8"));
for (const entry of journal.entries ?? []) {
  await client.executeMultiple(readFileSync(`migrations/${entry.tag}.sql`, "utf8"));
}
const seed = readFileSync("seed/seed.sql", "utf8");
await client.executeMultiple(seed);
const r = await client.execute(
  "SELECT (SELECT COUNT(*) FROM pricing_catalog) c, (SELECT COUNT(*) FROM leads) l",
);
console.log("db-setup ok:", JSON.stringify(r.rows[0]));
