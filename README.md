# Greenscape Pro — AI Agents

> Built by **License & Scale** for the AI Developer take-home. Two production agents for a
> Phoenix high-end hardscape/landscape design-build company (Greenscape Pro).

**Live:** https://licenseandscale.mikee.ai · **Strategy:** [`STRATEGY.md`](./STRATEGY.md)

---

## What's here

| Agent | Problem it kills | Status |
|---|---|---|
| **#1 Speed-to-Quote** | Quotes take 6–9 days; 35–40% of qualified $28k deals lost to faster competitors. | ✅ built |
| **#2 Closed-Lost Reactivation** | 1,400 dead leads (~$784k latent) re-engaged sporadically at best. | ✅ built |

## Stack

- **Cloudflare Workers** + **Hono** (server-rendered admin + customer pages) — public URL, edge-deployed
- **D1** (SQLite) + **Drizzle ORM** + SQL migrations — real persistence
- **Claude** via Anthropic SDK — Haiku 4.5 (scope extraction) + Sonnet 4.6 (proposal prose)
- **Amazon SES** (email) + **PayPal** (50% deposit links) — real external integrations
- Hand-written CSS design system (no framework)

## The one architectural rule

**The LLM never computes a price.** Claude extracts *which* catalog items apply and *how much* of
each; every dollar is a deterministic, unit-tested TypeScript function of database rows. A hallucinated
price on a $42k contract is structurally impossible.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars     # fill in ANTHROPIC_API_KEY, AWS_*, PAYPAL_* (see .env.example)
npm run db:migrate:local           # apply migrations to local D1
npm run db:seed:local              # seed pricing catalog + closed-lost leads
npm run dev                        # http://localhost:8787
npm test                           # pricing engine + AI-output validation + state machine
```

## Deploy

```bash
export CLOUDFLARE_API_TOKEN=...    # Workers Scripts:Edit, D1:Edit, Zone DNS:Edit (mikee.ai)
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler d1 create greenscape  # paste database_id into wrangler.jsonc
npm run db:migrate:remote && npm run db:seed:remote
echo "..." | npx wrangler secret put ANTHROPIC_API_KEY   # repeat for AWS_*, PAYPAL_*, ADMIN_PASSWORD
npm run deploy
```

Full setup, architecture, cost analysis, and trade-offs are documented further down as the build
progresses (see [`STRATEGY.md`](./STRATEGY.md) for the 5-agent prioritization).
