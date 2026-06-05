import type { FC } from "hono/jsx";
import type { CatalogItem, LineItem, Proposal, Lead } from "../db/schema.ts";
import { formatCents } from "../lib/money.ts";

const prettyType = (t: string | null) => (t ? t.replace(/_/g, " ") : "outdoor living");

const REVIEW_REASON: Record<string, string> = {
  low_confidence: "The AI was unsure about one or more items — check the flagged rows.",
  unmapped_items: "The AI found work it couldn't price from the catalog — set a SKU/price on the flagged rows.",
  no_scope_found: "The AI couldn't extract any scope from the notes — add line items manually.",
  parse_failed: "AI generation failed. You can still build this proposal manually, or regenerate.",
};

const ConfidenceBadge: FC<{ value: number | null }> = ({ value }) => {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const cls = value >= 0.85 ? "ok" : value >= 0.7 ? "info" : "warn";
  return <span class={`badge ${cls}`}>AI confidence {pct}%</span>;
};

// ── draft state: enter site-walk notes ────────────────────────────────
export const DraftNotesForm: FC<{ proposal: Proposal; lead: Lead | null }> = ({ proposal, lead }) => (
  <div class="grid grid-2" style="align-items:start">
    <form method="post" action={`/admin/proposals/${proposal.id}/generate`} class="card stack">
      <div>
        <label>Site-walk notes</label>
        <p class="hint">Dictate or paste your raw notes. The AI turns them into a priced proposal in ~30s.</p>
        <textarea
          name="notes"
          rows={14}
          required
          placeholder={"e.g. Backyard ~600 sqft. Belgard pavers, premium. Gas fire pit, custom stone. Demo old concrete patio ~400 sqft. Add cafe lighting around perimeter. Steep slope on the east side, tight side-gate access. HOA approval needed."}
        >{proposal.siteWalkNotes ?? ""}</textarea>
      </div>
      <div class="row">
        <button type="submit" class="btn btn-primary">⚡ Generate proposal</button>
        <span class="hint">Haiku extracts scope → code prices it → Sonnet writes the prose.</span>
      </div>
    </form>
    <div class="card">
      <h3>Lead context</h3>
      <p class="muted" style="white-space:pre-wrap">{lead?.notes || "No notes on file."}</p>
      {lead?.budgetHint ? <p class="muted">Budget hint: <strong>{formatCents(lead.budgetHint)}</strong></p> : null}
      <p class="muted">Project: {prettyType(lead?.projectType ?? null)}</p>
    </div>
  </div>
);

// ── extracting/drafting state: no-JS auto-refresh (Layout sets the meta) ──
export const GeneratingView: FC = () => (
  <div class="card center" style="padding:64px 24px">
    <div class="spinner" style="width:34px;height:34px;margin:0 auto 16px" />
    <h2>Generating proposal…</h2>
    <p class="muted">Reading the site-walk notes, mapping to the catalog, pricing, and writing the proposal.</p>
    <p class="hint">This usually takes 15–40 seconds. The page refreshes automatically.</p>
  </div>
);

const APPROVE_ERROR: Record<string, string> = {
  unpriced: "Some line items are unpriced or flagged. Set a price and quantity on every row before sending.",
  no_items: "Add at least one line item before sending.",
  not_reviewable: "This proposal can no longer be edited.",
};

// ── needs_review / approved / etc: review (editable unless locked) ─────
export const ReviewView: FC<{
  proposal: Proposal;
  lead: Lead | null;
  items: LineItem[];
  catalog: CatalogItem[];
  locked: boolean;
  publicUrl: string;
  error?: string | null;
}> = ({ proposal, lead, items, catalog, locked, publicUrl, error }) => {
  const flagged = items.filter((i) => i.isFlagged);
  return (
    <div class="stack" style="--gap:20px">
      {error && APPROVE_ERROR[error] ? <div class="alert danger">{APPROVE_ERROR[error]}</div> : null}

      {locked ? (
        <div class="card" style="border-color:var(--green-100);background:var(--green-50)">
          <div class="row between wrap">
            <div>
              <h3 style="margin:0">
                {proposal.status === "deposit_paid" ? "✅ Deposit paid — won!" : proposal.status === "viewed" ? "👀 Sent · viewed by customer" : proposal.status === "lost" ? "Marked lost" : "✓ Sent to customer"}
              </h3>
              <p class="muted" style="margin:4px 0 0">
                {proposal.emailMessageId ? "Emailed via SES. " : ""}
                Public link: <a href={publicUrl} target="_blank">{publicUrl}</a>
              </p>
            </div>
            <div class="row">
              <a class="btn btn-ghost btn-sm" href={publicUrl} target="_blank">Open customer page ↗</a>
              {proposal.status !== "deposit_paid" && proposal.status !== "lost" ? (
                <form method="post" action={`/admin/proposals/${proposal.id}/simulate-paid`}>
                  <button class="btn btn-primary btn-sm" type="submit">Simulate deposit paid</button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {proposal.needsReviewReason && REVIEW_REASON[proposal.needsReviewReason] && !locked ? (
        <div class={`alert ${proposal.needsReviewReason === "parse_failed" ? "danger" : "warn"}`}>
          {REVIEW_REASON[proposal.needsReviewReason]}
        </div>
      ) : null}

      <form method="post" action={`/admin/proposals/${proposal.id}/save`} class="card" style="padding:0;overflow:hidden">
        <div class="card-header" style="padding:18px 20px 0">
          <h2 style="margin:0">Line items</h2>
          <div class="row">
            <ConfidenceBadge value={proposal.overallConfidence} />
            {proposal.needsRender ? <span class="badge warn">3D render needed (&gt;$30k)</span> : null}
          </div>
        </div>
        <table class="table" style="margin-top:8px">
          <thead>
            <tr>
              <th>Item</th>
              <th>Unit</th>
              <th class="num">Qty</th>
              <th class="num">Unit $ (cost)</th>
              <th class="num">Margin %</th>
              <th class="num">Line total</th>
              <th class="center">Tax</th>
              {!locked ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={8} class="center muted" style="padding:24px">No line items yet. Add one below or regenerate.</td></tr>
            ) : (
              items.map((it) => (
                <tr class={it.isFlagged ? "table-flag" : ""}>
                  <td>
                    <input class="input-sm" type="text" name={`name_${it.id}`} value={it.name} disabled={locked} style="min-width:200px" />
                    {it.isFlagged ? <div class="hint" style="color:var(--gold)">⚑ {it.flagReason}{it.confidence != null ? ` · ${Math.round(it.confidence * 100)}%` : ""}</div> : null}
                  </td>
                  <td><input class="input-sm" type="text" name={`unit_${it.id}`} value={it.unit} disabled={locked} style="width:80px" /></td>
                  <td class="num"><input class="input-sm num" type="number" step="0.01" name={`qty_${it.id}`} value={String(it.quantity)} disabled={locked} style="width:80px;text-align:right" /></td>
                  <td class="num"><input class="input-sm num" type="number" step="0.01" name={`price_${it.id}`} value={(it.unitPriceCents / 100).toFixed(2)} disabled={locked} style="width:96px;text-align:right" /></td>
                  <td class="num"><input class="input-sm num" type="number" step="1" name={`margin_${it.id}`} value={String(Math.round(it.marginPct * 100))} disabled={locked} style="width:70px;text-align:right" /></td>
                  <td class="num">{formatCents(it.lineTotalCents)}</td>
                  <td class="center"><input type="checkbox" name={`tax_${it.id}`} checked={it.taxable} disabled={locked} /></td>
                  {!locked ? (
                    <td class="num">
                      <button class="btn btn-ghost btn-sm" formaction={`/admin/proposals/${proposal.id}/line-items/${it.id}/delete`} formmethod="post" title="Remove">✕</button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!locked ? (
          <>
            <div style="padding:16px 20px;border-top:1px solid var(--sand-200)">
              <h3>Proposal copy <span class="muted" style="font-weight:400">(markdown — written by Sonnet, editable)</span></h3>
              <div class="field"><label>Cover note</label><textarea name="cover_note_md" rows={3}>{proposal.coverNoteMd ?? ""}</textarea></div>
              <div class="grid grid-2">
                <div class="field"><label>Scope summary</label><textarea name="scope_summary_md" rows={6}>{proposal.scopeSummaryMd ?? ""}</textarea></div>
                <div class="field"><label>Inclusions</label><textarea name="inclusions_md" rows={6}>{proposal.inclusionsMd ?? ""}</textarea></div>
              </div>
              <div class="field"><label>Exclusions / assumptions</label><textarea name="exclusions_md" rows={4}>{proposal.exclusionsMd ?? ""}</textarea></div>
            </div>
            <div class="row" style="padding:16px 20px;border-top:1px solid var(--sand-200);background:var(--sand-50)">
              <button type="submit" class="btn btn-primary">Save changes</button>
              <button class="btn btn-ghost" formaction={`/admin/proposals/${proposal.id}/regenerate`} formmethod="post">↻ Regenerate with AI</button>
            </div>
          </>
        ) : null}
      </form>

      {!locked ? (
        <form method="post" action={`/admin/proposals/${proposal.id}/line-items`} class="card row wrap" style="gap:12px;align-items:flex-end">
          <div class="field" style="margin:0;flex:1;min-width:220px">
            <label>Add line item</label>
            <select name="sku">
              {catalog.map((c) => <option value={c.sku}>{c.category} · {c.name} ({c.unit})</option>)}
            </select>
          </div>
          <div class="field" style="margin:0;width:120px"><label>Qty</label><input type="number" step="0.01" name="quantity" value="1" /></div>
          <button type="submit" class="btn btn-ghost">+ Add</button>
        </form>
      ) : null}

      <div class="grid grid-2" style="align-items:start">
        <div class="card">
          <h3>Lead</h3>
          <p style="margin:0"><strong>{lead?.name}</strong></p>
          <p class="muted" style="margin:2px 0">{prettyType(lead?.projectType ?? null)}{lead?.address ? ` · ${lead.address}` : ""}</p>
          {lead?.email ? <p class="muted" style="margin:2px 0">{lead.email}</p> : null}
        </div>
        <div class="card totals">
          <div class="totals-row"><span class="muted">Subtotal</span><span>{formatCents(proposal.subtotalCents)}</span></div>
          <div class="totals-row"><span class="muted">Tax ({((proposal.taxRateBps ?? 0) / 100).toFixed(2)}%)</span><span>{formatCents(proposal.taxCents)}</span></div>
          <div class="totals-row grand"><span>Total</span><span>{formatCents(proposal.totalCents)}</span></div>
          <div class="totals-row"><span class="muted">50% deposit</span><span>{formatCents(proposal.depositCents)}</span></div>
        </div>
      </div>

      {!locked ? (
        <div class="card row between wrap" style="gap:12px">
          <div>
            <strong>Send this proposal?</strong>
            <p class="muted" style="margin:2px 0 0">
              {flagged.length > 0
                ? `⚑ ${flagged.length} item(s) still flagged — resolve them first.`
                : "Approve to email the customer their proposal + a 50% deposit link."}
            </p>
          </div>
          <div class="row">
            <form method="post" action={`/admin/proposals/${proposal.id}/lost`}>
              <button class="btn btn-danger" type="submit">Mark lost</button>
            </form>
            <form method="post" action={`/admin/proposals/${proposal.id}/approve`}>
              <button class="btn btn-primary btn-lg" type="submit">✓ Approve &amp; Send</button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
