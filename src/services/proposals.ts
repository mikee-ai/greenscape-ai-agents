import { and, desc, eq, ne } from "drizzle-orm";
import type { Env } from "../env.ts";
import { getDb, type DB } from "../db/client.ts";
import { proposals, proposalLineItems, leads, type Proposal } from "../db/schema.ts";
import { newId, now, publicToken } from "../lib/ids.ts";
import { formatCents } from "../lib/money.ts";
import { logEvent } from "./events.ts";
import { getSettings, toPricingSettings } from "./settings.ts";
import { getActiveCatalog } from "./catalog.ts";
import { setLeadLifecycle } from "./leads.ts";
import { extractScope } from "../ai/extract.ts";
import { draftProposalCopy } from "../ai/draft.ts";
import { mapScopeToLineItems } from "../pricing/mapScope.ts";
import { computeTotals } from "../pricing/compute.ts";
import { sendProposalEmail, escapeHtml } from "./ses.ts";
import {
  ghlConfigured,
  ghlEmailEnabled,
  upsertContact,
  createOpportunity,
  updateOpportunity,
  findOpenOpportunityByContact,
  setContactCustomFields,
  addContactNote,
  addContactTask,
  sendEmailViaGhl,
  GHL_STAGE,
} from "./ghl.ts";

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

    if (p.leadId) await setLeadLifecycle(db, p.leadId, "quoted", env);
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
/** Reserved/demo recipient domains (RFC 2606 + example.*) — never send real email. */
function isReservedRecipient(addr: string): boolean {
  const domain = addr.trim().toLowerCase().split("@").pop() ?? "";
  return (
    domain === "localhost" ||
    /\.(example|test|invalid|localhost)$/.test(domain) ||
    /^example\.(com|net|org)$/.test(domain)
  );
}

/** Push a won/lost close-out to GHL (system of record): move the opportunity to
 *  Closed with the right status, set the proposal_status field, optional note.
 *  Self-heals a missing/stale opp id (search → recreate). Logs honestly:
 *  ghl.synced only when an opp write actually happened, else ghl.skipped. */
export async function syncCloseOut(
  db: DB,
  env: Env,
  leadId: string,
  status: "won" | "lost",
  opts: { proposalId?: string; reactivationId?: string; note?: string } = {},
): Promise<void> {
  const { proposalId, reactivationId, note } = opts;
  try {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return;
    let contactId = lead.ghlContactId ?? null;
    if (!contactId) {
      contactId = await upsertContact(env, { ...lead, source: lead.source ?? "greenscape-app" });
      await db.update(leads).set({ ghlContactId: contactId }).where(eq(leads.id, leadId));
    }
    let oppId = lead.ghlOpportunityId ?? null;
    if (!oppId) oppId = await findOpenOpportunityByContact(env, contactId).catch(() => null);
    if (oppId) {
      await updateOpportunity(env, oppId, { stageId: GHL_STAGE.closed, status });
    } else {
      const oppName = `${lead.name} — ${String(lead.projectType || "project").replace(/_/g, " ")}`;
      oppId = await createOpportunity(env, { contactId, name: oppName, stageId: GHL_STAGE.closed, status });
      if (oppId !== lead.ghlOpportunityId) await db.update(leads).set({ ghlOpportunityId: oppId }).where(eq(leads.id, leadId));
    }
    await setContactCustomFields(env, contactId, { proposalStatus: status });
    if (note) await addContactNote(env, contactId, note);
    await logEvent(db, { type: "ghl.synced", proposalId, reactivationId, leadId, detail: { stage: "closed", status, contactId, oppId } });
  } catch (err) {
    await logEvent(db, { type: "ghl.failed", status: "error", proposalId, reactivationId, leadId, detail: { error: String(err) } });
  }
}

export async function approveAndSend(env: Env, proposalId: string): Promise<ApproveResult> {
  const db = getDb(env.DB);
  let data = await getProposalWithItems(db, proposalId);
  if (!data) return { ok: false, reason: "not_reviewable" };
  // Defensive: refresh the money snapshot from the current line items before we
  // lock + email + sync, so a stale total_cents can never reach the customer or GHL.
  if (data.proposal.status === "needs_review") {
    await recomputeAndSave(db, proposalId).catch(() => {});
    data = await getProposalWithItems(db, proposalId);
    if (!data) return { ok: false, reason: "not_reviewable" };
  }
  const { proposal, lead, items } = data;

  // Allow re-entry from "approved" (crash recovery between the CAS and the send flip).
  if (proposal.status !== "needs_review" && proposal.status !== "approved") return { ok: false, reason: "not_reviewable" };
  if (items.length === 0) return { ok: false, reason: "no_items" };
  if (items.some((i) => i.unitPriceCents <= 0 || i.quantity <= 0)) return { ok: false, reason: "unpriced" };

  // Atomic compare-and-swap: only one concurrent Approve wins needs_review→approved.
  if (proposal.status === "needs_review") {
    const t = now();
    const claimed = await db
      .update(proposals)
      .set({ status: "approved", approvedAt: t, updatedAt: t })
      .where(and(eq(proposals.id, proposalId), eq(proposals.status, "needs_review")))
      .returning({ id: proposals.id });
    if (claimed.length === 0) return { ok: false, reason: "not_reviewable" }; // lost the race
    await logEvent(db, { type: "proposal.approved", proposalId, leadId: proposal.leadId, detail: { totalCents: proposal.totalCents } });
  }

  const publicUrl = `${env.PUBLIC_BASE_URL}/p/${proposal.publicToken}`;
  const first = lead?.name?.split(" ")[0] || "there";

  // Resolve the GHL contact once, up front (whenever GHL is configured), so the
  // GHL-email path and the write-back share it.
  let contactId: string | null = lead?.ghlContactId ?? null;
  if (ghlConfigured(env) && lead && !contactId) {
    try {
      contactId = await upsertContact(env, { ...lead, source: lead.source ?? "greenscape-app" });
      await db.update(leads).set({ ghlContactId: contactId }).where(eq(leads.id, lead.id));
    } catch (err) {
      await logEvent(db, { type: "ghl.failed", status: "error", proposalId, leadId: lead.id, detail: { step: "ensureContact", error: String(err) } });
      contactId = null;
    }
  }

  // Email is best-effort. Reserved/demo domains are skipped (hard-bounce guard).
  // GHL-first (logs on the timeline) when enabled; otherwise SES. Name is escaped.
  if (lead?.email && isReservedRecipient(lead.email)) {
    await logEvent(db, { type: "email.skipped", proposalId, detail: { reason: "reserved/demo domain", to: lead.email } });
  } else if (lead?.email && !proposal.emailMessageId) {
    const subject = "Your Greenscape Pro proposal is ready";
    let sent = false;
    if (ghlEmailEnabled(env) && contactId) {
      try {
        const html =
          `<p>Hi ${escapeHtml(first)},</p><p>Your proposal is ready to review online.</p>` +
          `<p><a href="${publicUrl}">View &amp; accept your proposal</a></p>`;
        const res = await sendEmailViaGhl(env, { contactId, subject, html });
        await db.update(proposals).set({ emailMessageId: res.messageId }).where(eq(proposals.id, proposalId));
        await logEvent(db, { type: "email.sent", proposalId, detail: { via: "ghl", to: lead.email, messageId: res.messageId } });
        sent = true;
      } catch (err) {
        await logEvent(db, { type: "email.failed", status: "error", proposalId, detail: { via: "ghl", to: lead.email, error: String(err) } });
      }
    }
    if (!sent) {
      try {
        const res = await sendProposalEmail(env, {
          to: lead.email,
          clientName: lead.name,
          totalCents: proposal.totalCents ?? 0,
          depositCents: proposal.depositCents ?? 0,
          publicUrl,
        });
        await db.update(proposals).set({ emailMessageId: res.messageId }).where(eq(proposals.id, proposalId));
        await logEvent(db, { type: "email.sent", proposalId, detail: { via: "ses", to: lead.email, messageId: res.messageId } });
      } catch (err) {
        await logEvent(db, { type: "email.failed", status: "error", proposalId, detail: { via: "ses", to: lead.email, error: String(err) } });
      }
    }
  } else if (!lead?.email) {
    await logEvent(db, { type: "email.skipped", proposalId, detail: { reason: "no lead email" } });
  }

  // Flip to "sent" BEFORE the GHL write-back so a write-back failure can never
  // strand the proposal in "approved" — the public link works the moment it's sent.
  await db.update(proposals).set({ status: "sent", sentAt: now(), updatedAt: now() }).where(eq(proposals.id, proposalId));

  // GHL write-back, per-step: a mid-sequence failure is isolated and honestly
  // reported (ghl.partial). Self-heals a missing/stale opp id via search.
  if (ghlConfigured(env) && lead && contactId) {
    const dollars = (proposal.totalCents ?? 0) / 100;
    const oppName = `${lead.name} — ${String(lead.projectType || "project").replace(/_/g, " ")}`;
    let oppId = lead.ghlOpportunityId ?? null;
    if (!oppId) oppId = await findOpenOpportunityByContact(env, contactId).catch(() => null);
    const failed: string[] = [];
    const steps: Array<[string, () => Promise<unknown>]> = [
      ["customFields", () => setContactCustomFields(env, contactId!, { proposalTotal: dollars, proposalStatus: "sent", proposalUrl: publicUrl })],
      ["opportunity", async () => {
        if (oppId) {
          await updateOpportunity(env, oppId, { stageId: GHL_STAGE.proposalSent, status: "open", monetaryValue: dollars, name: oppName });
        } else {
          oppId = await createOpportunity(env, { contactId: contactId!, name: oppName, stageId: GHL_STAGE.proposalSent, status: "open", monetaryValue: dollars });
        }
        if (oppId && oppId !== lead.ghlOpportunityId) await db.update(leads).set({ ghlOpportunityId: oppId }).where(eq(leads.id, lead.id));
      }],
      ["note", () => addContactNote(env, contactId!, `Proposal sent — total ${formatCents(proposal.totalCents ?? 0)}. ${publicUrl}`)],
      ["task", () => addContactTask(env, contactId!, { title: `Follow up on proposal for ${lead.name}`, dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() })],
    ];
    for (const [name, fn] of steps) {
      try {
        await fn();
      } catch (err) {
        failed.push(name);
        await logEvent(db, { type: "ghl.failed", status: "error", proposalId, leadId: lead.id, detail: { step: name, error: String(err) } });
      }
    }
    await logEvent(db, { type: failed.length ? "ghl.partial" : "ghl.synced", proposalId, leadId: lead.id, detail: { stage: "proposalSent", contactId, oppId, failedSteps: failed } });
  }

  return { ok: true };
}

export async function markLost(env: Env, proposalId: string) {
  const db = getDb(env.DB);
  // CAS: claim the transition once (not from terminal states) so the GHL push fires at most once.
  const claimed = await db
    .update(proposals)
    .set({ status: "lost", updatedAt: now() })
    .where(and(eq(proposals.id, proposalId), ne(proposals.status, "lost"), ne(proposals.status, "deposit_paid")))
    .returning({ leadId: proposals.leadId });
  if (claimed.length === 0) return;
  const leadId = claimed[0].leadId;
  // returns the lead to the closed-lost pile (reactivation candidate)
  if (leadId) await db.update(leads).set({ lifecycle: "closed_lost", closedLostReason: "quote_lost", closedLostAt: now() }).where(eq(leads.id, leadId));
  if (ghlConfigured(env) && leadId) await syncCloseOut(db, env, leadId, "lost", { proposalId });
}

/** Mark first customer view (sent → viewed). Idempotent. */
export async function markViewed(db: DB, proposalId: string) {
  const p = await getProposal(db, proposalId);
  if (p && p.status === "sent") {
    await db.update(proposals).set({ status: "viewed", viewedAt: now(), updatedAt: now() }).where(eq(proposals.id, proposalId));
  }
}

export async function markDepositPaid(env: Env, proposalId: string) {
  const db = getDb(env.DB);
  // CAS: claim deposit_paid once so the GHL won-sync + note fire at most once.
  const claimed = await db
    .update(proposals)
    .set({ status: "deposit_paid", paidAt: now(), updatedAt: now() })
    .where(and(eq(proposals.id, proposalId), ne(proposals.status, "deposit_paid")))
    .returning({ leadId: proposals.leadId, depositCents: proposals.depositCents });
  if (claimed.length === 0) return;
  const { leadId, depositCents } = claimed[0];
  await logEvent(db, { type: "deposit.paid", proposalId, leadId, detail: { depositCents } });
  if (leadId) await db.update(leads).set({ lifecycle: "won" }).where(eq(leads.id, leadId));
  if (ghlConfigured(env) && leadId) await syncCloseOut(db, env, leadId, "won", { proposalId, note: "Deposit paid — opportunity won." });
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
