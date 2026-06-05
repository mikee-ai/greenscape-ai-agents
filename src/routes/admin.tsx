import { Hono } from "hono";
import { count, eq } from "drizzle-orm";
import type { AppEnv } from "../env.ts";
import { getDb } from "../db/client.ts";
import { leads } from "../db/schema.ts";
import { Layout, doc } from "../ui/layout.tsx";
import { PageHead, EmptyState, Section, LifecycleBadge } from "../ui/components.tsx";
import { createLead, getLead, listLeads } from "../services/leads.ts";
import { logEvent } from "../services/events.ts";
import { formatCents } from "../lib/money.ts";
import { timeAgo, formatDate } from "../lib/time.ts";
import { dollarsToCents } from "../lib/money.ts";
import { adminAuth } from "../lib/auth.ts";

const admin = new Hono<AppEnv>();
admin.use("*", adminAuth);

const PROJECT_TYPES = [
  "paver_patio", "pool_deck", "outdoor_kitchen", "full_yard", "fire_feature",
  "artificial_turf", "pergola", "water_feature", "retaining_wall", "driveway", "other",
];
const prettyType = (t: string | null) => (t ? t.replace(/_/g, " ") : "—");

// ── overview ──────────────────────────────────────────────────────────
admin.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const [activeRow] = await db.select({ n: count() }).from(leads).where(eq(leads.lifecycle, "new"));
  const [lostRow] = await db.select({ n: count() }).from(leads).where(eq(leads.lifecycle, "closed_lost"));
  const recent = await listLeads(db, { lifecycle: "new", limit: 6 });

  return c.html(
    doc(
      <Layout nav="admin" active="dashboard" title="Dashboard">
        <Section>
          <PageHead title="Dashboard" subtitle="Greenscape Pro · operations overview" />
          <div class="grid grid-3">
            <div class="stat">
              <div class="label">Active leads</div>
              <div class="value">{activeRow.n}</div>
              <div class="delta muted">awaiting a quote</div>
            </div>
            <div class="stat">
              <div class="label">Closed-lost pile</div>
              <div class="value">{lostRow.n.toLocaleString()}</div>
              <div class="delta muted">reactivation candidates</div>
            </div>
            <div class="stat">
              <div class="label">Quote cycle target</div>
              <div class="value">&lt; 1 day</div>
              <div class="delta down">was 6–9 days</div>
            </div>
          </div>

          <div class="card" style="margin-top:24px">
            <div class="card-header">
              <h2>Recent active leads</h2>
              <a class="btn btn-ghost btn-sm" href="/admin/leads">View all →</a>
            </div>
            {recent.length === 0 ? (
              <EmptyState title="No active leads yet" hint="Leads arrive via the Meta/GHL webhook or you can add one manually." cta={<a class="btn btn-primary btn-sm" href="/admin/leads/new">Add a lead</a>} />
            ) : (
              <LeadTable rows={recent} />
            )}
          </div>
        </Section>
      </Layout>,
    ),
  );
});

// ── leads list ────────────────────────────────────────────────────────
admin.get("/leads", async (c) => {
  const db = getDb(c.env.DB);
  const filter = c.req.query("filter") === "closed_lost" ? "closed_lost" : "new";
  const rows = await listLeads(db, { lifecycle: filter, limit: 100 });

  return c.html(
    doc(
      <Layout nav="admin" active="leads" title="Leads">
        <Section>
          <PageHead
            title="Leads"
            subtitle={filter === "new" ? "Active pipeline" : "Closed-lost pile (reactivation candidates)"}
            actions={<a class="btn btn-primary" href="/admin/leads/new">+ New lead</a>}
          />
          <div class="row" style="margin-bottom:16px">
            <a class={`btn btn-sm ${filter === "new" ? "btn-primary" : "btn-ghost"}`} href="/admin/leads?filter=new">Active</a>
            <a class={`btn btn-sm ${filter === "closed_lost" ? "btn-primary" : "btn-ghost"}`} href="/admin/leads?filter=closed_lost">Closed-lost</a>
          </div>
          <div class="card" style="padding:0;overflow:hidden">
            {rows.length === 0 ? (
              <EmptyState title="No leads here" hint="Try the other filter, or add a lead." />
            ) : (
              <LeadTable rows={rows} />
            )}
          </div>
        </Section>
      </Layout>,
    ),
  );
});

// ── new lead form ─────────────────────────────────────────────────────
admin.get("/leads/new", (c) =>
  c.html(
    doc(
      <Layout nav="admin" active="leads" title="New lead">
        <main class="container-narrow page">
          <PageHead title="New lead" subtitle="Manually add a lead (or they arrive via the webhook)" />
          <form method="post" action="/admin/leads" class="card stack">
            <div class="field">
              <label>Name *</label>
              <input type="text" name="name" required placeholder="Jane Homeowner" />
            </div>
            <div class="grid grid-2">
              <div class="field"><label>Email</label><input type="email" name="email" placeholder="jane@example.com" /></div>
              <div class="field"><label>Phone</label><input type="tel" name="phone" placeholder="(602) 555-0142" /></div>
            </div>
            <div class="field"><label>Address</label><input type="text" name="address" placeholder="123 E Camelback Rd, Phoenix, AZ 85016" /></div>
            <div class="grid grid-2">
              <div class="field">
                <label>Project type</label>
                <select name="project_type">
                  {PROJECT_TYPES.map((t) => <option value={t}>{prettyType(t)}</option>)}
                </select>
              </div>
              <div class="field"><label>Budget hint ($)</label><input type="number" name="budget" min="0" step="1000" placeholder="28000" /></div>
            </div>
            <div class="field">
              <label>Notes</label>
              <textarea name="notes" placeholder="Context from the call / form…" />
            </div>
            <div class="row">
              <button type="submit" class="btn btn-primary">Create lead</button>
              <a class="btn btn-ghost" href="/admin/leads">Cancel</a>
            </div>
          </form>
        </main>
      </Layout>,
    ),
  ),
);

admin.post("/leads", async (c) => {
  const db = getDb(c.env.DB);
  const form = await c.req.parseBody();
  const name = String(form.name ?? "").trim();
  if (!name) return c.redirect("/admin/leads/new");

  const budgetRaw = String(form.budget ?? "").trim();
  const budget = budgetRaw ? Number(budgetRaw) : NaN;
  const id = await createLead(db, {
    name,
    email: str(form.email),
    phone: str(form.phone),
    address: str(form.address),
    projectType: str(form.project_type),
    budgetHintCents: Number.isFinite(budget) ? dollarsToCents(budget) : undefined,
    source: "manual",
    notes: str(form.notes),
  });
  await logEvent(db, { type: "lead.created", leadId: id, detail: { source: "manual", name } });
  return c.redirect(`/admin/leads/${id}`);
});

// ── lead detail ───────────────────────────────────────────────────────
admin.get("/leads/:id", async (c) => {
  const db = getDb(c.env.DB);
  const lead = await getLead(db, c.req.param("id"));
  if (!lead) return c.notFound();

  return c.html(
    doc(
      <Layout nav="admin" active="leads" title={lead.name}>
        <main class="container-narrow page">
          <PageHead
            title={lead.name}
            subtitle={`${prettyType(lead.projectType)} · ${lead.source ?? ""}`}
            actions={<LifecycleBadge value={lead.lifecycle} />}
          />
          <div class="card stack">
            <div class="grid grid-2">
              <Field label="Email" value={lead.email} />
              <Field label="Phone" value={lead.phone} />
              <Field label="Address" value={lead.address} />
              <Field label="Budget hint" value={lead.budgetHint ? formatCents(lead.budgetHint) : "—"} />
              <Field label="Added" value={`${formatDate(lead.createdAt)} (${timeAgo(lead.createdAt)})`} />
              {lead.closedLostReason ? <Field label="Closed-lost reason" value={lead.closedLostReason} /> : null}
            </div>
            <div>
              <label>Notes</label>
              <p class="muted" style="white-space:pre-wrap">{lead.notes || "—"}</p>
            </div>
          </div>
          <div class="card" style="margin-top:16px">
            <p class="muted" style="margin:0">
              The Speed-to-Quote flow (paste site-walk notes → AI-drafted proposal) attaches here next.
            </p>
          </div>
        </main>
      </Layout>,
    ),
  );
});

// ── stubs for tabs built in later milestones (so nav never 404s) ───────
admin.get("/proposals", (c) =>
  c.html(
    doc(
      <Layout nav="admin" active="proposals" title="Proposals">
        <Section>
          <PageHead title="Proposals" />
          <EmptyState title="The Speed-to-Quote agent lands here" hint="Lead → site-walk notes → AI proposal → approve → send." />
        </Section>
      </Layout>,
    ),
  ),
);

admin.get("/reactivation", (c) =>
  c.html(
    doc(
      <Layout nav="admin" active="reactivation" title="Reactivation">
        <Section>
          <PageHead title="Closed-Lost Reactivation" />
          <EmptyState title="The Reactivation agent lands here" hint="1,400 dead leads → personalized, Marcus-voiced outreach." />
        </Section>
      </Layout>,
    ),
  ),
);

// ── tiny helpers ──────────────────────────────────────────────────────
function str(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : undefined;
}

const Field = ({ label, value }: { label: string; value: string | null }) => (
  <div>
    <label>{label}</label>
    <div>{value || "—"}</div>
  </div>
);

const LeadTable = ({ rows }: { rows: Awaited<ReturnType<typeof listLeads>> }) => (
  <table class="table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Project</th>
        <th class="num">Budget</th>
        <th class="hide-sm">Source</th>
        <th>Status</th>
        <th class="hide-sm">Added</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {rows.map((l) => (
        <tr>
          <td><strong>{l.name}</strong></td>
          <td>{prettyType(l.projectType)}</td>
          <td class="num">{l.budgetHint ? formatCents(l.budgetHint) : "—"}</td>
          <td class="hide-sm">{l.source}</td>
          <td><LifecycleBadge value={l.lifecycle} /></td>
          <td class="hide-sm muted">{timeAgo(l.createdAt)}</td>
          <td class="num"><a class="btn btn-ghost btn-sm" href={`/admin/leads/${l.id}`}>View</a></td>
        </tr>
      ))}
    </tbody>
  </table>
);

export default admin;
