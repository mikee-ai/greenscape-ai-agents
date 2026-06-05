// Backfill local leads -> GHL contacts + opportunities (re-runnable, idempotent).
// GHL is the system of record. Filters: LIFECYCLES, EXCLUDE_NAMES, LIMIT, SLEEP_MS.
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
const LOCATION = process.env.GHL_LOCATION_ID;
const PIPELINE = process.env.GHL_PIPELINE_ID;
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;
const SLEEP_MS = process.env.SLEEP_MS ? Number(process.env.SLEEP_MS) : 130;
const LIFECYCLES = process.env.LIFECYCLES ? process.env.LIFECYCLES.split(",").map((s) => s.trim()).filter(Boolean) : null;
const EXCLUDE_NAMES = process.env.EXCLUDE_NAMES ? process.env.EXCLUDE_NAMES.split(",").map((s) => s.trim()).filter(Boolean) : [];
const BASE = "https://services.leadconnectorhq.com";
const HEADERS = { Authorization: `Bearer ${TOKEN}`, Version: "2021-07-28", "Content-Type": "application/json" };

if (!TOKEN || !LOCATION || !PIPELINE) { console.error("Missing GHL_* in .env"); process.exit(1); }

const STAGE = {
  new:         "ad24dd22-1793-4ca4-8637-ecc53d6e2f1f",
  qualified:   "a3da94e9-3b3d-4e69-a25f-3c2315568316",
  quoted:      "a504f04d-a962-4e89-8d9e-c07d76d2bec6",
  won:         "50ada9d2-5fbd-4cd7-94c2-5dc31989ab39",
  closed_lost: "50ada9d2-5fbd-4cd7-94c2-5dc31989ab39",
};
const STATUS = { new: "open", qualified: "open", quoted: "open", won: "won", closed_lost: "lost" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const verbose = LIMIT !== null && LIMIT <= 12;
const sqlStr = (a) => a.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(",");

function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return { firstName: parts[0] || "Lead", lastName: parts.slice(1).join(" ") || undefined };
}
function normPhone(p) {
  if (!p) return undefined;
  const d = String(p).replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  return undefined;
}
async function api(path, body, attempt = 0) {
  const res = await fetch(BASE + path, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) { await sleep(1200 * (attempt + 1)); return api(path, body, attempt + 1); }
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/greenscape.db" });
const where = [];
if (LIFECYCLES) where.push(`lifecycle IN (${sqlStr(LIFECYCLES)})`);
if (EXCLUDE_NAMES.length) where.push(`name NOT IN (${sqlStr(EXCLUDE_NAMES)})`);
const sql =
  "SELECT id,name,email,phone,address,project_type,source,lifecycle,budget_hint,ghl_contact_id,ghl_opportunity_id FROM leads" +
  (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
  " ORDER BY created_at ASC" + (LIMIT ? ` LIMIT ${LIMIT}` : "");
const { rows } = await db.execute(sql);
console.log(`Syncing ${rows.length} leads -> GHL${LIFECYCLES ? " [" + LIFECYCLES.join(",") + "]" : ""}`);

let contacts = 0, opps = 0, skippedOpp = 0, errors = 0;
for (let i = 0; i < rows.length; i++) {
  const l = rows[i];
  try {
    const { firstName, lastName } = splitName(l.name);
    const tags = ["greenscape-import", `lifecycle:${l.lifecycle}`];
    if (l.project_type) tags.push(String(l.project_type));
    const cu = await api("/contacts/upsert", {
      locationId: LOCATION, firstName, lastName, name: l.name || undefined,
      email: l.email || undefined, phone: normPhone(l.phone), address1: l.address || undefined,
      source: l.source || "greenscape-import", tags,
    });
    const contactId = cu.json?.contact?.id || cu.json?.id;
    if (verbose) console.log("CONTACT", cu.status, l.name, contactId || JSON.stringify(cu.json).slice(0, 200));
    if (!cu.ok || !contactId) { errors++; console.log(`ERR contact ${l.id} ${cu.status} ${JSON.stringify(cu.json).slice(0, 200)}`); continue; }
    await db.execute({ sql: "UPDATE leads SET ghl_contact_id=? WHERE id=?", args: [contactId, l.id] });
    contacts++;
    if (!l.ghl_opportunity_id) {
      const name = `${l.name} — ${String(l.project_type || "project").replace(/_/g, " ")}`;
      const op = await api("/opportunities/", {
        pipelineId: PIPELINE, locationId: LOCATION, name,
        pipelineStageId: STAGE[l.lifecycle] || STAGE.new, status: STATUS[l.lifecycle] || "open",
        contactId, monetaryValue: l.budget_hint ? Math.round(l.budget_hint / 100) : undefined,
      });
      const oppId = op.json?.opportunity?.id || op.json?.id;
      if (verbose) console.log("OPP", op.status, name, oppId || JSON.stringify(op.json).slice(0, 200));
      if (!op.ok || !oppId) { errors++; console.log(`ERR opp ${l.id} ${op.status} ${JSON.stringify(op.json).slice(0, 200)}`); }
      else { await db.execute({ sql: "UPDATE leads SET ghl_opportunity_id=? WHERE id=?", args: [oppId, l.id] }); opps++; }
    } else skippedOpp++;
    if (i % 25 === 0) console.log(`[${i + 1}/${rows.length}] contacts=${contacts} opps=${opps} skip=${skippedOpp} err=${errors}`);
    await sleep(SLEEP_MS);
  } catch (e) { errors++; console.log(`EXC ${l.id} ${String(e).slice(0, 200)}`); }
}
console.log(`DONE total=${rows.length} contacts=${contacts} opps=${opps} skippedOpp=${skippedOpp} errors=${errors}`);
