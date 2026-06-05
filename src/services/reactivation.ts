import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { Env } from "../env.ts";
import { getDb, type DB } from "../db/client.ts";
import { leads, reactivations } from "../db/schema.ts";
import { newId, now } from "../lib/ids.ts";
import { logEvent } from "./events.ts";
import { getSettings } from "./settings.ts";
import { generateReactivation } from "../ai/reactivate.ts";
import { sendEmail } from "./ses.ts";
import { renderMarkdown } from "../lib/markdown.ts";

const AVG_PROJECT_CENTS = 2_800_000; // $28,000
const RECLOSE_RATE = 0.02; // 2% conservative

export async function listClosedLost(db: DB, limit = 40) {
  return db
    .select()
    .from(leads)
    .where(eq(leads.lifecycle, "closed_lost"))
    .orderBy(desc(leads.closedLostAt))
    .limit(limit);
}

export async function createBatch(db: DB, leadIds: string[]): Promise<string> {
  const batchId = newId();
  const t = now();
  if (leadIds.length) {
    await db.insert(reactivations).values(
      leadIds.map((leadId) => ({ id: newId(), leadId, batchId, channel: "email", status: "draft", createdAt: t })),
    );
  }
  return batchId;
}

/** Generate messages for all not-yet-written rows in a batch (run via waitUntil). */
export async function generateBatchMessages(env: Env, batchId: string): Promise<void> {
  const db = getDb(env.DB);
  const settings = await getSettings(db);
  const rows = await db
    .select()
    .from(reactivations)
    .where(and(eq(reactivations.batchId, batchId), isNull(reactivations.messageMd)));

  for (const r of rows) {
    try {
      const [lead] = await db.select().from(leads).where(eq(leads.id, r.leadId)).limit(1);
      if (!lead) continue;
      const out = await generateReactivation(env, lead, settings);
      await db
        .update(reactivations)
        .set({
          subject: out.subject,
          messageMd: out.messageMd,
          model: out.model,
          costCents: out.costCents,
          qualityFlag: out.usesRealContext ? null : "needs_review",
        })
        .where(eq(reactivations.id, r.id));
      await logEvent(db, {
        type: "reactivation.generated",
        reactivationId: r.id,
        leadId: r.leadId,
        detail: { model: out.model, costCents: out.costCents, usesRealContext: out.usesRealContext },
      });
    } catch (err) {
      await db
        .update(reactivations)
        .set({ status: "error", subject: "(generation failed)", messageMd: "AI generation failed — edit the message or skip this lead." })
        .where(eq(reactivations.id, r.id));
      await logEvent(db, { type: "reactivation.failed", status: "error", reactivationId: r.id, detail: { error: String(err) } });
    }
  }
}

export async function getBatch(db: DB, batchId: string) {
  return db
    .select({ r: reactivations, lead: leads })
    .from(reactivations)
    .leftJoin(leads, eq(reactivations.leadId, leads.id))
    .where(eq(reactivations.batchId, batchId))
    .orderBy(reactivations.createdAt);
}

export async function batchPending(db: DB, batchId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(reactivations)
    .where(and(eq(reactivations.batchId, batchId), isNull(reactivations.messageMd)));
  return row?.n ?? 0;
}

export async function recentReactivations(db: DB, limit = 25) {
  return db
    .select({ r: reactivations, lead: leads })
    .from(reactivations)
    .leftJoin(leads, eq(reactivations.leadId, leads.id))
    .orderBy(desc(reactivations.createdAt))
    .limit(limit);
}

export async function getReactivation(db: DB, id: string) {
  const [row] = await db.select().from(reactivations).where(eq(reactivations.id, id)).limit(1);
  return row ?? null;
}

export async function editReactivation(db: DB, id: string, subject: string, messageMd: string) {
  await db.update(reactivations).set({ subject, messageMd, qualityFlag: null }).where(eq(reactivations.id, id));
}

/** Send one reactivation via SES (best-effort; status advances, failure logged). */
export async function sendReactivation(env: Env, id: string): Promise<boolean> {
  const db = getDb(env.DB);
  const r = await getReactivation(db, id);
  if (!r || r.status === "sent" || !r.messageMd) return false;
  const [lead] = await db.select().from(leads).where(eq(leads.id, r.leadId)).limit(1);

  if (lead?.email) {
    try {
      const res = await sendEmail(env, {
        to: lead.email,
        subject: r.subject ?? "Following up on your project",
        html: personalEmailHtml(r.messageMd),
        text: r.messageMd,
      });
      await logEvent(db, { type: "reactivation.sent", reactivationId: id, leadId: r.leadId, detail: { messageId: res.messageId } });
    } catch (err) {
      await logEvent(db, { type: "reactivation.send_failed", status: "error", reactivationId: id, leadId: r.leadId, detail: { error: String(err) } });
    }
  } else {
    await logEvent(db, { type: "reactivation.sent", reactivationId: id, leadId: r.leadId, detail: { note: "no email on file" } });
  }
  await db.update(reactivations).set({ status: "sent", sentAt: now() }).where(eq(reactivations.id, id));
  return true;
}

export async function sendBatch(env: Env, batchId: string): Promise<number> {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(reactivations)
    .where(and(eq(reactivations.batchId, batchId), eq(reactivations.status, "draft")));
  let sent = 0;
  for (const r of rows) if (await sendReactivation(env, r.id)) sent++;
  return sent;
}

export async function setReactivationStatus(db: DB, id: string, status: string) {
  await db.update(reactivations).set({ status }).where(eq(reactivations.id, id));
}

export async function markRewon(db: DB, id: string) {
  const r = await getReactivation(db, id);
  if (!r) return;
  await db.update(reactivations).set({ status: "rewon", repliedAt: now(), outcome: "rewon" }).where(eq(reactivations.id, id));
  if (r.leadId) await db.update(leads).set({ lifecycle: "won" }).where(eq(leads.id, r.leadId));
}

export interface ReactivationStats {
  closedLost: number;
  latentRevenueCents: number;
  generated: number;
  sent: number;
  replied: number;
  rewon: number;
}

export async function reactivationStats(db: DB): Promise<ReactivationStats> {
  const [lost] = await db.select({ n: count() }).from(leads).where(eq(leads.lifecycle, "closed_lost"));
  const byStatus = await db
    .select({ status: reactivations.status, n: count() })
    .from(reactivations)
    .groupBy(reactivations.status);
  const map = Object.fromEntries(byStatus.map((b) => [b.status, b.n]));
  const closedLost = lost?.n ?? 0;
  const generated = byStatus.reduce((s, b) => s + b.n, 0);
  return {
    closedLost,
    latentRevenueCents: Math.round(closedLost * RECLOSE_RATE * AVG_PROJECT_CENTS),
    generated,
    sent: (map["sent"] ?? 0) + (map["replied"] ?? 0) + (map["rewon"] ?? 0),
    replied: (map["replied"] ?? 0) + (map["rewon"] ?? 0),
    rewon: map["rewon"] ?? 0,
  };
}

function personalEmailHtml(messageMd: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#23231f;font-size:15px;line-height:1.6">
  <div style="max-width:520px">${renderMarkdown(messageMd)}
  <p style="margin-top:18px">— Marcus Tate<br/><span style="color:#6b6960">Greenscape Pro · Phoenix, AZ</span></p>
  </div></body></html>`;
}
