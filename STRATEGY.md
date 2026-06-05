# Greenscape Pro — AI Agent Strategy

**Prepared by License & Scale.** Ranked by leverage from the onboarding data and discovery call — not
by the founder's stated priority order. Greenscape Pro is not lead-constrained; it is **quote-constrained
and founder-constrained**. The ranking follows that.

---

### 1. Speed-to-Quote Proposal Agent  *(P0 — built)*
**Purpose:** Turn Marcus's site-walk notes into a priced, brand-voiced proposal in minutes, so he *approves* proposals instead of *writing* them.

- Claude extracts a structured scope from dictated/typed site-walk notes.
- Pricing is computed in **code** from the 200-item catalog — the AI never sets a price.
- Claude drafts the premium proposal prose; Marcus reviews, edits, and approves (human-in-the-loop).
- On approve: emails the customer the proposal + a 50% deposit link; tracks the quote cycle.

**Replaces:** Marcus personally drafting every proposal — the 6–9 day step where *"I am the bottleneck."*
**ROI:** 35–40% of qualified leads are lost to faster competitors at the proposal stage. Recovering even
half is ~15–25 extra signed projects/yr × $28k ≈ **$420k–$700k/yr in recovered revenue**, plus Marcus's
evenings back. Runs for ~**$3–4/month** in AI.
**Why #1:** It is the single highest-leverage intervention in the business — it plugs the biggest leak *and*
removes the founder as the single point of failure, which is the precondition for hitting the $5.5M goal.

### 2. Closed-Lost Reactivation Agent  *(built)*
**Purpose:** Re-engage the 1,400+ dead leads with personalized, Marcus-voiced outreach — found money.

- Pulls each lead's real context from CRM notes; Claude writes a personal message (never a blast).
- Marcus approves the batch before anything sends; generic-sounding drafts are auto-flagged.
- Sends via email; tracks sent → replied → re-won.

**Replaces:** Brittany's sporadic, manual re-engagement blasts.
**ROI:** 1,400 × 2% re-close × $28k ≈ **$784k latent revenue**; even 0.5% is ~$196k. Marginal cost is pennies per message.
**Why #2:** It's revenue the founder isn't even counting, the lowest-risk build, and it reuses Agent #1's
engine (Claude + CRM context + approve-then-send) — so it ships at ~40% marginal effort.

### 3. Post-Sign Concierge Agent
**Purpose:** Automate the stalled post-signing stages (HOA, permits, deposits) that delay revenue and crew scheduling.

- Stage-based automated follow-ups for HOA submission, permit revisions, and deposit collection.
- Nudges the customer; flags genuine stalls for Jenna; tracks each project's "limbo" time.

**Replaces:** Jenna manually chasing 8–12 projects at a time.
**ROI:** 8–12 projects in limbo × $28k = **$224k–$336k of delayed revenue** accelerated at any moment;
faster cash and tighter crew utilization (which compounds). Frees several of Jenna's hours/week.
**Why #3:** Operationally significant, but it accelerates *timing* of revenue rather than *creating* it — below the two revenue-creating agents.

### 4. Build-Progress Update Agent
**Purpose:** Keep customers informed automatically during the build, in Marcus's voice.

- Triggers on CompanyCam photo uploads / Jobber milestones; sends branded progress updates.
- Prompts the halfway "personal video" moment Marcus already knows drives referrals.

**Replaces:** Inconsistent crew texting and the Loom updates Marcus only manages on ~30% of jobs.
**ROI:** Eliminates the daily "what's happening?" anxiety calls to Jenna and drives referrals (*"the only
contractor who kept us informed"*) — referrals are zero-CAC $28k deals. Protects the premium brand.
**Why #4:** High-signal and low-cost, but it's retention/brand rather than new revenue, and it depends on CompanyCam/Jobber plumbing.

### 5. Lead Qualification Agent
**Purpose:** Instantly respond to and pre-qualify Meta/Google leads via SMS before they reach Marcus's calendar.

- Auto-responds in seconds (speed-to-lead); asks 4–5 qualifying questions (scope, budget, timeline, ownership).
- Routes qualified leads to booking; politely filters tire-kickers; protects site-walk slots.

**Replaces:** Marcus calling everyone, including the 4–6 clearly-unqualified calls/week.
**ROI:** Saves 1–2 hours/week of Marcus's most valuable resource and protects his site-walk calendar.
**Why #5:** It's the smallest-leverage of a strong five — it optimizes the *input* to a funnel whose true
bottleneck (quoting) is fixed by #1. It earns its #5 slot over crew-coaching because it protects the scarce
resource (Marcus's time); do it once #1 has freed capacity.

---

## Why my #1 is not the founder's stated #1

Marcus's stated #1 is *"speed up quoting,"* and mine shares that category — but the **diagnosis differs, and
that changes what you build.** Marcus frames it as a *speed* problem: he wants to quote faster. The data says
it's a *single-point-of-failure* problem — *"I am the bottleneck. I have to touch every proposal. Nobody else
knows how to turn site-walk notes into a scope."* A "faster quoting tool" still depends on Marcus having time
tonight. My agent removes him from drafting entirely and makes him a 60-second approver, so proposals go out
while he's driving to the next site walk.

The sharper disagreement is everything *below* #1: I **delete** his stated #4 (marketing — he conceded on the
call that lead volume isn't the constraint), **demote** his stated #3 (crew coaching) out of the top five, and
**insert Closed-Lost Reactivation at #2** — an agent he never mentioned that is worth more than his #3 and #4
combined.

## One agent I considered and cut: Crew Upsell Coaching

His stated #3, and the most tempting cut — he personally cares about it and it's a clean "AI in their pocket"
use case. Excluded because the math doesn't earn a top-five slot: 4 crews × ~1 miss/week × ~$500 ≈ **$104k/yr**
— real money, but an order of magnitude below the quote-cycle revenue at risk, and it carries the **highest
adoption risk** of any agent here (field crews, hands dirty mid-install, are the least likely to open an app).
Revisit it after the revenue engines (#1, #2) are live and self-funding.

## Interdependencies & honest trade-offs

- **#1 unblocks everything.** Removing the founder bottleneck is what lets added lead/quote volume (#5) convert instead of pile up.
- **#1 → #2 is mostly reuse.** Same engine (Claude + CRM context + human-approve + send); and *lost #1 quotes flow into #2's pile.* Build #1, get #2 cheaply.
- **#3 and #5 ride on GHL automation hooks** — sequence them after the revenue agents.
- **What breaks first at scale:** the quoting agent is only as good as the pricing catalog. The day Greenscape's
  real 200-line spreadsheet drifts from what's loaded, confidence drops and review flags rise — so **catalog
  sync is the first maintenance burden**. By design the agent never invents a price (code computes from the
  catalog), so the failure mode is "flagged for review," not "wrong number sent to a customer." The next
  investment is tightening extraction with few-shot examples from Marcus's real past proposals. In production
  everything routes through **GoHighLevel** ("everything has to be in GHL"); this build isolates that behind a
  clean adapter boundary but is not wired to a live GHL tenant.
