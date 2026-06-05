/**
 * Worker bindings + secrets. Mirrors wrangler.jsonc bindings/vars and the
 * secrets set via `wrangler secret put`. Imported everywhere as Hono's Bindings.
 */
export interface Env {
  // ── bindings ──
  DB: D1Database;
  ASSETS: Fetcher;

  // ── vars (wrangler.jsonc) ──
  PUBLIC_BASE_URL: string;
  PAYPAL_ENV: "sandbox" | "live";
  SES_FROM: string;
  AWS_REGION: string;

  // ── secrets (wrangler secret put) ──
  ANTHROPIC_API_KEY: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_CLIENT_SECRET: string;
  ADMIN_PASSWORD: string;
}

/** Hono generics helper: `new Hono<AppEnv>()`. */
export type AppEnv = { Bindings: Env };
