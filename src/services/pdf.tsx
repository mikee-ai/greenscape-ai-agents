import { raw } from "hono/html";
import { ProposalDoc } from "../ui/public.tsx";
import type { LineItem, Proposal, Lead } from "../db/schema.ts";

/**
 * PDF export via a self-hosted Gotenberg sidecar (Chromium HTML→PDF over HTTP),
 * integrated over localhost exactly like the Whisper ASR sidecar. We render the
 * SAME `ProposalDoc` the customer sees, inline the site CSS so the PDF is fully
 * self-contained, and POST it to Gotenberg. Node-only (gated by GOTENBERG_URL).
 */

// Print-only tweaks layered on top of the inlined app.css: print backgrounds
// (so the green header survives), flatten the document chrome, and keep rows,
// totals and headings from splitting awkwardly across pages.
const PRINT_CSS = `
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { background:#fff; margin:0; }
  .proposal-doc { border:none; border-radius:0; box-shadow:none; }
  .proposal-doc .doc-head { border-radius:0; }
  table { page-break-inside:auto; }
  tr, .totals, .card { page-break-inside:avoid; }
  h3, h4 { page-break-after:avoid; }
`;

/** Read public/app.css from disk (Node host). Returns "" if unavailable. */
async function loadAppCss(): Promise<string> {
  try {
    const fs = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    for (const p of [fileURLToPath(new URL("../public/app.css", import.meta.url)), "public/app.css"]) {
      try {
        return fs.readFileSync(p, "utf8");
      } catch {
        /* try next path */
      }
    }
  } catch {
    /* node:fs unavailable (e.g. Workers runtime) — caller is gated by GOTENBERG_URL */
  }
  return "";
}

/** A filesystem-safe "ClientName.pdf" for the download. */
export function proposalFilename(lead: Lead | null): string {
  const base = (lead?.name ?? "Greenscape-Proposal").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${base || "Greenscape-Proposal"}.pdf`;
}

/** Render a proposal to a self-contained print HTML document. */
async function proposalHtml(data: { proposal: Proposal; lead: Lead | null; items: LineItem[] }): Promise<string> {
  const css = await loadAppCss();
  return (
    "<!DOCTYPE html>" +
    String(
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <style>{raw(css)}</style>
          <style>{raw(PRINT_CSS)}</style>
        </head>
        <body>
          <ProposalDoc proposal={data.proposal} lead={data.lead} items={data.items} paypalEnabled={false} mode="print" />
        </body>
      </html>,
    )
  );
}

/** Convert a proposal to PDF bytes via Gotenberg. Throws on a non-2xx response. */
export async function buildProposalPdf(
  gotenbergUrl: string,
  data: { proposal: Proposal; lead: Lead | null; items: LineItem[] },
): Promise<ArrayBuffer> {
  const html = await proposalHtml(data);
  const base = gotenbergUrl.replace(/\/$/, "");

  const fd = new FormData();
  fd.append("files", new Blob([html], { type: "text/html" }), "index.html");
  fd.append("paperWidth", "8.5"); // US Letter, inches
  fd.append("paperHeight", "11");
  fd.append("marginTop", "0.4");
  fd.append("marginBottom", "0.4");
  fd.append("marginLeft", "0.4");
  fd.append("marginRight", "0.4");
  fd.append("printBackground", "true");

  const r = await fetch(`${base}/forms/chromium/convert/html`, { method: "POST", body: fd });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`gotenberg ${r.status}: ${detail.slice(0, 200)}`);
  }
  return await r.arrayBuffer();
}
