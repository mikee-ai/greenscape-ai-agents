// Roll back GHL contacts + opportunities created by ghl-sync-leads.mjs.
// Deletes ONLY rows we created (ghl_opportunity_id set), then clears local ids.
// Default scope: lifecycle='closed_lost'. Override with LIFECYCLES env.
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}
const TOKEN = process.env.GHL_API_KEY;
const SLEEP_MS = process.env.SLEEP_MS ? Number(process.env.SLEEP_MS) : 120;
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;
const LIFECYCLES = (process.env.LIFECYCLES || "closed_lost").split(",").map((s) => s.trim()).filter(Boolean);
const BASE = "https://services.leadconnectorhq.com";
const HEADERS = { Authorization: `Bearer ${TOKEN}`, Version: "2021-07-28" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sqlStr = (a) => a.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(",");

async function del(path, attempt = 0) {
  const res = await fetch(BASE + path, { method: "DELETE", headers: HEADERS });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) { await sleep(1200 * (attempt + 1)); return del(path, attempt + 1); }
  return { ok: res.ok || res.status === 404, status: res.status };
}

const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/greenscape.db" });
const sql = `SELECT id,ghl_contact_id,ghl_opportunity_id FROM leads WHERE lifecycle IN (${sqlStr(LIFECYCLES)}) AND ghl_opportunity_id IS NOT NULL` + (LIMIT ? ` LIMIT ${LIMIT}` : "");
const { rows } = await db.execute(sql);
console.log(`Cleaning up ${rows.length} GHL records [${LIFECYCLES.join(",")}]`);

let delOpp = 0, delContact = 0, errors = 0;
for (let i = 0; i < rows.length; i++) {
  const l = rows[i];
  try {
    if (l.ghl_opportunity_id) {
      const r = await del(`/opportunities/${l.ghl_opportunity_id}`);
      if (r.ok) delOpp++; else { errors++; console.log(`ERR opp ${l.ghl_opportunity_id} ${r.status}`); }
    }
    if (l.ghl_contact_id && !String(l.ghl_contact_id).startsWith("ghl_")) {
      const r = await del(`/contacts/${l.ghl_contact_id}`);
      if (r.ok) delContact++; else { errors++; console.log(`ERR contact ${l.ghl_contact_id} ${r.status}`); }
    }
    await db.execute({ sql: "UPDATE leads SET ghl_contact_id=NULL, ghl_opportunity_id=NULL WHERE id=?", args: [l.id] });
    if (i % 25 === 0) console.log(`[${i + 1}/${rows.length}] opps=${delOpp} contacts=${delContact} err=${errors}`);
    await sleep(SLEEP_MS);
  } catch (e) { errors++; console.log(`EXC ${l.id} ${String(e).slice(0, 200)}`); }
}
console.log(`CLEANUP DONE total=${rows.length} opps=${delOpp} contacts=${delContact} errors=${errors}`);
