# Loom Walkthrough Script (≤ 5 minutes)

Tight, decision-focused. Don't narrate code line-by-line — explain *why*. Have these tabs open:
`STRATEGY.md`, the live admin dashboard, a lead, and a sent `/p/:token` page.

---

### 0:00 — 0:40 · Who + the one insight (strategy)
> "Greenscape Pro is a $4.2M Phoenix design-build company. The founder's stated #1 was 'speed up quoting.'
> But the data says the real problem isn't speed — it's that *he's* the bottleneck: he personally drafts every
> proposal, it takes 6–9 days, and they lose 35–40% of qualified deals to faster competitors.
> So my #1 doesn't help Marcus quote faster — it removes him from drafting entirely."

Show `STRATEGY.md`. Call out the pushback: **deleted** his marketing pick (he admitted lead volume isn't the
constraint), **demoted** crew coaching (10× smaller, high adoption risk), and **inserted Closed-Lost
Reactivation at #2** — $784k he wasn't even counting.

### 0:40 — 2:30 · P0 working end-to-end (the money shot)
On the admin tool:
1. **New lead arrives** (show the webhook or a lead in the list).
2. Open it → **paste messy site-walk notes** → **Generate**.
3. While it runs (≈20s): *"Haiku extracts the scope, my code prices it from the catalog, Sonnet writes the
   prose. The page auto-refreshes — generation runs in `waitUntil` so the request never hangs."*
4. **Review screen**: point at a **flagged low-confidence row** — *"the AI told me it was unsure, so it's
   flagged for me."* Edit a quantity → **total recomputes server-side**.
5. **Approve & Send** → show the **customer `/p/:token` page** (branded, premium) → the **PayPal deposit button**
   → click **Simulate paid** → status flips to **deposit_paid**, lead becomes **won**.

### 2:30 — 3:10 · Agent #2 (reuse story)
Reactivation tab: *"Same engine — Claude + CRM context + approve-then-send. Pick dead leads, it writes a personal
message grounded in their real notes, I approve the batch, it sends. 1,400 leads, $784k latent. Lost quotes from
Agent #1 flow back into this pile."*

### 3:10 — 4:20 · Architecture decisions (why, not what)
- **"The LLM never computes a price."** Claude picks *which* catalog items and *how much*; every dollar is a
  pure, unit-tested function of integer cents. A hallucinated price is structurally impossible — worst case is
  a flagged line. *(Show `pricing/compute.ts` + the green test run.)*
- **Models:** Haiku for extraction (cheap, structured, catalog prompt-cached), Sonnet for customer-facing prose.
  **~3 cents/proposal, ~$3–4/month** at 150/mo. The thing we're saving is his 6–9 days, not tokens.
- **Stack:** Cloudflare Workers + D1 — one platform, edge-deployed, real SQL with migrations, lives on the
  client-style domain. Hono SSR, no JS framework needed for an 8-screen internal tool.
- **Robustness:** forced tool-use → Zod → one retry → always-editable fallback. Every integration is isolated;
  one failing service never breaks the flow. *(Show the activity feed with an `email.failed` that still advanced to sent.)*

### 4:20 — 5:00 · What I'd build next + honest trade-offs
> "Next: wire GoHighLevel — production routes everything through GHL; I built a clean adapter boundary but didn't
> connect a live tenant. The first thing that breaks at scale is catalog drift — extraction is only as good as
> the loaded catalog — so I'd add few-shot examples from Marcus's real past proposals. And I'd add real reply
> tracking for reactivation. Everything's deployed, persistent, with real Claude + SES + PayPal integrations.
> Thanks for watching."

---
**Don'ts:** no line-by-line code reading; don't demo only the happy path — *show a flagged item and a logged
failure*, that's the differentiator.
