/**
 * D1 (SQLite) schema via Drizzle.
 *
 * Conventions:
 *   • money  → INTEGER cents (never floats)
 *   • time   → INTEGER unix epoch ms
 *   • ids    → TEXT (crypto.randomUUID)
 *   • bools  → INTEGER {0,1} via mode:"boolean"
 *
 * Line items snapshot their price at quote time so a sent proposal is an
 * immutable contract, independent of later catalog edits.
 */
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// ── leads ─────────────────────────────────────────────────────────────
// Shared by both agents. `lifecycle` distinguishes active pipeline from the
// closed-lost pile that the reactivation agent works.
export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    ghlContactId: text("ghl_contact_id"),
    ghlOpportunityId: text("ghl_opportunity_id"),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    projectType: text("project_type"), // paver_patio | pool_deck | outdoor_kitchen | full_yard | ...
    budgetHint: integer("budget_hint"), // cents
    source: text("source").default("meta"), // meta | google | manual | referral
    lifecycle: text("lifecycle").notNull().default("new"), // new|qualified|quoted|won|closed_lost
    notes: text("notes"), // GHL-style context notes (used by reactivation)
    closedLostReason: text("closed_lost_reason"),
    closedLostAt: integer("closed_lost_at"),
    rawPayload: text("raw_payload"), // JSON of original webhook body (audit/replay)
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_leads_created").on(t.createdAt),
    index("idx_leads_lifecycle").on(t.lifecycle),
    index("idx_leads_ghl").on(t.ghlContactId),
  ],
);

// ── pricing_catalog ───────────────────────────────────────────────────
// "The pricing spreadsheet" — the only source of truth for prices.
export const pricingCatalog = sqliteTable(
  "pricing_catalog",
  {
    id: text("id").primaryKey(),
    sku: text("sku").notNull().unique(), // stable key the LLM maps to, e.g. PAVER_STD_INSTALL
    category: text("category").notNull(), // paving | walls | water | lighting | structures | turf | demo | fees
    name: text("name").notNull(),
    description: text("description"),
    unit: text("unit").notNull(), // sqft | linear_ft | each | hour | lump
    unitPriceCents: integer("unit_price_cents").notNull(),
    defaultMarginPct: real("default_margin_pct").notNull().default(0.35),
    taxable: integer("taxable", { mode: "boolean" }).notNull().default(true),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    keywords: text("keywords"), // comma list — extra match hints for the LLM
  },
  (t) => [index("idx_catalog_active_cat").on(t.active, t.category)],
);

// ── proposals ─────────────────────────────────────────────────────────
export const proposals = sqliteTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id),
    publicToken: text("public_token").notNull().unique(), // used in /p/:token

    status: text("status").notNull().default("draft"),
    // draft | extracting | drafting | needs_review | approved | sent | viewed | deposit_paid | lost | error

    siteWalkNotes: text("site_walk_notes"),
    extractionJson: text("extraction_json"), // raw structured scope from Haiku (audit)
    extractionModel: text("extraction_model"),
    overallConfidence: real("overall_confidence"),
    needsReviewReason: text("needs_review_reason"), // low_confidence | unmapped_items | parse_failed | no_scope_found

    // proposal prose (markdown) — written by Sonnet, never contains prices
    coverNoteMd: text("cover_note_md"),
    scopeSummaryMd: text("scope_summary_md"),
    inclusionsMd: text("inclusions_md"),
    exclusionsMd: text("exclusions_md"),

    // money snapshot (cents) — computed by code, never by the LLM
    subtotalCents: integer("subtotal_cents").default(0),
    taxRateBps: integer("tax_rate_bps").default(0), // snapshot of settings at quote time
    taxCents: integer("tax_cents").default(0),
    totalCents: integer("total_cents").default(0),
    depositCents: integer("deposit_cents").default(0),
    needsRender: integer("needs_render", { mode: "boolean" }).notNull().default(false), // total ≥ $30k

    // integration artifacts
    paypalOrderId: text("paypal_order_id"),
    paypalApproveUrl: text("paypal_approve_url"),
    emailMessageId: text("email_message_id"),

    llmCostCents: integer("llm_cost_cents").default(0),

    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    approvedAt: integer("approved_at"),
    sentAt: integer("sent_at"),
    viewedAt: integer("viewed_at"),
    paidAt: integer("paid_at"),
  },
  (t) => [
    index("idx_prop_status").on(t.status),
    index("idx_prop_lead").on(t.leadId),
    index("idx_prop_created").on(t.createdAt),
  ],
);

// ── proposal_line_items ───────────────────────────────────────────────
export const proposalLineItems = sqliteTable(
  "proposal_line_items",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    catalogSku: text("catalog_sku"), // null when unmapped
    name: text("name").notNull(), // snapshot of catalog name (or LLM-proposed name if unmapped)
    unit: text("unit").notNull(),
    quantity: real("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(), // SNAPSHOT from catalog at extraction time
    marginPct: real("margin_pct").notNull(), // SNAPSHOT
    lineTotalCents: integer("line_total_cents").notNull(), // computed
    taxable: integer("taxable", { mode: "boolean" }).notNull().default(true),
    confidence: real("confidence"), // per-item, from the LLM (0..1)
    isFlagged: integer("is_flagged", { mode: "boolean" }).notNull().default(false),
    flagReason: text("flag_reason"), // unmapped | low_confidence | missing_quantity | price_overridden
    source: text("source").notNull().default("ai"), // ai | manual
    notes: text("notes"), // LLM rationale / special condition
    sortOrder: integer("sort_order").default(0),
  },
  (t) => [index("idx_li_proposal").on(t.proposalId)],
);

// ── reactivations (Agent #2) ──────────────────────────────────────────
export const reactivations = sqliteTable(
  "reactivations",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id),
    batchId: text("batch_id"), // groups a generation batch
    channel: text("channel").notNull().default("email"),
    subject: text("subject"),
    messageMd: text("message_md"),
    status: text("status").notNull().default("draft"), // draft|approved|sent|replied|rewon|skipped|error
    model: text("model"),
    costCents: integer("cost_cents").default(0),
    qualityFlag: text("quality_flag"), // null | needs_review (guardrail: missing context / too generic)
    createdAt: integer("created_at").notNull(),
    sentAt: integer("sent_at"),
    repliedAt: integer("replied_at"),
    outcome: text("outcome"),
    replyText: text("reply_text"),
  },
  (t) => [
    index("idx_react_status").on(t.status),
    index("idx_react_batch").on(t.batchId),
    index("idx_react_lead").on(t.leadId),
  ],
);

// ── events (unified activity log → dashboard + audit) ─────────────────
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id"),
    leadId: text("lead_id"),
    reactivationId: text("reactivation_id"),
    type: text("type").notNull(),
    status: text("status"), // ok | error
    detail: text("detail"), // JSON: durations, token counts, error messages, http status
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_events_proposal").on(t.proposalId),
    index("idx_events_type").on(t.type),
    index("idx_events_created").on(t.createdAt),
  ],
);

// ── settings (singleton id=1) ─────────────────────────────────────────
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(), // always 1
  companyName: text("company_name").notNull().default("Greenscape Pro"),
  taxRateBps: integer("tax_rate_bps").notNull().default(860), // 8.6% Phoenix AZ
  depositPct: integer("deposit_pct").notNull().default(50),
  defaultMarginPct: real("default_margin_pct").notNull().default(0.35),
  renderThresholdCents: integer("render_threshold_cents").notNull().default(3_000_000), // $30k
  lowConfidenceThreshold: real("low_confidence_threshold").notNull().default(0.7),
  brandVoiceNotes: text("brand_voice_notes"),
  updatedAt: integer("updated_at").notNull(),
});

// ── inferred types ────────────────────────────────────────────────────
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type CatalogItem = typeof pricingCatalog.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type NewProposal = typeof proposals.$inferInsert;
export type LineItem = typeof proposalLineItems.$inferSelect;
export type NewLineItem = typeof proposalLineItems.$inferInsert;
export type Reactivation = typeof reactivations.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type EventRow = typeof events.$inferSelect;

export type ProposalStatus =
  | "draft"
  | "extracting"
  | "drafting"
  | "needs_review"
  | "approved"
  | "sent"
  | "viewed"
  | "deposit_paid"
  | "lost"
  | "error";
