import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { getDb } from "../db/client.ts";
import { Layout, doc } from "../ui/layout.tsx";
import { PageHead, Section } from "../ui/components.tsx";
import { ReactivationPage } from "../ui/reactivation.tsx";
import {
  createBatch,
  editReactivation,
  generateBatchMessages,
  getBatch,
  batchPending,
  listClosedLost,
  markRewon,
  recentReactivations,
  reactivationStats,
  sendBatch,
  sendReactivation,
  setReactivationStatus,
} from "../services/reactivation.ts";
import { logEvent } from "../services/events.ts";

const reactivation = new Hono<AppEnv>();

const MAX_BATCH = 15;

// ── main page ─────────────────────────────────────────────────────────
reactivation.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const batchId = c.req.query("batch") ?? null;
  const [stats, recent, closedLost] = await Promise.all([
    reactivationStats(db),
    recentReactivations(db, 25),
    listClosedLost(db, 40),
  ]);
  const batch = batchId ? await getBatch(db, batchId) : [];
  const pending = batchId ? await batchPending(db, batchId) : 0;

  return c.html(
    doc(
      <Layout nav="admin" active="reactivation" title="Reactivation" refreshSeconds={pending > 0 ? 4 : undefined}>
        <Section>
          <PageHead title="Closed-Lost Reactivation" subtitle="Personalized, Marcus-voiced outreach to the dead-lead pile" />
          <ReactivationPage stats={stats} batchId={batchId} batch={batch} pending={pending} recent={recent} closedLost={closedLost} />
        </Section>
      </Layout>,
    ),
  );
});

// ── generate a batch ──────────────────────────────────────────────────
reactivation.post("/generate", async (c) => {
  const db = getDb(c.env.DB);
  const form = await c.req.parseBody({ all: true });
  const raw = form.leadId;
  const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).slice(0, MAX_BATCH);
  if (ids.length === 0) return c.redirect("/admin/reactivation");
  const batchId = await createBatch(db, ids);
  await logEvent(db, { type: "reactivation.batch_started", detail: { count: ids.length, batchId } });
  c.executionCtx.waitUntil(generateBatchMessages(c.env, batchId));
  return c.redirect(`/admin/reactivation?batch=${batchId}`);
});

// ── send one (applies inline edits first) ─────────────────────────────
reactivation.post("/:id/send", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const form = await c.req.parseBody();
  const subject = form.subject !== undefined ? String(form.subject) : undefined;
  const message = form.message_md !== undefined ? String(form.message_md) : undefined;
  if (subject !== undefined && message !== undefined) await editReactivation(db, id, subject, message);
  await sendReactivation(c.env, id);
  return c.redirect(c.req.header("referer") ?? "/admin/reactivation");
});

reactivation.post("/:id/skip", async (c) => {
  const db = getDb(c.env.DB);
  await setReactivationStatus(db, c.req.param("id"), "skipped");
  return c.redirect(c.req.header("referer") ?? "/admin/reactivation");
});

reactivation.post("/:id/replied", async (c) => {
  const db = getDb(c.env.DB);
  await setReactivationStatus(db, c.req.param("id"), "replied");
  await logEvent(db, { type: "reactivation.replied", reactivationId: c.req.param("id") });
  return c.redirect("/admin/reactivation");
});

reactivation.post("/:id/rewon", async (c) => {
  const db = getDb(c.env.DB);
  await markRewon(c.env, c.req.param("id"));
  await logEvent(db, { type: "reactivation.rewon", reactivationId: c.req.param("id") });
  return c.redirect("/admin/reactivation");
});

// ── send all drafts in a batch ────────────────────────────────────────
reactivation.post("/batch/:batchId/send", async (c) => {
  const batchId = c.req.param("batchId");
  const n = await sendBatch(c.env, batchId);
  await logEvent(getDb(c.env.DB), { type: "reactivation.batch_sent", detail: { batchId, sent: n } });
  return c.redirect(`/admin/reactivation?batch=${batchId}`);
});

export default reactivation;
