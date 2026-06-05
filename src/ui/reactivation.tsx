import type { FC } from "hono/jsx";
import type { Lead, Reactivation } from "../db/schema.ts";
import { ReactBadge } from "./components.tsx";
import { formatCentsCompact } from "../lib/money.ts";
import { timeAgo } from "../lib/time.ts";
import type { ReactivationStats } from "../services/reactivation.ts";

const prettyType = (t: string | null) => (t ? t.replace(/_/g, " ") : "—");
type Row = { r: Reactivation; lead: Lead | null };

export const ReactivationPage: FC<{
  stats: ReactivationStats;
  batchId: string | null;
  batch: Row[];
  pending: number;
  recent: Row[];
  closedLost: Lead[];
}> = ({ stats, batchId, batch, pending, recent, closedLost }) => (
  <div class="stack" style="--gap:24px">
    {/* funnel */}
    <div class="grid grid-4">
      <div class="stat"><div class="label">Closed-lost pile</div><div class="value">{stats.closedLost.toLocaleString()}</div><div class="delta muted">dead leads</div></div>
      <div class="stat"><div class="label">Latent revenue</div><div class="value">{formatCentsCompact(stats.latentRevenueCents)}</div><div class="delta muted">at 2% re-close × $28k</div></div>
      <div class="stat"><div class="label">Generated → Sent</div><div class="value">{stats.generated} → {stats.sent}</div><div class="delta muted">outreach messages</div></div>
      <div class="stat"><div class="label">Replied / Re-won</div><div class="value">{stats.replied} / {stats.rewon}</div><div class="delta up">recovered</div></div>
    </div>

    {/* batch review */}
    {batchId && batch.length > 0 ? (
      <div class="card">
        <div class="card-header">
          <h2>Batch review {pending > 0 ? <span class="badge info"><span class="spinner" style="width:11px;height:11px" /> generating {pending}…</span> : null}</h2>
          {pending === 0 ? (
            <form method="post" action={`/admin/reactivation/batch/${batchId}/send`}>
              <button class="btn btn-primary" type="submit">Approve &amp; send all ({batch.filter((b) => b.r.status === "draft").length})</button>
            </form>
          ) : null}
        </div>
        <p class="muted">Marcus reviews every message before anything goes out. Edit, send, or skip each one.</p>
        <div class="stack" style="--gap:14px">
          {batch.map(({ r, lead }) => (
            <div class={`card ${r.qualityFlag ? "table-flag" : ""}`} style="box-shadow:none;border-color:var(--sand-200)">
              <div class="row between wrap">
                <div>
                  <strong>{lead?.name ?? "—"}</strong> <span class="muted">· {prettyType(lead?.projectType ?? null)} · lost {timeAgo(lead?.closedLostAt)}</span>
                  {r.qualityFlag ? <span class="badge warn" style="margin-left:8px">⚑ generic — review</span> : null}
                  <ReactBadge value={r.status} />
                </div>
              </div>
              {lead?.notes ? <p class="hint" style="margin:6px 0">CRM: {lead.notes}</p> : null}
              {r.messageMd === null ? (
                <p class="muted"><span class="spinner" style="width:13px;height:13px" /> writing a personal message…</p>
              ) : (
                <form method="post" action={`/admin/reactivation/${r.id}/send`} class="stack" style="--gap:8px">
                  <input class="input-sm" type="text" name="subject" value={r.subject ?? ""} />
                  <textarea name="message_md" rows={4}>{r.messageMd}</textarea>
                  <div class="row">
                    {r.status === "draft" ? <button class="btn btn-primary btn-sm" type="submit">Send</button> : null}
                    <button class="btn btn-ghost btn-sm" formaction={`/admin/reactivation/${r.id}/skip`} formmethod="post">Skip</button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
    ) : null}

    {/* recent */}
    {recent.length > 0 ? (
      <div class="card" style="padding:0;overflow:hidden">
        <div class="card-header" style="padding:18px 20px 0"><h2 style="margin:0">Recent outreach</h2></div>
        <table class="table" style="margin-top:8px">
          <thead><tr><th>Lead</th><th>Status</th><th class="hide-sm">Subject</th><th class="hide-sm">When</th><th></th></tr></thead>
          <tbody>
            {recent.map(({ r, lead }) => (
              <tr>
                <td><strong>{lead?.name ?? "—"}</strong></td>
                <td><ReactBadge value={r.status} /></td>
                <td class="hide-sm muted">{r.subject ?? "—"}</td>
                <td class="hide-sm muted">{timeAgo(r.sentAt ?? r.createdAt)}</td>
                <td class="num">
                  {r.status === "sent" ? (
                    <div class="row" style="justify-content:flex-end">
                      <form method="post" action={`/admin/reactivation/${r.id}/replied`}><button class="btn btn-ghost btn-sm" type="submit">Mark replied</button></form>
                      <form method="post" action={`/admin/reactivation/${r.id}/rewon`}><button class="btn btn-primary btn-sm" type="submit">Re-won</button></form>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null}

    {/* new batch picker */}
    <form method="post" action="/admin/reactivation/generate" class="card">
      <div class="card-header">
        <h2>Start a new batch</h2>
        <button class="btn btn-primary" type="submit">⚡ Generate outreach for selected</button>
      </div>
      <p class="muted">Select closed-lost leads. The AI writes a personal, Marcus-voiced message for each — grounded in their CRM notes.</p>
      <table class="table">
        <thead><tr><th></th><th>Name</th><th>Project</th><th class="hide-sm">Lost</th><th class="hide-sm">Reason</th></tr></thead>
        <tbody>
          {closedLost.map((l) => (
            <tr>
              <td><input type="checkbox" name="leadId" value={l.id} /></td>
              <td><strong>{l.name}</strong></td>
              <td>{prettyType(l.projectType)}</td>
              <td class="hide-sm muted">{timeAgo(l.closedLostAt)}</td>
              <td class="hide-sm muted">{l.closedLostReason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </form>
  </div>
);
