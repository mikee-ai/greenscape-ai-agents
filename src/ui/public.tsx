import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { Layout } from "./layout.tsx";
import type { LineItem, Proposal, Lead } from "../db/schema.ts";
import { formatCents } from "../lib/money.ts";
import { renderMarkdown } from "../lib/markdown.ts";

const prettyType = (t: string | null) => (t ? t.replace(/_/g, " ") : "outdoor living");

/**
 * The proposal document itself — the single source of truth shared by the
 * customer web page and the PDF export. `mode="print"` drops the interactive
 * deposit CTA (a PDF can't take a payment); the totals still show the deposit.
 */
export const ProposalDoc: FC<{
  proposal: Proposal;
  lead: Lead | null;
  items: LineItem[];
  paypalEnabled: boolean;
  mode?: "web" | "print";
}> = ({ proposal, lead, items, paypalEnabled, mode = "web" }) => {
  const paid = proposal.status === "deposit_paid";
  const first = (lead?.name ?? "").split(" ")[0];
  return (
    <article class="proposal-doc">
      <div class="doc-head">
        <div class="row between wrap">
          <div>
            <div style="font-weight:700;font-size:1.4rem">Greenscape Pro</div>
            <div style="color:#cdd9d2">Outdoor Living, Designed &amp; Built · Phoenix, AZ</div>
          </div>
          <div class="right">
            <div style="color:#cdd9d2;font-size:.8rem;text-transform:uppercase;letter-spacing:.1em">Proposal</div>
            <div style="font-weight:700;font-size:1.2rem">{prettyType(lead?.projectType ?? null)}</div>
          </div>
        </div>
      </div>

      <div class="doc-body stack" style="--gap:22px">
        {proposal.coverNoteMd ? <div class="prose">{raw(renderMarkdown(proposal.coverNoteMd))}</div> : <p>Dear {first || "homeowner"}, thank you for the opportunity to design your outdoor space.</p>}

        {proposal.scopeSummaryMd ? (
          <div>
            <h3>Scope of work</h3>
            <div class="prose">{raw(renderMarkdown(proposal.scopeSummaryMd))}</div>
          </div>
        ) : null}

        <div>
          <h3>Project line items</h3>
          <table class="table">
            <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr>
                  <td>{it.name}</td>
                  <td class="num">{it.quantity} {it.unit}</td>
                  <td class="num">{formatCents(it.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div class="totals">
          <div class="totals-row"><span class="muted">Subtotal</span><span>{formatCents(proposal.subtotalCents)}</span></div>
          <div class="totals-row"><span class="muted">Tax</span><span>{formatCents(proposal.taxCents)}</span></div>
          <div class="totals-row grand"><span>Total investment</span><span>{formatCents(proposal.totalCents)}</span></div>
          <div class="totals-row"><span class="muted">50% deposit to begin</span><span><strong>{formatCents(proposal.depositCents)}</strong></span></div>
        </div>

        {proposal.needsRender ? (
          <p class="muted">✦ A 3D rendering of your design is included with this project and will be shared before we break ground.</p>
        ) : null}

        <div class="grid grid-2">
          {proposal.inclusionsMd ? (
            <div><h3>What's included</h3><div class="prose">{raw(renderMarkdown(proposal.inclusionsMd))}</div></div>
          ) : null}
          {proposal.exclusionsMd ? (
            <div><h3>Assumptions &amp; exclusions</h3><div class="prose">{raw(renderMarkdown(proposal.exclusionsMd))}</div></div>
          ) : null}
        </div>

        {mode === "web" && !paid ? (
          <div class="card center" style="background:var(--green-50);border-color:var(--green-100)">
            <h3 style="margin-bottom:6px">Ready to reserve your build date?</h3>
            <p class="muted">Pay your 50% deposit of <strong>{formatCents(proposal.depositCents)}</strong> to lock in your spot on our calendar.</p>
            {paypalEnabled ? (
              <a class="btn btn-accent btn-lg" href={`/p/${proposal.publicToken}/pay`}>Pay deposit with PayPal →</a>
            ) : (
              <p class="muted">(Online payment is being set up — we'll send a secure link shortly.)</p>
            )}
          </div>
        ) : null}

        <p class="center muted" style="font-size:.82rem;margin:8px 0 0">This proposal is valid for 30 days. Greenscape Pro · ROC licensed &amp; insured.</p>
      </div>
    </article>
  );
};

export const PublicProposal: FC<{
  proposal: Proposal;
  lead: Lead | null;
  items: LineItem[];
  paypalEnabled: boolean;
  pdfEnabled?: boolean;
}> = ({ proposal, lead, items, paypalEnabled, pdfEnabled }) => {
  const paid = proposal.status === "deposit_paid";
  const first = (lead?.name ?? "").split(" ")[0];
  return (
    <Layout nav="public" title={`Proposal for ${lead?.name ?? "you"}`}>
      <main class="container-narrow page">
        {paid ? (
          <div class="alert ok" style="margin-bottom:20px">
            ✅ Deposit received — thank you{first ? `, ${first}` : ""}! We'll be in touch to schedule your build.
          </div>
        ) : null}

        {pdfEnabled ? (
          <div class="row" style="justify-content:flex-end;margin-bottom:10px">
            <a class="btn btn-ghost btn-sm" href={`/p/${proposal.publicToken}/pdf?download=1`}>⬇ Download PDF</a>
          </div>
        ) : null}

        <ProposalDoc proposal={proposal} lead={lead} items={items} paypalEnabled={paypalEnabled} mode="web" />
      </main>
    </Layout>
  );
};

export const PublicNotReady: FC = () => (
  <Layout nav="public" title="Proposal">
    <main class="container-narrow page center" style="padding:80px 0">
      <h1>This proposal isn't available</h1>
      <p class="muted">The link may be incorrect or the proposal hasn't been sent yet.</p>
    </main>
  </Layout>
);
