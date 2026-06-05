import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { Layout } from "./layout.tsx";
import { LsLogo } from "./components.tsx";

const REPO = "https://github.com/mikee-ai/greenscape-ai-agents";

/* ── outcome stats (count-up on scroll) ── */
const STATS: { v: string; countup?: number; prefix?: string; suffix?: string; decimals?: number; l: string; s?: string }[] = [
  { v: "Minutes", l: "Quote turnaround", s: "was 6–9 days" },
  { v: "784", countup: 784, prefix: "$", suffix: "k", l: "Latent revenue in dead leads" },
  { v: "1400", countup: 1400, l: "Closed-lost leads to reactivate" },
  { v: "0", countup: 0, prefix: "$", l: "LLM API cost — runs on local Ollama" },
];

/* ── end-to-end flow, grounded in the walkthrough video (data-seek = seconds) ── */
const FLOW: { t: number; ts: string; title: string; body: string }[] = [
  { t: 24, ts: "0:24", title: "Lead lands in GoHighLevel", body: "Every new lead hits their GHL pipeline — the single source of truth — and syncs straight into the proposal generator in real time." },
  { t: 111, ts: "1:51", title: "Dictate the site-walk", body: "“We're building a fence, putting in a bunch of trees, some bushes…” — speak the walkthrough and voice-to-text captures the scope." },
  { t: 135, ts: "2:15", title: "Generate on a local LLM", body: "Ollama drafts a priced, on-brand proposal from Marcus's Brain — running on-box, so there's $0 in API cost." },
  { t: 154, ts: "2:34", title: "Review & edit the line items", body: "Marcus tweaks line items and copy and approves. The human is always in the loop — the AI never sets the final price." },
  { t: 253, ts: "4:13", title: "Approve & send", body: "One click sends the proposal and flips the GHL opportunity to “Proposal sent” in real time." },
  { t: 280, ts: "4:40", title: "Deposit paid → Closed", body: "When the deposit lands, the deal auto-moves to Closed in GoHighLevel — the pipeline stays true without anyone updating it by hand." },
];

const PILLARS: { ico: string; name: string; lead: string; points: string[] }[] = [
  {
    ico: "🔗",
    name: "GoHighLevel is the source of truth",
    lead: "The proposal generator is an external app that stays 100% synced to the client's GHL in real time — both directions.",
    points: [
      "New leads in the GHL pipeline sync into the generator automatically",
      "Sends and deposits flow back, moving opportunities New → Sent → Closed",
      "Connected with a GHL Private Integration token — drop-in for the client's account",
      "Reactivation runs as native GHL automations, fired via the API",
    ],
  },
  {
    ico: "🧠",
    name: "Marcus's Brain is the engine",
    lead: "The real bottleneck is that only Marcus can turn site-walk notes into a scope. So we clone how he quotes.",
    points: [
      "Ingest every past proposal & bid — even handwritten ones",
      "Record “dump sessions” where Marcus talks through deals out loud",
      "That becomes the catalog of real, trusted line items",
      "Then anyone can quote like Marcus — in minutes, not days",
    ],
  },
];

const BUILT = [
  {
    name: "Speed-to-Quote",
    purpose: "Turns dictated site-walk notes into a priced, on-brand proposal in minutes.",
    points: [
      "Voice-to-text captures the walkthrough on site",
      "A local LLM drafts scope + prose from Marcus's Brain ($0 API cost)",
      "Human approves → sent, with the deal synced live to GoHighLevel",
    ],
  },
  {
    name: "Closed-Lost Reactivation",
    purpose: "Re-engages ~1,400 dead leads with personal, founder-voiced outreach.",
    points: [
      "Per-lead messages grounded in their real CRM notes",
      "Batch review & approve before anything sends",
      "Runs as GoHighLevel automations — fired externally or natively",
    ],
  },
];

const STRATEGY = [
  { n: 1, name: "Speed-to-Quote", built: true, one: "Site-walk notes → priced, on-brand proposal in minutes; Marcus approves instead of drafts.", roi: "Recovers ~$420k–$700k/yr lost to faster competitors." },
  { n: 2, name: "Closed-Lost Reactivation", built: true, one: "Personalized, founder-voiced outreach to 1,400 dead leads — found money nobody's counting.", roi: "$784k latent revenue (1,400 × 2% × $28k)." },
  { n: 3, name: "Post-Sign Follow-Up", built: false, one: "Automates HOA, permits, deposits, and customer nudges that stall revenue and scheduling.", roi: "$224k–$336k of delayed revenue accelerated." },
  { n: 4, name: "Project Update", built: false, one: "Automated customer comms from CompanyCam/Jobber milestones — kills anxiety calls, drives referrals.", roi: "Referral lift + fewer inbound calls." },
  { n: 5, name: "Lead Qualification", built: false, one: "Instant SMS pre-qual before leads hit Marcus's calendar; filters tire-kickers.", roi: "Protects 1–2 hrs/wk of the founder's scarcest resource." },
];

const ARCH = [
  { h: "Node + Cloudflare Tunnel", p: "Self-hosted at a public URL; copy-paste portable to any VPS. The same codebase also runs on Cloudflare Workers." },
  { h: "libSQL / SQLite", p: "A real database with migrations — every lead, proposal, and event persisted. Not localStorage or JSON." },
  { h: "Local Ollama (or any API)", p: "Runs on-box for $0 API cost. Swap in Claude or any provider with one config change." },
  { h: "Guardrails on output", p: "Forced tool-use + Zod + retry. The AI picks line items; pricing is computed in code, never hallucinated." },
];

const HOLES = [
  { k: "1", h: "Finalize Marcus's Brain", p: "Ingest every past proposal & bid (even handwritten), plus recorded “dump sessions” with Marcus, to build the catalog of real, trusted line items." },
  { k: "2", h: "Wire the GoHighLevel automations", p: "Follow-ups, nudges, and the full reactivation flow as native GHL automations, fired via the API." },
  { k: "3", h: "Tune to how they actually quote", p: "Match Marcus's pricing, phrasing, and pitch once real client data is loaded — so every line item is exactly right." },
];

const DELIVERABLES = [
  { ico: "🌐", title: "Deployed app", sub: "Live, public URL", url: "greenscape.licensescale.com", href: "/admin" },
  { ico: "💻", title: "GitHub repository", sub: "Public, real commit history", url: "github.com/mikee-ai/greenscape-ai-agents", href: REPO },
  { ico: "📄", title: "Strategy document", sub: "5 agents ranked + pushback", url: "STRATEGY.md", href: `${REPO}/blob/main/STRATEGY.md` },
  { ico: "🎬", title: "Walkthrough", sub: "Watch the build, end to end", url: "7-min video", href: "#walkthrough" },
];

const CHECKLIST: [string, string][] = [
  ["Deployed at a public URL", "greenscape.licensescale.com (self-hosted Node + Cloudflare Tunnel)"],
  ["GitHub repo, real commit history", "incremental commits, no mega-commit"],
  ["Persistent real database", "libSQL/SQLite via Drizzle + migrations — not localStorage/JSON"],
  ["Real LLM doing real work", "local Ollama for extraction + proposal/reactivation prose"],
  ["≥1 external integration", "GoHighLevel (source of truth) + PayPal deposit + SES email"],
  ["Documented .env.example", "every secret documented; loaded at runtime"],
  ["Human-in-the-loop approval", "Marcus reviews/edits every proposal & reactivation batch before send"],
  ["Guardrails on AI output", "forced tool-use + Zod + retry; code-computed pricing"],
];

const SCRIPT = `
(function(){
  var rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fmt(n,d){ return d>0 ? n.toFixed(d) : Math.round(n).toLocaleString('en-US'); }
  function countup(el){
    var target=parseFloat(el.getAttribute('data-countup'))||0;
    var d=parseInt(el.getAttribute('data-decimals')||'0',10);
    var pre=el.getAttribute('data-prefix')||'', suf=el.getAttribute('data-suffix')||'';
    if(rm){ el.textContent=pre+fmt(target,d)+suf; return; }
    var t0=null, dur=1300;
    function step(t){ if(!t0)t0=t; var p=Math.min((t-t0)/dur,1); var e=1-Math.pow(1-p,3);
      el.textContent=pre+fmt(target*e,d)+suf; if(p<1)requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  var io = new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in');
      if(e.target.hasAttribute('data-countup')) countup(e.target);
      io.unobserve(e.target); } });
  }, {threshold:0.16, rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('.reveal,[data-countup]').forEach(function(el){ io.observe(el); });
  document.querySelectorAll('[data-seek]').forEach(function(b){
    b.addEventListener('click', function(){
      var v=document.getElementById('demo'); if(!v) return;
      v.currentTime=parseFloat(b.getAttribute('data-seek'))||0;
      var pr=v.play(); if(pr&&pr.catch) pr.catch(function(){});
      v.scrollIntoView({behavior:'smooth', block:'center'});
    });
  });
})();
`;

export const Landing: FC = () => (
  <Layout
    nav="landing"
    title="AI Agents for Greenscape Pro"
    description="An external proposal generator, synced to GoHighLevel in real time, that turns dictated site-walk notes into priced proposals on a local LLM — built for Greenscape Pro by License & Scale."
  >
    {/* ── FILM HERO (autoplay explainer, contained 3/4 width, first thing on the page) ── */}
    <section class="film-hero" style="background:linear-gradient(160deg,#12352a,#1f5a43 70%);padding:46px 24px 36px;display:flex;justify-content:center">
      <div style="position:relative;width:75%;max-width:1180px;min-width:320px;line-height:0">
        <video
          id="explainer"
          autoplay
          muted
          loop
          controls
          controlslist="nodownload"
          playsinline
          preload="auto"
          poster="/explainer-poster.jpg?v=2"
          style="display:block;width:100%;height:auto;border-radius:16px;background:#0a0d0b;border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 70px rgba(0,0,0,.45)"
        >
          <source src="/explainer.mp4?v=2" type="video/mp4" />
        </video>
        <button
          id="explainer-unmute"
          type="button"
          style="position:absolute;right:16px;top:16px;z-index:3;display:inline-flex;align-items:center;gap:8px;font:700 13px/1 var(--font);letter-spacing:.01em;color:#fff;background:rgba(18,53,42,.74);border:1px solid rgba(255,255,255,.4);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);padding:10px 16px;border-radius:999px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.4)"
        >
          🔊 Tap for sound
        </button>
        <script>{raw("(function(){var v=document.getElementById('explainer'),b=document.getElementById('explainer-unmute');if(!v)return;function hide(){if(b)b.style.display='none';}function sound(){v.muted=false;var p=v.play();if(p&&p.catch)p.catch(function(){v.muted=true;v.play();});setTimeout(function(){if(!v.muted)hide();},150);}v.addEventListener('canplay',sound,{once:true});if(v.readyState>=2)sound();var g=function(){sound();['click','touchstart','keydown'].forEach(function(e){document.removeEventListener(e,g);});window.removeEventListener('scroll',g);};['click','touchstart','keydown'].forEach(function(e){document.addEventListener(e,g,{passive:true});});window.addEventListener('scroll',g,{passive:true});if(b)b.addEventListener('click',sound);})();")}</script>
      </div>
    </section>

    {/* ── HERO (2-column) ── */}
    <header class="hero">
      <div class="container">
        <div class="hero-grid" style="align-items:start">
          <div class="hero-copy">
            <p class="eyebrow" style="margin-bottom:14px"><LsLogo size="1.05rem" onDark /></p>
            <p class="eyebrow" style="color:var(--gold)">AI Developer Take-Home · Greenscape Pro</p>
            <h1>From site-walk notes to a sent, synced proposal — in minutes, not 6–9 days.</h1>
            <p class="lede">
              An external proposal generator that stays <strong>100% synced to GoHighLevel</strong> in real time. Dictate
              the walkthrough, a <strong>local LLM</strong> drafts a priced proposal from <strong>Marcus's Brain</strong>,
              you approve — and the deal flows New → Sent → Closed in their CRM automatically.
            </p>
            <div class="row wrap" style="margin-top:26px">
              <a class="btn btn-accent btn-lg" href="/admin">Open the live tool →</a>
              <button class="btn btn-ghost btn-lg btn-onhero" type="button" data-seek="0">▶ Watch the 7-min walkthrough</button>
            </div>
            <div class="trust-row">
              <span class="chip"><span class="dot" /> Live &amp; synced to GoHighLevel</span>
              <span class="chip">⚡ Local Ollama · $0 API cost</span>
              <span class="chip">✋ Human approves every send</span>
            </div>
          </div>
          <div class="hero-media reveal" id="walkthrough">
            <div class="video-frame">
              <video id="demo" controls preload="metadata" playsinline poster="/hero-demo-poster.jpg">
                <source src="/hero-demo.mp4" type="video/mp4" />
              </video>
            </div>
            <div class="hero-walkthrough">
              <p class="eyebrow" style="color:var(--gold);margin-top:18px">The walkthrough</p>
              <h2 style="font-size:1.3rem;margin:.15em 0 .35em;color:#fff">See the whole thing, live.</h2>
              <p style="color:rgba(255,255,255,.82);font-size:.92rem;margin:0 0 12px">
                6:49, narrated — a real proposal generated, edited, sent, and closed against a live GoHighLevel account.
              </p>
              <div style="display:grid;gap:6px;justify-items:start">
                {FLOW.map((f) => (
                  <button class="seek" type="button" data-seek={String(f.t)}>▶ {f.ts} · {f.title}</button>
                ))}
              </div>
              <p style="color:rgba(255,255,255,.62);font-size:.8rem;margin-top:10px">↑ Jumps to that moment in the video above.</p>
            </div>
          </div>
        </div>
      </div>
    </header>

    {/* ── STAT BAND (count-up) ── */}
    <section class="statband">
      <div class="container">
        {STATS.map((s) => (
          <div class="bigstat reveal">
            <div class="v">
              {s.countup !== undefined ? (
                <span data-countup={String(s.countup)} data-prefix={s.prefix ?? ""} data-suffix={s.suffix ?? ""} data-decimals={String(s.decimals ?? 0)}>
                  {(s.prefix ?? "") + "0" + (s.suffix ?? "")}
                </span>
              ) : (
                s.v
              )}
            </div>
            <div class="l">{s.l}</div>
            {s.s ? <div class="s">{s.s}</div> : null}
          </div>
        ))}
      </div>
    </section>

    <main class="container">
      {/* ── PROBLEM ── */}
      <section class="sec">
        <div class="sec-head reveal">
          <p class="eyebrow">The real constraint</p>
          <h2>Greenscape isn't lead-constrained. It's quote-constrained — and founder-constrained.</h2>
        </div>
        <div class="grid grid-2" style="align-items:stretch">
          <blockquote class="quote reveal">
            <p>“I am the bottleneck. I have to touch every proposal. Nobody else knows how to turn site-walk notes into a scope.”</p>
            <cite>— Marcus, founder · ~$4.2M/yr, ~150 projects at a $28k average</cite>
          </blockquote>
          <div class="reveal d1" style="align-self:center">
            <p class="muted" style="font-size:1.05rem;max-width:48ch">
              Quotes take <strong>6–9 days</strong> and <strong>35–40% of qualified deals</strong> are lost to faster
              competitors during the proposal stage. The fix isn't more leads — it's removing Marcus from drafting and
              making GoHighLevel tell the truth automatically.
            </p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS (flow, seek video) ── */}
      <section class="sec" id="how">
        <div class="sec-head reveal">
          <p class="eyebrow">How it works · end to end</p>
          <h2>Notes in, a closed deal out — without Marcus drafting a thing.</h2>
          <p class="muted">Each step is from the live walkthrough. Hit <strong>▶</strong> on any step to jump there in the video.</p>
        </div>
        <div class="flow">
          {FLOW.map((f, i) => (
            <div class={`step reveal d${(i % 4) + 1}`}>
              <div class="idx">{i + 1}</div>
              <div class="step-body">
                <div class="row wrap" style="gap:10px;align-items:center;margin-bottom:2px">
                  <h3 style="margin:0">{f.title}</h3>
                  <button class="seek" type="button" data-seek={String(f.t)}>▶ {f.ts}</button>
                </div>
                <p class="muted" style="margin:0">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TWO PILLARS ── */}
      <section class="sec">
        <div class="sec-head reveal">
          <p class="eyebrow">What makes it work</p>
          <h2>Two things — and everything else follows.</h2>
        </div>
        <div class="grid grid-2">
          {PILLARS.map((p, i) => (
            <article class={`pillar reveal d${i + 1}`}>
              <div class="pillar-ico">{p.ico}</div>
              <h3>{p.name}</h3>
              <p class="muted">{p.lead}</p>
              <ul class="ticks">{p.points.map((pt) => <li>{pt}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      {/* ── STRATEGY: 5 agents ── */}
      <section class="sec" id="strategy">
        <div class="sec-head reveal">
          <p class="eyebrow">Part 1 · Strategy</p>
          <h2>The 5 agents, ranked by leverage — not the founder's gut.</h2>
          <p class="muted" style="max-width:70ch">
            Full reasoning, ROI math, and the pushback on the founder's priorities are in the{" "}
            <a href={`${REPO}/blob/main/STRATEGY.md`}>strategy doc</a>.
          </p>
        </div>
        <div class="card rank-list reveal">
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

      {/* ── BUILT ── */}
      <section class="sec">
        <div class="sec-head reveal">
          <p class="eyebrow">Part 2 · Built</p>
          <h2>Two agents, built end-to-end and live.</h2>
        </div>
        <div class="grid grid-2">
          {BUILT.map((a, i) => (
            <article class={`feature-card reveal d${i + 1}`}>
              <div class="num-chip">{i + 1}</div>
              <h2>{a.name}</h2>
              <p class="muted">{a.purpose}</p>
              <ul class="ticks">{a.points.map((p) => <li>{p}</li>)}</ul>
              <a class="btn btn-primary btn-sm" style="margin-top:12px" href="/admin">Open in the tool →</a>
            </article>
          ))}
        </div>
      </section>

      {/* ── ARCHITECTURE ── */}
      <section class="sec">
        <div class="sec-head reveal">
          <p class="eyebrow">How it's built</p>
          <h2>Real engineering — and the AI never sets a price.</h2>
        </div>
        <div class="grid grid-4">
          {ARCH.map((a, i) => (
            <div class={`mini-card reveal d${(i % 4) + 1}`}>
              <h3>{a.h}</h3>
              <p class="muted">{a.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── BUILT WITH CLAUDE CODE (build walkthrough video) ── */}
      <section class="sec center" id="build">
        <div class="sec-head reveal" style="margin-left:auto;margin-right:auto">
          <p class="eyebrow">Behind the build</p>
          <h2>Built with Claude Code.</h2>
          <p class="muted" style="margin:0 auto;max-width:62ch">A walkthrough of how the whole system — the two agents, the real-time GoHighLevel sync, and the proposal engine — was built end to end.</p>
        </div>
        <div class="build-video reveal" style="max-width:900px;margin:0 auto">
          <video id="build" controls preload="metadata" playsinline poster="/build-demo-poster.jpg" style="display:block;width:100%;height:auto;border-radius:14px;background:#000;border:1px solid var(--sand-200);box-shadow:var(--shadow-lg)">
            <source src="/build-demo.mp4" type="video/mp4" />
          </video>
          <p class="muted" style="margin-top:12px;font-size:.85rem">▶ 3:19 · built with Claude Code</p>
        </div>
      </section>

      {/* ── ROADMAP / HOLES ── */}
      <section class="sec">
        <div class="sec-head reveal">
          <p class="eyebrow">Honest holes · what makes it 100% real</p>
          <h2>What's left — and exactly how we close it.</h2>
          <p class="muted" style="max-width:68ch">Straight from the walkthrough: the system is live, but real client data turns it from a demo into Marcus-grade quoting.</p>
        </div>
        <div class="holes">
          {HOLES.map((h, i) => (
            <div class={`hole reveal d${(i % 4) + 1}`}>
              <div class="k">{h.k}</div>
              <div>
                <h3 style="margin:0 0 2px">{h.h}</h3>
                <p class="muted" style="margin:0">{h.p}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA BAND ── */}
      <section class="sec">
        <div class="cta-band reveal">
          <p class="eyebrow" style="color:var(--gold)">Ready when you are</p>
          <h2>Open the live tool, or watch the build.</h2>
          <p style="color:rgba(255,255,255,.88);max-width:52ch;margin:0 auto 22px">
            It's deployed, persistent, synced to a real GoHighLevel account, and human-in-the-loop — running on a local LLM at $0 API cost.
          </p>
          <div class="row wrap" style="justify-content:center">
            <a class="btn btn-accent btn-lg" href="/admin">Open the live tool →</a>
            <a class="btn btn-ghost btn-lg btn-onhero" href={REPO}>View on GitHub</a>
            <button class="btn btn-ghost btn-lg btn-onhero" type="button" data-seek="0">▶ Watch the walkthrough</button>
          </div>
        </div>
      </section>

      {/* ── DELIVERABLES ── */}
      <section class="sec">
        <div class="sec-head reveal">
          <p class="eyebrow">Submission</p>
          <h2>Deliverables</h2>
        </div>
        <div class="grid grid-4">
          {DELIVERABLES.map((d, i) => (
            <a class={`deliverable reveal d${(i % 4) + 1}`} href={d.href}>
              <span class="ico">{d.ico}</span>
              <span>
                <h3>{d.title}</h3>
                <div class="muted" style="font-size:.85rem">{d.sub}</div>
                <div class="url">{d.url} ↗</div>
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* ── CHECKLIST ── */}
      <section class="sec">
        <div class="card pad-lg reveal">
          <p class="eyebrow">Brief requirements → delivered</p>
          <ul class="checklist" style="margin-top:12px">
            {CHECKLIST.map(([req, how]) => (
              <li><span class="ck">✓</span><span><strong>{req}</strong> — <span class="muted">{how}</span></span></li>
            ))}
          </ul>
        </div>
      </section>
    </main>

    <script>{raw(SCRIPT)}</script>
  </Layout>
);
