CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text,
	`lead_id` text,
	`reactivation_id` text,
	`type` text NOT NULL,
	`status` text,
	`detail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_proposal` ON `events` (`proposal_id`);--> statement-breakpoint
CREATE INDEX `idx_events_type` ON `events` (`type`);--> statement-breakpoint
CREATE INDEX `idx_events_created` ON `events` (`created_at`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`ghl_contact_id` text,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`address` text,
	`project_type` text,
	`budget_hint` integer,
	`source` text DEFAULT 'meta',
	`lifecycle` text DEFAULT 'new' NOT NULL,
	`notes` text,
	`closed_lost_reason` text,
	`closed_lost_at` integer,
	`raw_payload` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_leads_created` ON `leads` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_leads_lifecycle` ON `leads` (`lifecycle`);--> statement-breakpoint
CREATE INDEX `idx_leads_ghl` ON `leads` (`ghl_contact_id`);--> statement-breakpoint
CREATE TABLE `pricing_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`unit` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`default_margin_pct` real DEFAULT 0.35 NOT NULL,
	`taxable` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`keywords` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_catalog_sku_unique` ON `pricing_catalog` (`sku`);--> statement-breakpoint
CREATE INDEX `idx_catalog_active_cat` ON `pricing_catalog` (`active`,`category`);--> statement-breakpoint
CREATE TABLE `proposal_line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`catalog_sku` text,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`margin_pct` real NOT NULL,
	`line_total_cents` integer NOT NULL,
	`taxable` integer DEFAULT true NOT NULL,
	`confidence` real,
	`is_flagged` integer DEFAULT false NOT NULL,
	`flag_reason` text,
	`source` text DEFAULT 'ai' NOT NULL,
	`notes` text,
	`sort_order` integer DEFAULT 0,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_li_proposal` ON `proposal_line_items` (`proposal_id`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`public_token` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`site_walk_notes` text,
	`extraction_json` text,
	`extraction_model` text,
	`overall_confidence` real,
	`needs_review_reason` text,
	`cover_note_md` text,
	`scope_summary_md` text,
	`inclusions_md` text,
	`exclusions_md` text,
	`subtotal_cents` integer DEFAULT 0,
	`tax_rate_bps` integer DEFAULT 0,
	`tax_cents` integer DEFAULT 0,
	`total_cents` integer DEFAULT 0,
	`deposit_cents` integer DEFAULT 0,
	`needs_render` integer DEFAULT false NOT NULL,
	`paypal_order_id` text,
	`paypal_approve_url` text,
	`email_message_id` text,
	`llm_cost_cents` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`approved_at` integer,
	`sent_at` integer,
	`viewed_at` integer,
	`paid_at` integer,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_public_token_unique` ON `proposals` (`public_token`);--> statement-breakpoint
CREATE INDEX `idx_prop_status` ON `proposals` (`status`);--> statement-breakpoint
CREATE INDEX `idx_prop_lead` ON `proposals` (`lead_id`);--> statement-breakpoint
CREATE INDEX `idx_prop_created` ON `proposals` (`created_at`);--> statement-breakpoint
CREATE TABLE `reactivations` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`batch_id` text,
	`channel` text DEFAULT 'email' NOT NULL,
	`subject` text,
	`message_md` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`model` text,
	`cost_cents` integer DEFAULT 0,
	`quality_flag` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`replied_at` integer,
	`outcome` text,
	`reply_text` text,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_react_status` ON `reactivations` (`status`);--> statement-breakpoint
CREATE INDEX `idx_react_batch` ON `reactivations` (`batch_id`);--> statement-breakpoint
CREATE INDEX `idx_react_lead` ON `reactivations` (`lead_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT 'Greenscape Pro' NOT NULL,
	`tax_rate_bps` integer DEFAULT 860 NOT NULL,
	`deposit_pct` integer DEFAULT 50 NOT NULL,
	`default_margin_pct` real DEFAULT 0.35 NOT NULL,
	`render_threshold_cents` integer DEFAULT 3000000 NOT NULL,
	`low_confidence_threshold` real DEFAULT 0.7 NOT NULL,
	`brand_voice_notes` text,
	`updated_at` integer NOT NULL
);
