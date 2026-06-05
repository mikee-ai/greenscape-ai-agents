import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../env.ts";
import { getDb } from "../db/client.ts";
import { proposalLineItems, proposals as proposalsTable } from "../db/schema.ts";
import { Layout, doc } from "../ui/layout.tsx";
import { PageHead, StatusBadge, Section, EmptyState } from "../ui/components.tsx";
import { DraftNotesForm, GeneratingView, ReviewView } from "../ui/proposal.tsx";
import { PublicProposal } from "../ui/public.tsx";
import { paypalConfigured } from "../services/paypal.ts";
import { buildProposalPdf, proposalFilename } from "../services/pdf.tsx";
import {
  approveAndSend,
  createProposal,
  getProposal,
  getProposalWithItems,
  listProposals,
  markDepositPaid,
  markLost,
  recomputeAndSave,
  runProposalGeneration,
  saveSiteWalkNotes,
  setStatus,
} from "../services/proposals.ts";
import { getActiveCatalog, findCatalogBySku } from "../services/catalog.ts";
import { logEvent } from "../services/events.ts";
import { computeLineTotalCents } from "../pricing/compute.ts";
import { newId } from "../lib/ids.ts";
import { dollarsToCents, formatCents } from "../lib/money.ts";
import { timeAgo } from "../lib/time.ts";

const proposals = new Hono<AppEnv>();

const EDITABLE = new Set(["needs_review", "error"]);
const num = (v: unknown, fallback = 0) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
};

// ── list ──────────────────────────────────────────────────────────────
proposals.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await listProposals(db, 100);
  return c.html(
    doc(
      <Layout nav="admin" active="proposals" title="Proposals">
        <Section>
          <PageHead title="Proposals" subtitle="Speed-to-Quote pipeline" />
          <div class="card" style="padding:0;overflow:hidden">
            {rows.length === 0 ? (
              <EmptyState title="No proposals yet" hint="Open a lead and start a quote." cta={<a class="btn btn-primary btn-sm" href="/admin/leads">Go to leads</a>} />
            ) : (
              <table class="table">
                <thead><tr><th>Client</th><th>Status</th><th class="num">Total</th><th class="hide-sm">Confidence</th><th class="hide-sm">Updated</th><th></th></tr></thead>
                <tbody>
                  {rows.map(({ p, lead }) => (
                    <tr>
                      <td><strong>{lead?.name ?? "—"}</strong></td>
                      <td><StatusBadge value={p.status} /></td>
                      <td class="num">{p.totalCents ? formatCents(p.totalCents) : "—"}</td>
                      <td class="hide-sm">{p.overallConfidence != null ? `${Math.round(p.overallConfidence * 100)}%` : "—"}</td>
                      <td class="hide-sm muted">{timeAgo(p.updatedAt)}</td>
                      <td class="num"><a class="btn btn-ghost btn-sm" href={`/admin/proposals/${p.id}`}>Open</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Section>
      </Layout>,
    ),
  );
});

// ── create from a lead ────────────────────────────────────────────────
proposals.post("/", async (c) => {
  const db = getDb(c.env.DB);
  const form = await c.req.parseBody();
  const leadId = String(form.leadId ?? "").trim();
  if (!leadId) return c.redirect("/admin/leads");
  const id = await createProposal(db, leadId);
  await logEvent(db, { type: "proposal.created", proposalId: id, leadId });
  return c.redirect(`/admin/proposals/${id}`);
});

// ── voice-to-text for site-walk notes (self-hosted Whisper) ───────────
proposals.post("/transcribe", async (c) => {
  const whisper = c.env.WHISPER_URL;
  if (!whisper) return c.json({ error: "voice-to-text not configured" }, 503);
  const body = await c.req.parseBody();
  const file = body["audio"] as unknown as Blob | string | undefined;
  // Node 18 has no global `File`; duck-type a Blob-like upload instead.
  if (!file || typeof file === "string" || typeof (file as Blob).arrayBuffer !== "function") {
    return c.json({ error: "no audio uploaded" }, 400);
  }
  try {
    const fd = new FormData();
    fd.append("audio_file", file as Blob, "note.webm");
    const r = await fetch(`${whisper.replace(/\/$/, "")}/asr?output=txt&language=en&task=transcribe`, {
      method: "POST",
      body: fd,
    });
    if (!r.ok) return c.json({ error: `transcription service ${r.status}` }, 502);
    const text = (await r.text()).trim();
    return c.json({ text });
  } catch {
    return c.json({ error: "transcription failed" }, 502);
  }
});

// ── detail (state-based) ──────────────────────────────────────────────
proposals.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const data = await getProposalWithItems(db, c.req.param("id"));
  if (!data) return c.notFound();
  const { proposal, lead, items } = data;
  const generating = proposal.status === "extracting" || proposal.status === "drafting";
  const catalog = EDITABLE.has(proposal.status) ? await getActiveCatalog(db) : [];

  return c.html(
    doc(
      <Layout
        nav="admin"
        active="proposals"
        title={`Proposal · ${lead?.name ?? ""}`}
        refreshSeconds={generating ? 3 : undefined}
      >
        <Section>
          <PageHead
            title={lead?.name ?? "Proposal"}
            subtitle={proposal.totalCents ? formatCents(proposal.totalCents) : "Speed-to-Quote"}
            actions={<StatusBadge value={proposal.status} />}
          />
          {proposal.status === "draft" ? (
            <DraftNotesForm proposal={proposal} lead={lead} voiceEnabled={!!c.env.WHISPER_URL} />
          ) : generating ? (
            <GeneratingView />
          ) : (
            <ReviewView
              proposal={proposal}
              lead={lead}
              items={items}
              catalog={catalog}
              locked={!EDITABLE.has(proposal.status)}
              publicUrl={`${c.env.PUBLIC_BASE_URL}/p/${proposal.publicToken}`}
              error={c.req.query("error")}
              pdfEnabled={!!c.env.GOTENBERG_URL}
            />
          )}
        </Section>
      </Layout>,
    ),
  );
});

// ── status (JSON, for programmatic polling) ───────────────────────────
proposals.get("/:id/status", async (c) => {
  const db = getDb(c.env.DB);
  const p = await getProposal(db, c.req.param("id"));
  if (!p) return c.json({ error: "not found" }, 404);
  return c.json({ status: p.status, needsReviewReason: p.needsReviewReason, totalCents: p.totalCents });
});

// ── live customer preview (admin-only; renders at any status) ─────────
proposals.get("/:id/preview", async (c) => {
  const db = getDb(c.env.DB);
  const data = await getProposalWithItems(db, c.req.param("id"));
  if (!data) return c.notFound();
  return c.html(
    doc(
      <PublicProposal
        proposal={data.proposal}
        lead={data.lead}
        items={data.items}
        paypalEnabled={paypalConfigured(c.env)}
        pdfEnabled={!!c.env.GOTENBERG_URL}
      />,
    ),
  );
});

// ── PDF export (self-hosted Gotenberg sidecar) ────────────────────────
proposals.get("/:id/pdf", async (c) => {
  if (!c.env.GOTENBERG_URL) return c.text("PDF export is not configured.", 503);
  const db = getDb(c.env.DB);
  const data = await getProposalWithItems(db, c.req.param("id"));
  if (!data) return c.notFound();
  try {
    const pdf = await buildProposalPdf(c.env.GOTENBERG_URL, data);
    const disposition = c.req.query("download") ? "attachment" : "inline";
    return c.body(pdf, 200, {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="${proposalFilename(data.lead)}"`,
    });
  } catch (err) {
    console.error("pdf export failed:", err);
    return c.text("PDF generation failed.", 502);
  }
});

// ── generate (first run) ──────────────────────────────────────────────
proposals.post("/:id/generate", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const form = await c.req.parseBody();
  const notes = String(form.notes ?? "").trim();
  if (notes) await saveSiteWalkNotes(db, id, notes);
  await setStatus(db, id, "extracting");
  c.executionCtx.waitUntil(runProposalGeneration(c.env, id));
  return c.redirect(`/admin/proposals/${id}`);
});

// ── regenerate (re-run AI on stored notes) ────────────────────────────
proposals.post("/:id/regenerate", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await setStatus(db, id, "extracting");
  c.executionCtx.waitUntil(runProposalGeneration(c.env, id));
  return c.redirect(`/admin/proposals/${id}`);
});

// ── save edits (line items + prose) ───────────────────────────────────
proposals.post("/:id/save", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const data = await getProposalWithItems(db, id);
  if (!data || !EDITABLE.has(data.proposal.status)) return c.redirect(`/admin/proposals/${id}`);
  const form = await c.req.parseBody();

  for (const it of data.items) {
    const qty = num(form[`qty_${it.id}`], it.quantity);
    const priceCents = dollarsToCents(num(form[`price_${it.id}`], it.unitPriceCents / 100));
    const margin = num(form[`margin_${it.id}`], it.marginPct * 100) / 100;
    const name = String(form[`name_${it.id}`] ?? it.name).trim() || it.name;
    const unit = String(form[`unit_${it.id}`] ?? it.unit).trim() || it.unit;
    const taxable = form[`tax_${it.id}`] !== undefined;
    const lineTotal = computeLineTotalCents(qty, priceCents, margin);
    const valid = qty > 0 && priceCents > 0;
    await db
      .update(proposalLineItems)
      .set({
        name,
        unit,
        quantity: qty,
        unitPriceCents: priceCents,
        marginPct: margin,
        lineTotalCents: lineTotal,
        taxable,
        isFlagged: !valid,
        flagReason: valid ? null : !priceCents ? "unmapped" : "missing_quantity",
      })
      .where(eq(proposalLineItems.id, it.id));
  }

  // prose
  const proseKeys = ["cover_note_md", "scope_summary_md", "inclusions_md", "exclusions_md"] as const;
  const proseCols = { cover_note_md: "coverNoteMd", scope_summary_md: "scopeSummaryMd", inclusions_md: "inclusionsMd", exclusions_md: "exclusionsMd" } as const;
  const proseUpdate: Record<string, string> = {};
  for (const k of proseKeys) if (form[k] !== undefined) proseUpdate[proseCols[k]] = String(form[k]);
  if (Object.keys(proseUpdate).length) {
    await db.update(proposalsTable).set(proseUpdate).where(eq(proposalsTable.id, id));
  }

  await recomputeAndSave(db, id);
  await logEvent(db, { type: "proposal.edited", proposalId: id });
  return c.redirect(`/admin/proposals/${id}`);
});

// ── add a manual line item ────────────────────────────────────────────
proposals.post("/:id/line-items", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const form = await c.req.parseBody();
  const sku = String(form.sku ?? "").trim();
  const quantity = num(form.quantity, 1);
  const cat = sku ? await findCatalogBySku(db, sku) : null;
  if (cat) {
    const lineTotal = computeLineTotalCents(quantity, cat.unitPriceCents, cat.defaultMarginPct);
    await db.insert(proposalLineItems).values({
      id: newId(),
      proposalId: id,
      catalogSku: cat.sku,
      name: cat.name,
      unit: cat.unit,
      quantity,
      unitPriceCents: cat.unitPriceCents,
      marginPct: cat.defaultMarginPct,
      lineTotalCents: lineTotal,
      taxable: cat.taxable,
      confidence: null,
      isFlagged: quantity <= 0,
      flagReason: quantity <= 0 ? "missing_quantity" : null,
      source: "manual",
      sortOrder: 999,
    });
    await recomputeAndSave(db, id);
  }
  return c.redirect(`/admin/proposals/${id}`);
});

// ── delete a line item ────────────────────────────────────────────────
proposals.post("/:id/line-items/:lineId/delete", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await db
    .delete(proposalLineItems)
    .where(eq(proposalLineItems.id, c.req.param("lineId")));
  await recomputeAndSave(db, id);
  return c.redirect(`/admin/proposals/${id}`);
});

// ── approve & send (idempotent; emails customer via SES) ──────────────
proposals.post("/:id/approve", async (c) => {
  const id = c.req.param("id");
  const result = await approveAndSend(c.env, id);
  if (!result.ok) return c.redirect(`/admin/proposals/${id}?error=${result.reason}`);
  return c.redirect(`/admin/proposals/${id}`);
});

// ── mark lost (returns lead to the closed-lost pile) ──────────────────
proposals.post("/:id/lost", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await markLost(c.env, id);
  await logEvent(db, { type: "proposal.lost", proposalId: id });
  return c.redirect(`/admin/proposals/${id}`);
});

// ── simulate deposit paid (demo fallback so a live demo never depends on
//    a sandbox PayPal redirect completing) ───────────────────────────────
proposals.post("/:id/simulate-paid", async (c) => {
  const id = c.req.param("id");
  await markDepositPaid(c.env, id);
  return c.redirect(`/admin/proposals/${id}`);
});

export default proposals;
