import { Hono } from "hono";
import { logger } from "hono/logger";
import type { AppEnv } from "./env.ts";
import { Layout, doc } from "./ui/layout.tsx";
import { Landing } from "./ui/landing.tsx";
import webhookRoutes from "./routes/webhook.ts";
import adminRoutes from "./routes/admin.tsx";

const app = new Hono<AppEnv>();

app.use("*", logger());

// Health check — used by the deploy smoke test.
app.get("/health", (c) =>
  c.json({ ok: true, service: "greenscape-ai-agents", time: new Date().toISOString() }),
);

// Public landing page (front door of licenseandscale.mikee.ai).
app.get("/", (c) => c.html(doc(<Landing />)));

// Lead intake (GHL/Meta webhook simulation).
app.route("/webhook", webhookRoutes);

// Internal admin tool (auth-gated inside the sub-app).
app.route("/admin", adminRoutes);

// Customer-facing proposal pages mount here in a later milestone:
//   app.route("/p", publicRoutes);

// ── error + 404 handling (never leak a raw stack to the client) ──
app.notFound((c) =>
  c.html(
    doc(
      <Layout nav="landing" title="Not found">
        <main class="container page center" style="padding:80px 0">
          <h1>404</h1>
          <p class="muted">That page doesn't exist.</p>
          <a class="btn btn-primary" href="/">
            Back home
          </a>
        </main>
      </Layout>,
    ),
    404,
  ),
);

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.html(
    doc(
      <Layout nav="landing" title="Something went wrong">
        <main class="container page center" style="padding:80px 0">
          <h1>Something went wrong</h1>
          <p class="muted">An unexpected error occurred. The team has been notified.</p>
          <a class="btn btn-primary" href="/">
            Back home
          </a>
        </main>
      </Layout>,
    ),
    500,
  );
});

export default app;
