import { desc, eq } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { events } from "../db/schema.ts";
import { newId, now } from "../lib/ids.ts";

export interface LogEventInput {
  type: string;
  status?: "ok" | "error";
  proposalId?: string | null;
  leadId?: string | null;
  reactivationId?: string | null;
  detail?: unknown;
}

/** Append to the unified activity log. Never throws into the caller's path. */
export async function logEvent(db: DB, e: LogEventInput): Promise<void> {
  try {
    await db.insert(events).values({
      id: newId(),
      type: e.type,
      status: e.status ?? "ok",
      proposalId: e.proposalId ?? null,
      leadId: e.leadId ?? null,
      reactivationId: e.reactivationId ?? null,
      detail: e.detail !== undefined ? JSON.stringify(e.detail) : null,
      createdAt: now(),
    });
  } catch (err) {
    console.error("logEvent failed:", err);
  }
}

export async function recentEventsForProposal(db: DB, proposalId: string, limit = 50) {
  return db
    .select()
    .from(events)
    .where(eq(events.proposalId, proposalId))
    .orderBy(desc(events.createdAt))
    .limit(limit);
}

export async function recentEvents(db: DB, limit = 30) {
  return db.select().from(events).orderBy(desc(events.createdAt)).limit(limit);
}
