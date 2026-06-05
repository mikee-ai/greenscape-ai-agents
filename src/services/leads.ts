import { desc, eq } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import type { Env } from "../env.ts";
import { leads } from "../db/schema.ts";
import { newId, now } from "../lib/ids.ts";
import { logEvent } from "./events.ts";
import {
  ghlConfigured,
  upsertContact,
  createOpportunity,
  updateOpportunity,
  findOpenOpportunityByContact,
  normPhone,
  GHL_STAGE,
  LIFECYCLE_TO_STAGE,
} from "./ghl.ts";

export interface CreateLeadInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  projectType?: string;
  budgetHintCents?: number;
  source?: string;
  notes?: string;
  ghlContactId?: string;
  rawPayload?: unknown;
}

export async function createLead(db: DB, input: CreateLeadInput, env?: Env): Promise<string> {
  const id = newId();
  await db.insert(leads).values({
    id,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
    projectType: input.projectType ?? null,
    budgetHint: input.budgetHintCents ?? null,
    source: input.source ?? "manual",
    lifecycle: "new",
    notes: input.notes ?? null,
    ghlContactId: input.ghlContactId ?? null,
    rawPayload: input.rawPayload !== undefined ? JSON.stringify(input.rawPayload) : null,
    createdAt: now(),
  });

  // Forward-sync to GHL (system of record). Skip leads that ORIGINATED in GHL
  // (ghlContactId already set — approveAndSend will resolve it) and leads with no
  // dedupe key. Reuse an existing opp before creating. Best-effort — never blocks.
  if (env && ghlConfigured(env) && !input.ghlContactId && (input.email || normPhone(input.phone))) {
    try {
      const contactId = await upsertContact(env, {
        name: input.name,
        email: input.email,
        phone: input.phone,
        address: input.address,
        source: input.source ?? "greenscape-app",
        projectType: input.projectType,
        lifecycle: "new",
      });
      const oppName = `${input.name} — ${String(input.projectType || "project").replace(/_/g, " ")}`;
      let oppId = await findOpenOpportunityByContact(env, contactId).catch(() => null);
      if (!oppId) {
        oppId = await createOpportunity(env, {
          contactId,
          name: oppName,
          stageId: GHL_STAGE.new,
          status: "open",
          monetaryValue: input.budgetHintCents != null ? input.budgetHintCents / 100 : undefined,
        });
      }
      await db.update(leads).set({ ghlContactId: contactId, ghlOpportunityId: oppId }).where(eq(leads.id, id));
      await logEvent(db, { type: "ghl.synced", leadId: id, detail: { contactId, oppId } });
    } catch (err) {
      await logEvent(db, { type: "ghl.failed", status: "error", leadId: id, detail: { error: String(err) } });
    }
  }
  return id;
}

export async function listLeads(
  db: DB,
  opts: { lifecycle?: string; limit?: number } = {},
) {
  const base = db.select().from(leads).$dynamic();
  const filtered = opts.lifecycle ? base.where(eq(leads.lifecycle, opts.lifecycle)) : base;
  return filtered.orderBy(desc(leads.createdAt)).limit(opts.limit ?? 100);
}

export async function getLead(db: DB, id: string) {
  const rows = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Look up a lead by its GHL contact id (webhook idempotency / re-delivery). */
export async function getLeadByGhlContactId(db: DB, ghlContactId: string) {
  const rows = await db.select().from(leads).where(eq(leads.ghlContactId, ghlContactId)).limit(1);
  return rows[0] ?? null;
}

export async function setLeadLifecycle(db: DB, id: string, lifecycle: string, env?: Env) {
  await db.update(leads).set({ lifecycle }).where(eq(leads.id, id));
  // Reconcile the GHL opportunity stage so app-side lifecycle changes don't
  // diverge from the system of record. Best-effort; no-op without an opp id
  // (opp creation stays owned by createLead / approveAndSend).
  if (!env || !ghlConfigured(env)) return;
  const map = LIFECYCLE_TO_STAGE[lifecycle];
  if (!map) return;
  try {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    if (lead?.ghlOpportunityId) {
      await updateOpportunity(env, lead.ghlOpportunityId, { stageId: map.stageId, status: map.status });
      await logEvent(db, { type: "ghl.synced", leadId: id, detail: { stage: lifecycle, stageId: map.stageId } });
    }
  } catch (err) {
    await logEvent(db, { type: "ghl.failed", status: "error", leadId: id, detail: { error: String(err) } });
  }
}
