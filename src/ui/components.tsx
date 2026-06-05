import type { FC, PropsWithChildren } from "hono/jsx";

/** License & Scale logo lockup — gradient wordmark + hexagon/up-arrow mark. */
export const LsLogo: FC<{ size?: string; onDark?: boolean }> = ({ size = "1rem", onDark }) => (
  <span class={`ls-logo${onDark ? " on-dark" : ""}`} style={`font-size:${size}`} aria-label="License & Scale">
    <span class="ls-word">LICENSE &amp; SCALE</span>
    <svg class="ls-mark" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lsmark" x1="0" y1="0" x2="40" y2="48" gradientUnits="userSpaceOnUse">
          <stop stop-color="#a9c0ff" />
          <stop offset="1" stop-color="#cbb9ff" />
        </linearGradient>
      </defs>
      <path d="M20 2 L38 13 V35 L20 46 L2 35 V13 Z" stroke="url(#lsmark)" stroke-width="2" stroke-linejoin="round" />
      <path d="M13 23 L20 14 L27 23 M20 15 V37 M15 37 H25" stroke="url(#lsmark)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </span>
);

export const PageHead: FC<{ title: string; subtitle?: string; actions?: unknown }> = ({
  title,
  subtitle,
  actions,
}) => (
  <div class="page-head row between wrap">
    <div>
      <h1>{title}</h1>
      {subtitle ? <p class="muted" style="margin:0">{subtitle}</p> : null}
    </div>
    {actions ? <div class="row">{actions}</div> : null}
  </div>
);

export const EmptyState: FC<{ title: string; hint?: string; cta?: unknown }> = ({
  title,
  hint,
  cta,
}) => (
  <div class="card center" style="padding:48px 24px">
    <h3 style="margin-bottom:6px">{title}</h3>
    {hint ? <p class="muted">{hint}</p> : null}
    {cta ? <div class="row" style="justify-content:center;margin-top:8px">{cta}</div> : null}
  </div>
);

export const Section: FC<PropsWithChildren<{ class?: string }>> = ({ class: cls, children }) => (
  <main class={`container page ${cls ?? ""}`}>{children}</main>
);

const LIFECYCLE: Record<string, { cls: string; label: string }> = {
  new: { cls: "info", label: "New" },
  qualified: { cls: "info", label: "Qualified" },
  quoted: { cls: "info", label: "Quoted" },
  won: { cls: "ok", label: "Won" },
  closed_lost: { cls: "", label: "Closed lost" },
};
export const LifecycleBadge: FC<{ value: string | null }> = ({ value }) => {
  const m = LIFECYCLE[value ?? ""] ?? { cls: "", label: value ?? "—" };
  return <span class={`badge ${m.cls}`}>{m.label}</span>;
};

const STATUS: Record<string, { cls: string; label: string; spin?: boolean }> = {
  draft: { cls: "", label: "Draft" },
  extracting: { cls: "info", label: "Extracting", spin: true },
  drafting: { cls: "info", label: "Drafting", spin: true },
  needs_review: { cls: "warn", label: "Needs review" },
  approved: { cls: "info", label: "Approved" },
  sent: { cls: "info", label: "Sent" },
  viewed: { cls: "info", label: "Viewed" },
  deposit_paid: { cls: "ok", label: "Deposit paid" },
  lost: { cls: "danger", label: "Lost" },
  error: { cls: "danger", label: "Error" },
};
export const StatusBadge: FC<{ value: string | null }> = ({ value }) => {
  const m = STATUS[value ?? ""] ?? { cls: "", label: value ?? "—" };
  return (
    <span class={`badge ${m.cls}`}>
      {m.spin ? <span class="spinner" style="width:11px;height:11px" /> : null}
      {m.label}
    </span>
  );
};

/** Reactivation status badge. */
const REACT: Record<string, { cls: string; label: string }> = {
  draft: { cls: "", label: "Draft" },
  approved: { cls: "info", label: "Approved" },
  sent: { cls: "info", label: "Sent" },
  replied: { cls: "ok", label: "Replied" },
  rewon: { cls: "ok", label: "Re-won" },
  skipped: { cls: "", label: "Skipped" },
  error: { cls: "danger", label: "Error" },
};
export const ReactBadge: FC<{ value: string | null }> = ({ value }) => {
  const m = REACT[value ?? ""] ?? { cls: "", label: value ?? "—" };
  return <span class={`badge ${m.cls}`}>{m.label}</span>;
};
