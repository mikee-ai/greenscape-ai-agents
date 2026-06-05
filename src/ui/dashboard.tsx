import type { FC } from "hono/jsx";
import type { EventRow } from "../db/schema.ts";
import type { DashboardMetrics } from "../services/dashboard.ts";
import type { ReactivationStats } from "../services/reactivation.ts";
import { formatCents, formatCentsCompact } from "../lib/money.ts";
import { durationLabel, timeAgo } from "../lib/time.ts";
import { StatusBadge } from "./components.tsx";

const EVENT_LABEL: Record<string, string> = {
  "lead.created": "New lead arrived",
  "lead.rejected": "Lead webhook rejected",
  "proposal.created": "Quote started",
  "extraction.started": "AI extracting scope",
  "extraction.done": "Scope extracted & priced",
  "extraction.failed": "Extraction failed",
  "draft.done": "Proposal drafted",
  "draft.failed": "Draft failed",
  "proposal.edited": "Proposal edited",
  "proposal.approved": "Proposal approved",
  "email.sent": "Proposal emailed",
  "email.failed": "Email failed",
  "email.skipped": "Email skipped",
  "proposal.viewed": "Customer viewed proposal",
  "payment_link.created": "PayPal deposit link created",
  "payment_link.failed": "PayPal link failed",
  "deposit.paid": "Deposit paid 🎉",
  "proposal.lost": "Proposal marked lost",
  "reactivation.batch_started": "Reactivation batch started",
  "reactivation.generated": "Reactivation message written",
  "reactivation.failed": "Reactivation generation failed",
  "reactivation.sent": "Reactivation sent",
  "reactivation.batch_sent": "Reactivation batch sent",
  "reactivation.replied": "Lead replied",
  "reactivation.rewon": "Lead re-won 🎉",
};

const STATUS_ORDER = ["draft", "extracting", "drafting", "needs_review", "approved", "sent", "viewed", "deposit_paid", "lost", "error"];

export const Dashboard: FC<{ m: DashboardMetrics; react: ReactivationStats; events: EventRow[] }> = ({ m, react, events }) => (
  <div class="stack" style="--gap:24px">
    {/* headline metrics */}
    <div class="grid grid-4">
      <div class="stat">
        <div class="label">Avg quote cycle</div>
        <div class="value">{m.avgCycleMs != null ? durationLabel(0, m.avgCycleMs) : "—"}</div>
        <div class="delta down">was 6–9 days</div>
      </div>
      <div class="stat">
        <div class="label">Open pipeline</div>
        <div class="value">{formatCentsCompact(m.pipelineValueCents)}</div>
        <div class="delta muted">in quotes out & in review</div>
      </div>
      <div class="stat">
        <div class="label">Revenue won</div>
        <div class="value">{formatCentsCompact(m.wonValueCents)}</div>
        <div class="delta up">{m.byStatus["deposit_paid"] ?? 0} deposit(s) paid</div>
      </div>
      <div class="stat">
        <div class="label">AI cost (all-time)</div>
        <div class="value">{formatCents(m.llmCostCents)}</div>
        <div class="delta muted">{m.proposalsTotal} proposals</div>
      </div>
    </div>

    <div class="grid grid-2" style="align-items:start">
      {/* Speed-to-Quote */}
      <div class="card">
        <div class="card-header">
          <h2>⚡ Speed-to-Quote</h2>
          <a class="btn btn-ghost btn-sm" href="/admin/proposals">All proposals →</a>
        </div>
        <p class="muted" style="margin-top:0">{m.activeLeads} active leads awaiting a quote.</p>
        <div class="row wrap" style="gap:8px">
          {STATUS_ORDER.filter((s) => m.byStatus[s]).map((s) => (
            <span class="badge"><StatusBadge value={s} /> {m.byStatus[s]}</span>
          ))}
          {m.proposalsTotal === 0 ? <span class="muted">No proposals yet.</span> : null}
        </div>
        <div class="row" style="margin-top:16px">
          <a class="btn btn-primary btn-sm" href="/admin/leads">Start a quote</a>
        </div>
      </div>

      {/* Reactivation */}
      <div class="card">
        <div class="card-header">
          <h2>♻️ Closed-Lost Reactivation</h2>
          <a class="btn btn-ghost btn-sm" href="/admin/reactivation">Open →</a>
        </div>
        <div class="grid grid-2">
          <div class="stat" style="box-shadow:none;border:none;padding:0">
            <div class="label">Latent revenue</div>
            <div class="value" style="font-size:1.5rem">{formatCentsCompact(react.latentRevenueCents)}</div>
          </div>
          <div class="stat" style="box-shadow:none;border:none;padding:0">
            <div class="label">Dead leads</div>
            <div class="value" style="font-size:1.5rem">{react.closedLost.toLocaleString()}</div>
          </div>
        </div>
        <p class="muted">{react.generated} generated · {react.sent} sent · {react.replied} replied · {react.rewon} re-won</p>
      </div>
    </div>

    {/* activity feed */}
    <div class="card">
      <div class="card-header"><h2>Recent activity</h2></div>
      {events.length === 0 ? (
        <p class="muted">Nothing yet. Activity appears here as leads arrive and proposals move.</p>
      ) : (
        <table class="table">
          <tbody>
            {events.map((e) => (
              <tr>
                <td style="width:60%">
                  {e.status === "error" ? "⚠️ " : ""}
                  {EVENT_LABEL[e.type] ?? e.type}
                </td>
                <td class="muted">{e.status === "error" ? <span class="badge danger">error</span> : null}</td>
                <td class="num muted nowrap">{timeAgo(e.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </div>
);
