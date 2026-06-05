import { desc, eq } from "drizzle-orm";
import type { DB } from "../db/client.ts";
import { leads } from "../db/schema.ts";
import { newId, now } from "../lib/ids.ts";

export interface CreateLeadInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  projectType?: string;
  budgetHintCents?: number;
  source?: string;
  notes?: string;
  ghlContactId?: string;
  rawPayload?: unknown;
}

export async function createLead(db: DB, input: CreateLeadInput): Promise<string> {
  const id = newId();
  await db.insert(leads).values({
    id,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
    projectType: input.projectType ?? null,
    budgetHint: input.budgetHintCents ?? null,
    source: input.source ?? "manual",
    lifecycle: "new",
    notes: input.notes ?? null,
    ghlContactId: input.ghlContactId ?? null,
    rawPayload: input.rawPayload !== undefined ? JSON.stringify(input.rawPayload) : null,
    createdAt: now(),
  });
  return id;
}

export async function listLeads(
  db: DB,
  opts: { lifecycle?: string; limit?: number } = {},
) {
  const base = db.select().from(leads).$dynamic();
  const filtered = opts.lifecycle ? base.where(eq(leads.lifecycle, opts.lifecycle)) : base;
  return filtered.orderBy(desc(leads.createdAt)).limit(opts.limit ?? 100);
}

export async function getLead(db: DB, id: string) {
  const rows = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function setLeadLifecycle(db: DB, id: string, lifecycle: string) {
  await db.update(leads).set({ lifecycle }).where(eq(leads.id, id));
}
