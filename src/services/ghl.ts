/**
 * GoHighLevel (system of record) adapter — plain fetch, no SDK.
 * Mirrors ses.ts / paypal.ts: throws on non-2xx; callers wrap in try/catch +
 * logEvent so a GHL hiccup never breaks the proposal flow. Stage ids + contact/
 * opportunity bodies match scripts/ghl-sync-leads.mjs (the proven backfill).
 */
import type { Env } from "../env.ts";

const BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

/** Pipeline TUrYELPZeHeUIUSXcrpC stage ids. Only 4 distinct stages are used;
 *  `closed` is the landing stage for both won and lost. */
export const GHL_STAGE = {
  new: "ad24dd22-1793-4ca4-8637-ecc53d6e2f1f",
  qualified: "a3da94e9-3b3d-4e69-a25f-3c2315568316",
  proposalSent: "a504f04d-a962-4e89-8d9e-c07d76d2bec6",
  closed: "50ada9d2-5fbd-4cd7-94c2-5dc31989ab39",
} as const;

/** Single source of truth: lead lifecycle → GHL pipeline stage + opportunity
 *  status. Shared by setLeadLifecycle, the close-out paths, and the backfill
 *  script so app-created and backfilled opportunities never disagree. */
export const LIFECYCLE_TO_STAGE: Record<string, { stageId: string; status: string }> = {
  new: { stageId: GHL_STAGE.new, status: "open" },
  qualified: { stageId: GHL_STAGE.qualified, status: "open" },
  quoted: { stageId: GHL_STAGE.proposalSent, status: "open" },
  won: { stageId: GHL_STAGE.closed, status: "won" },
  closed_lost: { stageId: GHL_STAGE.closed, status: "lost" },
};

/** Contact custom field IDs. GHL's contact PUT silently ignores key-based
 *  custom-field writes (returns 2xx, persists nothing) — only field `id` is
 *  honored. IDs are location-specific (created once, see scripts/setup). */
const CUSTOM_FIELD_ID = {
  proposalTotal: "HbEiP7QL7vvyeSKCMa6U",
  proposalStatus: "uL4LtJbWd75gNdIx4VFx",
  proposalUrl: "nheEJK0nswVhUrTLVbMO",
} as const;
export type GhlCustomFieldKey = keyof typeof CUSTOM_FIELD_ID;

export function ghlConfigured(env: Env): boolean {
  return Boolean(env.GHL_API_KEY && env.GHL_LOCATION_ID && env.GHL_PIPELINE_ID);
}

/** GHL email send is opt-in (GHL_EMAIL_SEND="true"); SES is the fallback. */
export function ghlEmailEnabled(env: Env): boolean {
  return ghlConfigured(env) && env.GHL_EMAIL_SEND === "true";
}

function headers(env: Env): Record<string, string> {
  return { Authorization: `Bearer ${env.GHL_API_KEY}`, Version: VERSION, "Content-Type": "application/json" };
}

async function ghlFetch(env: Env, path: string, method: string, body?: unknown, attempt = 0): Promise<any> {
  const resp = await fetch(BASE + path, {
    method,
    headers: headers(env),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000), // never hang the request path on a slow GHL
  });
  if ((resp.status === 429 || resp.status >= 500) && attempt < 5) {
    const ra = Number(resp.headers.get("retry-after")); // delta-seconds; HTTP-date → NaN
    const waitMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 30000) : 1200 * (attempt + 1);
    await new Promise((r) => setTimeout(r, waitMs));
    return ghlFetch(env, path, method, body, attempt + 1);
  }
  if (!resp.ok) {
    const txt = (await resp.text().catch(() => "")).slice(0, 500); // bound the DB row size
    throw new Error(`GHL ${method} ${path} ${resp.status}: ${txt}`);
  }
  return resp.json().catch(() => ({}));
}

function splitName(name: string) {
  const parts = String(name || "").trim().split(/\s+/);
  return { firstName: parts[0] || "Lead", lastName: parts.slice(1).join(" ") || undefined };
}

export function normPhone(p?: string | null): string | undefined {
  if (!p) return undefined;
  const d = String(p).replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  if (String(p).trim().startsWith("+") && d.length >= 8 && d.length <= 15) return "+" + d; // valid intl E.164
  return undefined;
}

export interface GhlContactInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  projectType?: string | null;
  source?: string | null;
  lifecycle?: string | null;
}

/** Upsert a contact (dedupes on email/phone). Returns the contact id. */
export async function upsertContact(env: Env, lead: GhlContactInput): Promise<string> {
  const { firstName, lastName } = splitName(lead.name);
  const tags = ["greenscape-app"];
  if (lead.lifecycle) tags.push(`lifecycle:${lead.lifecycle}`);
  if (lead.projectType) tags.push(String(lead.projectType));
  const json = await ghlFetch(env, "/contacts/upsert", "POST", {
    locationId: env.GHL_LOCATION_ID,
    firstName,
    lastName,
    name: lead.name || undefined,
    email: lead.email || undefined,
    phone: normPhone(lead.phone),
    address1: lead.address || undefined,
    source: lead.source || "greenscape-app",
    tags,
  });
  const id = json?.contact?.id ?? json?.id;
  if (!id) throw new Error(`GHL upsertContact: 2xx but no id: ${JSON.stringify(json).slice(0, 500)}`);
  return id;
}

/** Create an opportunity on the configured pipeline. Returns the opportunity id. */
export async function createOpportunity(
  env: Env,
  input: { contactId: string; name: string; stageId: string; status: string; monetaryValue?: number },
): Promise<string> {
  const json = await ghlFetch(env, "/opportunities/", "POST", {
    pipelineId: env.GHL_PIPELINE_ID,
    locationId: env.GHL_LOCATION_ID,
    contactId: input.contactId,
    name: input.name,
    pipelineStageId: input.stageId,
    status: input.status,
    monetaryValue: input.monetaryValue,
  });
  const id = json?.opportunity?.id ?? json?.id;
  if (!id) throw new Error(`GHL createOpportunity: 2xx but no id: ${JSON.stringify(json).slice(0, 500)}`);
  return id;
}

/** Update an existing opportunity (stage / status / value / name). Partial. */
export async function updateOpportunity(
  env: Env,
  oppId: string,
  patch: { stageId?: string; status?: string; monetaryValue?: number; name?: string },
): Promise<void> {
  const body: Record<string, unknown> = { pipelineId: env.GHL_PIPELINE_ID };
  if (patch.stageId !== undefined) body.pipelineStageId = patch.stageId;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.monetaryValue !== undefined) body.monetaryValue = patch.monetaryValue;
  if (patch.name !== undefined) body.name = patch.name;
  await ghlFetch(env, `/opportunities/${oppId}`, "PUT", body);
}

/** Find an existing opportunity for a contact on our pipeline (open preferred).
 *  The durable guard against duplicate opportunities when the local
 *  ghlOpportunityId is null or stale. Returns null if none. */
export async function findOpenOpportunityByContact(env: Env, contactId: string): Promise<string | null> {
  const params = new URLSearchParams({ location_id: env.GHL_LOCATION_ID!, contact_id: contactId });
  const json = await ghlFetch(env, `/opportunities/search?${params.toString()}`, "GET");
  const onPipeline = (json?.opportunities ?? []).filter((o: any) => o.pipelineId === env.GHL_PIPELINE_ID);
  return (onPipeline.find((o: any) => o.status === "open") ?? onPipeline[0])?.id ?? null;
}

/** Set contact custom fields by key (skips undefined/null; no-op if empty). */
export async function setContactCustomFields(
  env: Env,
  contactId: string,
  fields: Partial<Record<GhlCustomFieldKey, string | number>>,
): Promise<void> {
  const customFields = (Object.keys(fields) as GhlCustomFieldKey[])
    .filter((k) => fields[k] !== undefined && fields[k] !== null)
    .map((k) => ({ id: CUSTOM_FIELD_ID[k], field_value: String(fields[k]) }));
  if (!customFields.length) return;
  await ghlFetch(env, `/contacts/${contactId}`, "PUT", { customFields });
}

/** Add a timeline note to a contact. */
export async function addContactNote(env: Env, contactId: string, body: string): Promise<void> {
  await ghlFetch(env, `/contacts/${contactId}/notes`, "POST", { body });
}

/** Create a follow-up task on a contact. `completed:false` is required by the API. */
export async function addContactTask(
  env: Env,
  contactId: string,
  input: { title: string; dueDate: string; body?: string },
): Promise<void> {
  await ghlFetch(env, `/contacts/${contactId}/tasks`, "POST", {
    title: input.title,
    body: input.body ?? "",
    dueDate: input.dueDate,
    completed: false,
  });
}

/** Send an email to a contact through GHL Conversations (logs on the timeline).
 *  No emailFrom — GHL uses the location default sender (spec D2/D3). */
export async function sendEmailViaGhl(
  env: Env,
  input: { contactId: string; subject: string; html: string },
): Promise<{ messageId: string }> {
  const json = await ghlFetch(env, "/conversations/messages", "POST", {
    type: "Email",
    contactId: input.contactId,
    subject: input.subject,
    html: input.html,
  });
  const messageId = json?.messageId ?? json?.conversationId;
  if (!messageId) throw new Error("GHL email send returned no messageId/conversationId");
  return { messageId };
}
