import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { getDb } from "../db/client.ts";
import { createLead, getLeadByGhlContactId } from "../services/leads.ts";
import { logEvent } from "../services/events.ts";
import { leadWebhookSchema } from "../lib/validation.ts";
import { dollarsToCents } from "../lib/money.ts";

const webhook = new Hono<AppEnv>();

/**
 * POST /webhook/lead — inbound lead (simulates Meta lead-ad form → GHL → us).
 * Accepts JSON or form-encoded bodies. Stores the raw payload for audit/replay
 * and logs an event. Only `name` is required.
 */
webhook.post("/lead", async (c) => {
  const db = getDb(c.env.DB);

  // Read the body once (can't re-read in Workers), then try JSON, then form.
  const raw = await c.req.text();
  let body: Record<string, unknown> = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = Object.fromEntries(new URLSearchParams(raw));
    }
  }

  const parsed = leadWebhookSchema.safeParse(body);
  if (!parsed.success) {
    await logEvent(db, {
      type: "lead.rejected",
      status: "error",
      detail: { issues: parsed.error.issues, body },
    });
    return c.json({ ok: false, error: "invalid payload", issues: parsed.error.issues }, 400);
  }

  const d = parsed.data;
  // Idempotency: GHL/Meta webhooks retry. A re-delivery for a known contact must
  // not create a duplicate lead (which would spawn a duplicate GHL opportunity).
  if (d.ghl_contact_id) {
    const existing = await getLeadByGhlContactId(db, d.ghl_contact_id);
    if (existing) {
      await logEvent(db, { type: "lead.duplicate", leadId: existing.id, detail: { ghlContactId: d.ghl_contact_id } });
      return c.json({ ok: true, lead_id: existing.id, duplicate: true });
    }
  }
  const id = await createLead(db, {
    name: d.name,
    email: d.email || undefined,
    phone: d.phone,
    address: d.address,
    projectType: d.project_type,
    budgetHintCents: d.budget_hint !== undefined ? dollarsToCents(d.budget_hint) : undefined,
    source: d.source || "meta",
    notes: d.notes,
    ghlContactId: d.ghl_contact_id,
    rawPayload: body,
  }, c.env);

  await logEvent(db, { type: "lead.created", leadId: id, detail: { source: d.source || "meta", name: d.name } });
  return c.json({ ok: true, lead_id: id });
});

export default webhook;
