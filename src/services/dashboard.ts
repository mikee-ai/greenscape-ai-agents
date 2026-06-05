import { count, eq } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { leads, proposals } from "../db/schema.ts";

export interface DashboardMetrics {
  proposalsTotal: number;
  byStatus: Record<string, number>;
  pipelineValueCents: number;
  wonValueCents: number;
  llmCostCents: number;
  avgCycleMs: number | null;
  sentCount: number;
  activeLeads: number;
  closedLostLeads: number;
}

const PIPELINE_STATUSES = new Set(["needs_review", "approved", "sent", "viewed"]);

export async function dashboardMetrics(db: DB): Promise<DashboardMetrics> {
  const props = await db.select().from(proposals);
  const byStatus: Record<string, number> = {};
  let llm = 0;
  let won = 0;
  let pipeline = 0;
  const cycles: number[] = [];

  for (const p of props) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    llm += p.llmCostCents ?? 0;
    if (p.status === "deposit_paid") won += p.totalCents ?? 0;
    if (PIPELINE_STATUSES.has(p.status)) pipeline += p.totalCents ?? 0;
    if (p.sentAt && p.createdAt) cycles.push(p.sentAt - p.createdAt);
  }

  const [active] = await db.select({ n: count() }).from(leads).where(eq(leads.lifecycle, "new"));
  const [lost] = await db.select({ n: count() }).from(leads).where(eq(leads.lifecycle, "closed_lost"));

  return {
    proposalsTotal: props.length,
    byStatus,
    pipelineValueCents: pipeline,
    wonValueCents: won,
    llmCostCents: llm,
    avgCycleMs: cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null,
    sentCount: cycles.length,
    activeLeads: active?.n ?? 0,
    closedLostLeads: lost?.n ?? 0,
  };
}
