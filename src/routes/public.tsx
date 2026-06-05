import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import type { ProposalStatus } from "../db/schema.ts";
import { getDb } from "../db/client.ts";
import { doc } from "../ui/layout.tsx";
import { PublicProposal, PublicNotReady } from "../ui/public.tsx";
import {
  getProposalByToken,
  getProposalWithItems,
  markDepositPaid,
  markViewed,
  savePaypalOrder,
} from "../services/proposals.ts";
import { logEvent } from "../services/events.ts";
import { PUBLIC_STATUSES } from "../services/stateMachine.ts";
import { createDepositOrder, captureOrder, paypalConfigured } from "../services/paypal.ts";

const pub = new Hono<AppEnv>();

// Customer-facing proposal page.
pub.get("/:token", async (c) => {
  const db = getDb(c.env.DB);
  const p = await getProposalByToken(db, c.req.param("token"));
  if (!p || !PUBLIC_STATUSES.has(p.status as ProposalStatus)) {
    return c.html(doc(<PublicNotReady />), 404);
  }
  if (p.status === "sent") {
    await markViewed(db, p.id);
    await logEvent(db, { type: "proposal.viewed", proposalId: p.id, leadId: p.leadId });
  }
  const data = await getProposalWithItems(db, p.id);
  if (!data) return c.html(doc(<PublicNotReady />), 404);
  return c.html(
    doc(<PublicProposal proposal={data.proposal} lead={data.lead} items={data.items} paypalEnabled={paypalConfigured(c.env)} />),
  );
});

// Start a PayPal deposit checkout (creates a fresh order, then redirects).
pub.get("/:token/pay", async (c) => {
  const db = getDb(c.env.DB);
  const p = await getProposalByToken(db, c.req.param("token"));
  if (!p) return c.notFound();
  if (p.status === "deposit_paid" || !paypalConfigured(c.env)) return c.redirect(`/p/${p.publicToken}`);
  try {
    const order = await createDepositOrder(c.env, {
      amountCents: p.depositCents ?? 0,
      proposalId: p.id,
      returnUrl: `${c.env.PUBLIC_BASE_URL}/p/${p.publicToken}/return`,
      cancelUrl: `${c.env.PUBLIC_BASE_URL}/p/${p.publicToken}`,
      description: "Greenscape Pro project deposit",
    });
    await savePaypalOrder(db, p.id, order.orderId, order.approveUrl);
    await logEvent(db, { type: "payment_link.created", proposalId: p.id, detail: { orderId: order.orderId } });
    return c.redirect(order.approveUrl);
  } catch (err) {
    await logEvent(db, { type: "payment_link.failed", status: "error", proposalId: p.id, detail: { error: String(err) } });
    return c.redirect(`/p/${p.publicToken}`);
  }
});

// PayPal redirects here after approval (?token=<orderId>); capture + mark paid.
pub.get("/:token/return", async (c) => {
  const db = getDb(c.env.DB);
  const p = await getProposalByToken(db, c.req.param("token"));
  if (!p) return c.notFound();
  const orderId = c.req.query("token") || p.paypalOrderId || "";
  if (orderId) {
    try {
      const cap = await captureOrder(c.env, orderId);
      if (cap.status === "COMPLETED") await markDepositPaid(db, p.id);
      else await logEvent(db, { type: "deposit.capture_incomplete", status: "error", proposalId: p.id, detail: cap });
    } catch (err) {
      await logEvent(db, { type: "deposit.capture_failed", status: "error", proposalId: p.id, detail: { error: String(err) } });
    }
  }
  return c.redirect(`/p/${p.publicToken}`);
});

export default pub;
