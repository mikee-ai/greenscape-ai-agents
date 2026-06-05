import { serve } from "@hono/node-server";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import app from "./index.tsx";
import * as schema from "./db/schema.ts";
import type { Env } from "./env.ts";

// Minimal .env loader (no dependency) so the host can add secrets by editing
// .env + restarting — no rebuild. Real process env always wins.
try {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
} catch {
  /* no .env present — fine */
}

const client = createClient({ url: process.env.DATABASE_URL ?? "file:./data/greenscape.db" });
const db = drizzle(client, { schema });

const env: Env = {
  DB: db,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? "https://greenscape.licensescale.com",
  PAYPAL_ENV: (process.env.PAYPAL_ENV ?? "sandbox") as Env["PAYPAL_ENV"],
  SES_FROM: process.env.SES_FROM ?? "proposals@mikee.ai",
  AWS_REGION: process.env.AWS_REGION ?? "us-east-1",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID ?? "",
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET ?? "",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "",
};

const ctx = {
  waitUntil(p: Promise<unknown>) {
    Promise.resolve(p).catch((e) => console.error("bg task:", e));
  },
  passThroughOnException() {},
};

let css = "";
try {
  css = readFileSync(fileURLToPath(new URL("../public/app.css", import.meta.url).href), "utf8");
} catch {
  try {
    css = readFileSync("public/app.css", "utf8");
  } catch {}
}

const port = Number(process.env.PORT ?? 8080);
const hostname = process.env.HOST ?? "127.0.0.1";

serve(
  {
    port,
    hostname,
    fetch: (req: Request) => {
      const u = new URL(req.url);
      if (u.pathname === "/app.css")
        return new Response(css, {
          headers: {
            "content-type": "text/css; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      return app.fetch(req, env as any, ctx as any);
    },
  },
  (info) => console.log("greenscape listening on :" + info.port),
);
