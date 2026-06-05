import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";

const AGENTS = [
  {
    n: 1,
    name: "Speed-to-Quote",
    purpose: "Turns messy site-walk notes into a priced, brand-voiced proposal in minutes — Marcus just approves.",
    points: [
      "Claude extracts scope from dictated notes",
      "Pricing computed in code from a 200-item catalog (never by the AI)",
      "Human-in-the-loop approve → emailed with a 50% deposit link",
    ],
    impact: "Attacks the 35–40% of qualified deals lost to faster competitors.",
  },
  {
    n: 2,
    name: "Closed-Lost Reactivation",
    purpose: "Re-engages 1,400 dead leads with personalized, Marcus-voiced messages — found money.",
    points: [
      "Claude writes per-lead outreach grounded in real CRM notes",
      "Batch review & approve before anything sends",
      "Tracks sent → replied → re-won",
    ],
    impact: "1,400 leads × 2% × $28k ≈ $784k of latent revenue.",
  },
];

export const Landing: FC = () => (
  <Layout
    nav="landing"
    title="AI Agents for Greenscape Pro"
    description="Speed-to-Quote and Closed-Lost Reactivation — production AI agents built for Greenscape Pro by License & Scale."
  >
    <header class="hero">
      <div class="container">
        <p class="eyebrow">License &amp; Scale · AI Consultancy</p>
        <h1>Two agents that close the biggest leaks in a $4.2M build business.</h1>
        <p>
          Greenscape Pro loses qualified deals because quotes take 6–9 days, and leaves ~$784k on the
          table in cold leads. These agents fix both — deployed, persistent, human-in-the-loop.
        </p>
        <div class="row" style="margin-top:24px">
          <a class="btn btn-accent btn-lg" href="/admin">Open the admin tool →</a>
          <a class="btn btn-ghost btn-lg" style="color:#fff;border-color:rgba(255,255,255,.4)" href="#agents">
            See the agents
          </a>
        </div>
      </div>
    </header>

    <main class="container page" id="agents">
      <div class="grid grid-2">
        {AGENTS.map((a) => (
          <article class="feature-card">
            <div class="num-chip">{a.n}</div>
            <h2>{a.name}</h2>
            <p class="muted">{a.purpose}</p>
            <ul>
              {a.points.map((p) => (
                <li>{p}</li>
              ))}
            </ul>
            <p class="eyebrow" style="margin-top:14px">{a.impact}</p>
          </article>
        ))}
      </div>

      <section class="card pad-lg" style="margin-top:28px">
        <p class="eyebrow">How it's built</p>
        <h2>Real engineering, not a demo that breaks off the happy path.</h2>
        <div class="grid grid-4" style="margin-top:16px">
          <div>
            <h3>Cloudflare Workers</h3>
            <p class="muted">Edge-deployed Hono app at a public URL with server-rendered pages.</p>
          </div>
          <div>
            <h3>D1 (SQL)</h3>
            <p class="muted">Real database with migrations — every lead, proposal, and event persisted.</p>
          </div>
          <div>
            <h3>Claude</h3>
            <p class="muted">Haiku extracts scope, Sonnet writes prose. The AI never sets a price.</p>
          </div>
          <div>
            <h3>SES + PayPal</h3>
            <p class="muted">Proposals email the customer and generate a real deposit payment link.</p>
          </div>
        </div>
      </section>
    </main>
  </Layout>
);
