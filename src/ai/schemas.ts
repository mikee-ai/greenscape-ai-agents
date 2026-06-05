import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { ScopeResult } from "../pricing/types.ts";

// ── extraction (Call 1) ───────────────────────────────────────────────
export const scopeToolSchema = z.object({
  line_items: z.array(
    z.object({
      sku: z.string(),
      quantity: z.number(),
      unit: z.string(),
      confidence: z.number().min(0).max(1),
      rationale: z.string().optional(),
    }),
  ),
  unmapped: z.array(
    z.object({
      observation: z.string(),
      suggested_unit: z.string().optional(),
      est_quantity: z.number().optional(),
    }),
  ),
  special_conditions: z.array(z.string()),
});
export type ScopeTool = z.infer<typeof scopeToolSchema>;

export function toScopeResult(d: ScopeTool): ScopeResult {
  return {
    lineItems: d.line_items.map((li) => ({
      sku: li.sku,
      quantity: li.quantity,
      unit: li.unit,
      confidence: li.confidence,
      rationale: li.rationale,
    })),
    unmapped: d.unmapped.map((u) => ({
      observation: u.observation,
      suggestedUnit: u.suggested_unit,
      estQuantity: u.est_quantity,
    })),
    specialConditions: d.special_conditions,
  };
}

export const SCOPE_TOOL: Anthropic.Messages.Tool = {
  name: "submit_scope",
  description:
    "Submit the structured scope of work extracted from the site-walk notes. Use ONLY catalog SKUs; never invent SKUs or prices.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["line_items", "unmapped", "special_conditions"],
    properties: {
      line_items: {
        type: "array",
        description: "Catalog items that apply to this job.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["sku", "quantity", "unit", "confidence"],
          properties: {
            sku: { type: "string", description: "MUST be one of the provided catalog SKUs." },
            quantity: { type: "number", description: "Quantity in the item's unit. If unstated, estimate and lower confidence." },
            unit: { type: "string", enum: ["sqft", "linear_ft", "each", "hour", "lump"] },
            confidence: { type: "number", minimum: 0, maximum: 1, description: "0–1 confidence in this line." },
            rationale: { type: "string", description: "Brief reason / which note this came from." },
          },
        },
      },
      unmapped: {
        type: "array",
        description: "Things mentioned that do NOT match any catalog SKU. Do not force a SKU.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["observation"],
          properties: {
            observation: { type: "string" },
            suggested_unit: { type: "string" },
            est_quantity: { type: "number" },
          },
        },
      },
      special_conditions: {
        type: "array",
        description: "Site conditions affecting the job (access, slope, demo, HOA, drainage, etc.).",
        items: { type: "string" },
      },
    },
  },
};

// ── drafting (Call 2) — used in the next milestone ────────────────────
export const proposalCopySchema = z.object({
  cover_note_md: z.string(),
  scope_summary_md: z.string(),
  inclusions_md: z.string(),
  exclusions_md: z.string(),
});
export type ProposalCopy = z.infer<typeof proposalCopySchema>;

export const PROPOSAL_COPY_TOOL: Anthropic.Messages.Tool = {
  name: "submit_proposal_copy",
  description:
    "Submit the proposal prose sections in markdown. Describe ONLY the provided scope. Never state dollar amounts or invent work, materials, or timelines.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["cover_note_md", "scope_summary_md", "inclusions_md", "exclusions_md"],
    properties: {
      cover_note_md: { type: "string", description: "Warm, premium 2–3 sentence cover note addressed to the client by name." },
      scope_summary_md: { type: "string", description: "A confident description of the scope of work (markdown, no prices)." },
      inclusions_md: { type: "string", description: "Markdown bullet list of what's included." },
      exclusions_md: { type: "string", description: "Markdown bullet list of exclusions / assumptions." },
    },
  },
};

// ── reactivation — used in Agent #2 ───────────────────────────────────
export const reactivationSchema = z.object({
  subject: z.string(),
  message_md: z.string(),
  uses_real_context: z.boolean(),
});
export type ReactivationCopy = z.infer<typeof reactivationSchema>;

export const REACTIVATION_TOOL: Anthropic.Messages.Tool = {
  name: "submit_reactivation",
  description:
    "Submit a short, personal re-engagement message in Marcus's voice. Reference the lead's real context. Never invent specifics or make promises about price or timeline.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["subject", "message_md", "uses_real_context"],
    properties: {
      subject: { type: "string", description: "Short, personal email subject (no marketing speak)." },
      message_md: { type: "string", description: "3–5 sentence personal message that feels hand-written by Marcus. Include a soft question CTA." },
      uses_real_context: { type: "boolean", description: "True only if the message references a real detail from the lead's notes." },
    },
  },
};
