import { z } from "zod";

/**
 * Inbound lead webhook (simulates Meta lead-ad form → GHL → us).
 * Permissive on purpose: a real lead must never be rejected over a strict email
 * regex. Only `name` is required; everything else is best-effort. budget_hint is
 * a dollar amount and converted to cents on store.
 */
export const leadWebhookSchema = z
  .object({
    name: z.string().trim().min(1, "name is required"),
    email: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    address: z.string().trim().optional(),
    project_type: z.string().trim().optional(),
    budget_hint: z.coerce.number().nonnegative().optional(), // dollars
    source: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    ghl_contact_id: z.string().trim().optional(),
  })
  .passthrough();

export type LeadWebhookInput = z.infer<typeof leadWebhookSchema>;
