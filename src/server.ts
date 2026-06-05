import { serve } from "@hono/node-server";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import app from "./index.tsx";
import * as schema from "./db/schema.ts";
import type { Env } from "./env.ts";

// Node < 19 has no global Web Crypto; the app (ids.ts) relies on crypto.randomUUID
// / getRandomValues (ambient on Workers + Node 19+). Polyfill it for the Node host.
if (!(globalThis as { crypto?: Crypto }).crypto) {
  (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
}

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
  LLM_PROVIDER: process.env.LLM_PROVIDER as Env["LLM_PROVIDER"],
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
  LOCAL_LLM_MODEL: process.env.LOCAL_LLM_MODEL,
  WHISPER_URL: process.env.WHISPER_URL,
  GOTENBERG_URL: process.env.GOTENBERG_URL,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID ?? "",
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET ?? "",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "",
  GHL_API_KEY: process.env.GHL_API_KEY,
  GHL_LOCATION_ID: process.env.GHL_LOCATION_ID,
  GHL_PIPELINE_ID: process.env.GHL_PIPELINE_ID,
  GHL_EMAIL_SEND: process.env.GHL_EMAIL_SEND,
};

const ctx = {
  waitUntil(p: Promise<unknown>) {
    Promise.resolve(p).catch((e) => console.error("bg task:", e));
  },
  passThroughOnException() {},
};

// Static files served by the Node host (Workers serves /public automatically).
const STATIC: Record<string, { body: string; type: string }> = {};
function loadStatic(rel: string, type: string) {
  for (const p of [fileURLToPath(new URL("../public/" + rel, import.meta.url).href), "public/" + rel]) {
    try {
      STATIC["/" + rel] = { body: readFileSync(p, "utf8"), type };
      return;
    } catch {
      /* try next path */
    }
  }
}
loadStatic("app.css", "text/css; charset=utf-8");
loadStatic("dictate.js", "text/javascript; charset=utf-8");

// Binary assets (video) served with HTTP Range support so browsers can seek and
// Safari/iOS can stream. Read as a Buffer (not utf8) and held in memory like STATIC.
const BINARY: Record<string, { buf: Buffer; type: string }> = {};
function loadBinary(rel: string, type: string) {
  for (const p of [fileURLToPath(new URL("../public/" + rel, import.meta.url).href), "public/" + rel]) {
    try {
      BINARY["/" + rel] = { buf: readFileSync(p), type };
      return;
    } catch {
      /* try next path */
    }
  }
}
loadBinary("hero-demo.mp4", "video/mp4");
loadBinary("hero-demo-poster.jpg", "image/jpeg");
loadBinary("build-demo.mp4", "video/mp4");
loadBinary("build-demo-poster.jpg", "image/jpeg");
loadBinary("explainer.mp4", "video/mp4");
loadBinary("explainer-poster.jpg", "image/jpeg");

function serveRange(req: Request, buf: Buffer, type: string): Response {
  const size = buf.length;
  const headers: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=3600",
  };
  const m = (req.headers.get("range") ?? "").match(/^bytes=(\d*)-(\d*)$/);
  if (m) {
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (start > end || end >= size) {
      return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
    }
    return new Response(buf.subarray(start, end + 1), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(buf, { status: 200, headers: { ...headers, "content-length": String(size) } });
}

const port = Number(process.env.PORT ?? 8080);
const hostname = process.env.HOST ?? "127.0.0.1";

serve(
  {
    port,
    hostname,
    fetch: (req: Request) => {
      const u = new URL(req.url);
      const st = STATIC[u.pathname];
      if (st) return new Response(st.body, { headers: { "content-type": st.type, "cache-control": "no-cache" } });
      const bin = BINARY[u.pathname];
      if (bin) return serveRange(req, bin.buf, bin.type);
      return app.fetch(req, env as any, ctx as any);
    },
  },
  (info) => console.log("greenscape listening on :" + info.port),
);
