import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import { LsLogo } from "./components.tsx";

const REPO = "https://github.com/mikee-ai/greenscape-ai-agents";

const STRATEGY = [
  {
    n: 1,
    name: "Speed-to-Quote",
    built: true,
    one: "Site-walk notes → priced, brand-voiced proposal in minutes; Marcus approves instead of drafts.",
    roi: "Recovers ~$420k–$700k/yr lost to faster competitors.",
  },
  {
    n: 2,
    name: "Closed-Lost Reactivation",
    built: true,
    one: "Personalized, Marcus-voiced outreach to 1,400 dead leads — found money the founder isn't counting.",
    roi: "$784k latent revenue (1,400 × 2% × $28k).",
  },
  {
    n: 3,
    name: "Post-Sign Concierge",
    built: false,
    one: "Automates the HOA / permit / deposit chasing that stalls revenue and crew scheduling.",
    roi: "$224k–$336k of delayed revenue accelerated.",
  },
  {
    n: 4,
    name: "Build-Progress Updates",
    built: false,
    one: "Auto, Marcus-voiced updates on CompanyCam/Jobber milestones — kills anxiety calls, drives referrals.",
    roi: "Referral lift + fewer inbound calls to Jenna.",
  },
  {
    n: 5,
    name: "Lead Qualification",
    built: false,
    one: "Instant SMS pre-qual before leads hit Marcus's calendar; filters tire-kickers.",
    roi: "Protects 1–2 hrs/wk of the founder's scarcest resource.",
  },
];

const BUILT = [
  {
    name: "Speed-to-Quote",
    purpose: "Turns messy site-walk notes into a priced, brand-voiced proposal in minutes.",
    points: [
      "Claude (Haiku) extracts scope from dictated notes",
      "Pricing computed in code from a 145-item catalog — the AI never sets a price",
      "Human approves → emailed (SES) with a 50% PayPal deposit link",
    ],
  },
  {
    name: "Closed-Lost Reactivation",
    purpose: "Re-engages dead leads with personal messages grounded in their real CRM notes.",
    points: [
      "Claude (Sonnet) writes per-lead outreach in Marcus's voice",
      "Batch review & approve before anything sends",
      "Tracks sent → replied → re-won",
    ],
  },
];

const DELIVERABLES = [
  { ico: "🌐", title: "Deployed app", sub: "Live, public URL", url: "greenscape.licensescale.com", href: "/admin", cta: "Open the tool" },
  { ico: "💻", title: "GitHub repository", sub: "Public, real commit history", url: "github.com/mikee-ai/greenscape-ai-agents", href: REPO },
  { ico: "📄", title: "Strategy document", sub: "5 agents ranked + pushback", url: "STRATEGY.md", href: `${REPO}/blob/main/STRATEGY.md` },
  { ico: "🎬", title: "Walkthrough", sub: "5-min decision-focused script", url: "LOOM.md", href: `${REPO}/blob/main/LOOM.md` },
];

const CHECKLIST = [
  ["Deployed at a public URL", "greenscape.licensescale.com (self-hosted Node + Cloudflare Tunnel)"],
  ["GitHub repo, real commit history", "incremental commits, no mega-commit"],
  ["Persistent real database", "libSQL/SQLite via Drizzle + migrations — not localStorage/JSON"],
  ["Real LLM API doing real work", "Claude Haiku (extraction) + Sonnet (proposal & reactivation prose)"],
  ["≥1 external integration", "Amazon SES (email) + PayPal (deposit checkout)"],
  ["Documented .env.example", "every secret documented; loaded at runtime"],
  ["Human-in-the-loop approval", "Marcus reviews/edits every proposal & reactivation batch before send"],
  ["Guardrails on AI output", "forced tool-use + Zod + retry + flag-and-fallback; code-computed pricing"],
];

export const Landing: FC = () => (
  <Layout
    nav="landing"
    title="AI Agents for Greenscape Pro"
    description="Speed-to-Quote and Closed-Lost Reactivation — production AI agents built for Greenscape Pro by License & Scale."
  >
    <header class="hero">
      <div class="container">
        <p class="eyebrow" style="margin-bottom:14px"><LsLogo size="1.15rem" onDark /></p>
        <p class="eyebrow" style="color:var(--gold)">AI Consultancy · Take-Home Submission</p>
        <h1>Two agents that close the biggest leaks in a $4.2M build business.</h1>
        <p>
          Greenscape Pro loses qualified deals because quotes take 6–9 days, and leaves ~$784k on the table in
          cold leads. These agents fix both — deployed, persistent, human-in-the-loop, with real Claude + SES +
          PayPal integrations.
        </p>
        <div class="row wrap" style="margin-top:24px">
          <a class="btn btn-accent btn-lg" href="/admin">Open the live tool →</a>
          <a class="btn btn-ghost btn-lg" style="color:#fff;border-color:rgba(255,255,255,.4)" href={REPO}>View on GitHub</a>
          <a class="btn btn-ghost btn-lg" style="color:#fff;border-color:rgba(255,255,255,.4)" href="#strategy">The strategy</a>
        </div>
      </div>
    </header>

    <main class="container page">
      {/* deliverables */}
      <section>
        <p class="eyebrow">Submission</p>
        <h2>Deliverables</h2>
        <div class="grid grid-4" style="margin-top:14px">
          {DELIVERABLES.map((d) => (
            <a class="deliverable" href={d.href}>
              <span class="ico">{d.ico}</span>
              <span>
                <h3>{d.title}</h3>
                <div class="muted" style="font-size:.85rem">{d.sub}</div>
                <div class="url">{d.url}{d.cta ? "" : " ↗"}</div>
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* strategy: 5 agents */}
      <section id="strategy" style="margin-top:40px">
        <p class="eyebrow">Part 1 · Strategy</p>
        <h2>The 5 agents, ranked by leverage — not the founder's gut</h2>
        <p class="muted" style="max-width:70ch">
          Greenscape isn't lead-constrained; it's <strong>quote-constrained and founder-constrained</strong>. The
          ranking follows the data. (Full reasoning, ROI math, and the pushback on the founder's priorities are in
          the <a href={`${REPO}/blob/main/STRATEGY.md`}>strategy doc</a>.)
        </p>
        <div class="card rank-list" style="margin-top:14px">
          {STRATEGY.map((a) => (
            <div class={`rank${a.built ? " built" : ""}`}>
              <span class="n">{a.n}</span>
              <span class="body">
                <h3>
                  {a.name}
                  {a.built ? <span class="badge ok">✓ Built &amp; live</span> : <span class="badge">Roadmap</span>}
                </h3>
                <div class="muted">{a.one}</div>
                <div class="eyebrow" style="margin-top:4px">{a.roi}</div>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* built agents */}
      <section style="margin-top:40px">
        <p class="eyebrow">Part 2 · Built</p>
        <h2>Two agents, built end-to-end and live</h2>
        <div class="grid grid-2" style="margin-top:14px">
          {BUILT.map((a, i) => (
            <article class="feature-card">
              <div class="num-chip">{i + 1}</div>
              <h2>{a.name}</h2>
              <p class="muted">{a.purpose}</p>
              <ul>{a.points.map((p) => <li>{p}</li>)}</ul>
              <a class="btn btn-primary btn-sm" style="margin-top:12px" href="/admin">Open in the tool →</a>
            </article>
          ))}
        </div>
      </section>

      {/* architecture */}
      <section class="card pad-lg" style="margin-top:40px">
        <p class="eyebrow">How it's built</p>
        <h2>Real engineering — and the AI never sets a price.</h2>
        <p class="muted" style="max-width:75ch">
          Claude decides <em>which</em> catalog items apply and <em>how much</em> of each; every dollar is a
          deterministic, unit-tested function of database rows. A hallucinated price on a $42k contract is
          structurally impossible — the worst case is a line flagged for review, never a wrong number sent.
        </p>
        <div class="grid grid-4" style="margin-top:16px">
          <div><h3>Node + Cloudflare Tunnel</h3><p class="muted">Self-hosted at a public URL; also runs on Workers from the same code.</p></div>
          <div><h3>libSQL / SQLite</h3><p class="muted">Real database with migrations — every lead, proposal, and event persisted.</p></div>
          <div><h3>Claude</h3><p class="muted">Haiku extracts scope, Sonnet writes prose. Forced tool-use + Zod + retry.</p></div>
          <div><h3>SES + PayPal</h3><p class="muted">Proposals email the customer and generate a real deposit link.</p></div>
        </div>
      </section>

      {/* requirements checklist */}
      <section class="card pad-lg" style="margin-top:24px">
        <p class="eyebrow">Brief requirements → delivered</p>
        <ul class="checklist" style="margin-top:12px">
          {CHECKLIST.map(([req, how]) => (
            <li><span class="ck">✓</span><span><strong>{req}</strong> — <span class="muted">{how}</span></span></li>
          ))}
        </ul>
      </section>
    </main>
  </Layout>
);
