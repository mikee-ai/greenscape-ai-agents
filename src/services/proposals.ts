import { and, desc, eq } from "drizzle-orm";
import type { Env } from "../env.ts";
import { getDb, type DB } from "../db/client.ts";
import { proposals, proposalLineItems, leads, type Proposal } from "../db/schema.ts";
import { newId, now, publicToken } from "../lib/ids.ts";
import { logEvent } from "./events.ts";
import { getSettings, toPricingSettings } from "./settings.ts";
import { getActiveCatalog } from "./catalog.ts";
import { setLeadLifecycle } from "./leads.ts";
import { extractScope } from "../ai/extract.ts";
import { draftProposalCopy } from "../ai/draft.ts";
import { mapScopeToLineItems } from "../pricing/mapScope.ts";
import { computeTotals } from "../pricing/compute.ts";
import { sendProposalEmail } from "./ses.ts";

export async function createProposal(db: DB, leadId: string): Promise<string> {
  const id = newId();
  const t = now();
  await db.insert(proposals).values({
    id,
    leadId,
    publicToken: publicToken(),
    status: "draft",
    createdAt: t,
    updatedAt: t,
  });
  return id;
}

export async function getProposal(db: DB, id: string): Promise<Proposal | null> {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  return p ?? null;
}

export async function getProposalByToken(db: DB, token: string): Promise<Proposal | null> {
  const [p] = await db.select().from(proposals).where(eq(proposals.publicToken, token)).limit(1);
  return p ?? null;
}

export async function getProposalWithItems(db: DB, id: string) {
  const p = await getProposal(db, id);
  if (!p) return null;
  const [lead] = await db.select().from(leads).where(eq(leads.id, p.leadId)).limit(1);
  const items = await db
    .select()
    .from(proposalLineItems)
    .where(eq(proposalLineItems.proposalId, id))
    .orderBy(proposalLineItems.sortOrder);
  return { proposal: p, lead: lead ?? null, items };
}

export async function listProposals(db: DB, limit = 100) {
  return db
    .select({ p: proposals, lead: leads })
    .from(proposals)
    .leftJoin(leads, eq(proposals.leadId, leads.id))
    .orderBy(desc(proposals.createdAt))
    .limit(limit);
}

export async function saveSiteWalkNotes(db: DB, id: string, notes: string) {
  await db.update(proposals).set({ siteWalkNotes: notes, updatedAt: now() }).where(eq(proposals.id, id));
}

export async function setStatus(db: DB, id: string, status: string) {
  await db.update(proposals).set({ status, updatedAt: now() }).where(eq(proposals.id, id));
}

/**
 * The generation pipeline (run via ctx.waitUntil so the request returns fast):
 *   extract scope (Haiku) → map to catalog → price (code) → draft prose (Sonnet)
 *   → status needs_review. Always lands on an editable proposal; on AI failure it
 *   sets status=error (still editable) instead of throwing.
 */
export async function runProposalGeneration(env: Env, proposalId: string): Promise<void> {
  const db = getDb(env.DB);
  const started = Date.now();
  try {
    const p = await getProposal(db, proposalId);
    if (!p) return;

    const settings = await getSettings(db);
    const ps = toPricingSettings(settings);
    const catalog = await getActiveCatalog(db);
    const [lead] = await db.select().from(leads).where(eq(leads.id, p.leadId)).limit(1);
    const notes = p.siteWalkNotes?.trim() || "";

    await logEvent(db, { type: "extraction.started", proposalId, leadId: p.leadId });

    // 1) extract + 2) map + 3) price
    const ext = await extractScope(env, notes, catalog, settings);
    const mapped = mapScopeToLineItems(ext.scope, catalog, ps);
    const totals = computeTotals(mapped.items, ps);
    let llmCost = ext.costCents;

    // replace AI-sourced line items (preserve any manual ones)
    await db
      .delete(proposalLineItems)
      .where(and(eq(proposalLineItems.proposalId, proposalId), eq(proposalLineItems.source, "ai")));
    if (mapped.items.length) {
      await db.insert(proposalLineItems).values(
        mapped.items.map((li) => ({ id: newId(), proposalId, ...li })),
      );
    }

    await logEvent(db, {
      type: "extraction.done",
      proposalId,
      detail: {
        ms: Date.now() - started,
        items: mapped.items.length,
        confidence: mapped.overallConfidence,
        needsReviewReason: mapped.needsReviewReason,
        model: ext.model,
        usage: ext.usage,
        costCents: ext.costCents,
      },
    });

    // 4) draft prose (non-fatal — proposal is usable without it)
    let copy: { coverNoteMd: string; scopeSummaryMd: string; inclusionsMd: string; exclusionsMd: string } | null = null;
    const mappedItems = mapped.items.filter((i) => i.catalogSku);
    if (mappedItems.length > 0) {
      try {
        const draft = await draftProposalCopy(env, {
          settings,
          clientName: lead?.name ?? "there",
          projectType: lead?.projectType ?? null,
          items: mappedItems.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
          specialConditions: ext.scope.specialConditions,
        });
        copy = {
          coverNoteMd: draft.copy.cover_note_md,
          scopeSummaryMd: draft.copy.scope_summary_md,
          inclusionsMd: draft.copy.inclusions_md,
          exclusionsMd: draft.copy.exclusions_md,
        };
        llmCost += draft.costCents;
        await logEvent(db, { type: "draft.done", proposalId, detail: { model: draft.model, usage: draft.usage, costCents: draft.costCents } });
      } catch (err) {
        await logEvent(db, { type: "draft.failed", status: "error", proposalId, detail: { error: String(err) } });
      }
    }

    await db
      .update(proposals)
      .set({
        status: "needs_review",
        extractionJson: JSON.stringify(ext.scope),
        extractionModel: ext.model,
        overallConfidence: mapped.overallConfidence,
        needsReviewReason: mapped.needsReviewReason,
        subtotalCents: totals.subtotalCents,
        taxRateBps: ps.taxRateBps,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        depositCents: totals.depositCents,
        needsRender: totals.needsRender,
        llmCostCents: (p.llmCostCents ?? 0) + llmCost,
        ...(copy ?? {}),
        updatedAt: now(),
      })
      .where(eq(proposals.id, proposalId));

    if (p.leadId) await setLeadLifecycle(db, p.leadId, "quoted");
  } catch (err) {
    console.error("runProposalGeneration failed:", err);
    await db
      .update(proposals)
      .set({ status: "error", needsReviewReason: "parse_failed", updatedAt: now() })
      .where(eq(proposals.id, proposalId));
    await logEvent(db, { type: "extraction.failed", status: "error", proposalId, detail: { error: String(err) } });
  }
}

export type ApproveResult =
  | { ok: true }
  | { ok: false; reason: "not_reviewable" | "unpriced" | "no_items" };

/**
 * Approve & Send: needs_review → approved → sent. Idempotent (no-op if already
 * past needs_review). Blocks if any line item is unpriced/flagged-unmapped.
 * The SES email is best-effort: a failure still marks the proposal "sent" (the
 * public link works) and is recorded as an event.
 */
export async function approveAndSend(env: Env, proposalId: string): Promise<ApproveResult> {
  const db = getDb(env.DB);
  const data = await getProposalWithItems(db, proposalId);
  if (!data) return { ok: false, reason: "not_reviewable" };
  const { proposal, lead, items } = data;

  if (proposal.status !== "needs_review") return { ok: false, reason: "not_reviewable" };
  if (items.length === 0) return { ok: false, reason: "no_items" };
  if (items.some((i) => i.unitPriceCents <= 0 || i.quantity <= 0)) return { ok: false, reason: "unpriced" };

  const t = now();
  await db.update(proposals).set({ status: "approved", approvedAt: t, updatedAt: t }).where(eq(proposals.id, proposalId));
  await logEvent(db, { type: "proposal.approved", proposalId, leadId: proposal.leadId, detail: { totalCents: proposal.totalCents } });

  // Email is best-effort (idempotent via emailMessageId null-guard).
  if (lead?.email && !proposal.emailMessageId) {
    try {
      const res = await sendProposalEmail(env, {
        to: lead.email,
        clientName: lead.name,
        totalCents: proposal.totalCents ?? 0,
        depositCents: proposal.depositCents ?? 0,
        publicUrl: `${env.PUBLIC_BASE_URL}/p/${proposal.publicToken}`,
      });
      await db.update(proposals).set({ emailMessageId: res.messageId }).where(eq(proposals.id, proposalId));
      await logEvent(db, { type: "email.sent", proposalId, detail: { to: lead.email, messageId: res.messageId } });
    } catch (err) {
      await logEvent(db, { type: "email.failed", status: "error", proposalId, detail: { to: lead.email, error: String(err) } });
    }
  } else if (!lead?.email) {
    await logEvent(db, { type: "email.skipped", proposalId, detail: { reason: "no lead email" } });
  }

  await db.update(proposals).set({ status: "sent", sentAt: now(), updatedAt: now() }).where(eq(proposals.id, proposalId));
  return { ok: true };
}

export async function markLost(db: DB, proposalId: string) {
  const p = await getProposal(db, proposalId);
  if (!p) return;
  await db.update(proposals).set({ status: "lost", updatedAt: now() }).where(eq(proposals.id, proposalId));
  // returns the lead to the closed-lost pile (reactivation candidate)
  if (p.leadId) await db.update(leads).set({ lifecycle: "closed_lost", closedLostReason: "quote_lost", closedLostAt: now() }).where(eq(leads.id, p.leadId));
}

/** Mark first customer view (sent → viewed). Idempotent. */
export async function markViewed(db: DB, proposalId: string) {
  const p = await getProposal(db, proposalId);
  if (p && p.status === "sent") {
    await db.update(proposals).set({ status: "viewed", viewedAt: now(), updatedAt: now() }).where(eq(proposals.id, proposalId));
  }
}

export async function markDepositPaid(db: DB, proposalId: string) {
  const p = await getProposal(db, proposalId);
  if (!p || p.status === "deposit_paid") return;
  await db.update(proposals).set({ status: "deposit_paid", paidAt: now(), updatedAt: now() }).where(eq(proposals.id, proposalId));
  await logEvent(db, { type: "deposit.paid", proposalId, leadId: p.leadId, detail: { depositCents: p.depositCents } });
  if (p.leadId) await db.update(leads).set({ lifecycle: "won" }).where(eq(leads.id, p.leadId));
}

export async function savePaypalOrder(db: DB, proposalId: string, orderId: string, approveUrl: string) {
  await db.update(proposals).set({ paypalOrderId: orderId, paypalApproveUrl: approveUrl, updatedAt: now() }).where(eq(proposals.id, proposalId));
}

/** Recompute totals from the current line items (after manual edits). */
export async function recomputeAndSave(db: DB, proposalId: string) {
  const settings = await getSettings(db);
  const ps = toPricingSettings(settings);
  const items = await db
    .select()
    .from(proposalLineItems)
    .where(eq(proposalLineItems.proposalId, proposalId));
  const totals = computeTotals(items, ps);
  await db
    .update(proposals)
    .set({
      subtotalCents: totals.subtotalCents,
      taxRateBps: ps.taxRateBps,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      depositCents: totals.depositCents,
      needsRender: totals.needsRender,
      updatedAt: now(),
    })
    .where(eq(proposals.id, proposalId));
  return totals;
}
