ALTER TABLE "condition_rules" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "condition_rules" ADD COLUMN "cooldown_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "condition_rules" ADD COLUMN "mode_applicability" text DEFAULT 'default,ai_recommended,custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "condition_settings" ADD COLUMN "updated_by" text;--> statement-breakpoint
CREATE UNIQUE INDEX "service_zones_name_uq" ON "service_zones" USING btree ("name");