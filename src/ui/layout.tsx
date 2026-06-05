import type { FC, PropsWithChildren } from "hono/jsx";
import { LsLogo } from "./components.tsx";

type NavVariant = "admin" | "public" | "landing";

const NAV_LINKS: { href: string; label: string; key: string }[] = [
  { href: "/admin", label: "Dashboard", key: "dashboard" },
  { href: "/admin/leads", label: "Leads", key: "leads" },
  { href: "/admin/proposals", label: "Proposals", key: "proposals" },
  { href: "/admin/reactivation", label: "Reactivation", key: "reactivation" },
];

const Brand: FC<{ href?: string }> = ({ href = "/" }) => (
  <a class="brand" href={href}>
    <span class="logo">▲</span> Greenscape&nbsp;Pro
  </a>
);

const Nav: FC<{ variant: NavVariant; active?: string }> = ({ variant, active }) => {
  if (variant === "public") {
    return (
      <nav class="nav">
        <div class="container">
          <Brand href="/" />
          <span style="color:rgba(255,255,255,.6);font-size:.85rem">Outdoor Living, Designed &amp; Built</span>
        </div>
      </nav>
    );
  }
  if (variant === "landing") {
    return (
      <nav class="nav">
        <div class="container">
          <Brand href="/" />
          <div class="links">
            <a href="/admin">Open the tool →</a>
          </div>
        </div>
      </nav>
    );
  }
  return (
    <nav class="nav">
      <div class="container">
        <Brand href="/admin" />
        <div class="links">
          {NAV_LINKS.map((l) => (
            <a href={l.href} class={active === l.key ? "active" : ""}>
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
};

export const Layout: FC<
  PropsWithChildren<{
    title?: string;
    nav?: NavVariant;
    active?: string;
    description?: string;
    /** auto-refresh the page every N seconds (used while an AI job runs) */
    refreshSeconds?: number;
  }>
> = ({ title, nav = "admin", active, description, refreshSeconds, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {refreshSeconds ? <meta http-equiv="refresh" content={String(refreshSeconds)} /> : null}
      <title>{title ? `${title} · Greenscape Pro` : "Greenscape Pro"}</title>
      {description ? <meta name="description" content={description} /> : null}
      <meta property="og:title" content={title ?? "Greenscape Pro"} />
      <meta property="og:type" content="website" />
      <link rel="stylesheet" href="/app.css" />
      <link
        rel="icon"
        href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%231f5a43'/%3E%3Ctext x='50' y='70' font-size='62' text-anchor='middle' fill='%23c7972f'%3E%E2%96%B2%3C/text%3E%3C/svg%3E"
      />
    </head>
    <body>
      <Nav variant={nav} active={active} />
      {children}
      <footer class="site">
        <div class="container row between wrap">
          <span>© Greenscape Pro · Phoenix, AZ</span>
          <span class="muted row" style="gap:8px">
            AI agents by <LsLogo size="0.82rem" /> · Speed-to-Quote &amp; Reactivation
          </span>
        </div>
      </footer>
    </body>
  </html>
);

/** Render a JSX tree to a full HTML5 document string (guarantees the doctype). */
export function doc(node: unknown): string {
  return "<!DOCTYPE html>" + String(node);
}
