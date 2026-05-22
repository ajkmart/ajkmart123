-- Fix schema drift: update loyalty_campaigns to match current schema
-- Add missing columns (type, bonus_multiplier, status) and remove old ones

ALTER TABLE "loyalty_campaigns" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'bonus_multiplier';
ALTER TABLE "loyalty_campaigns" ADD COLUMN IF NOT EXISTS "bonus_multiplier" numeric(5,2) DEFAULT '1.00';
ALTER TABLE "loyalty_campaigns" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'draft';

-- Remove old columns that no longer exist in schema (if they exist)
ALTER TABLE "loyalty_campaigns" DROP COLUMN IF EXISTS "points_reward";
ALTER TABLE "loyalty_campaigns" DROP COLUMN IF EXISTS "min_order_amount";
ALTER TABLE "loyalty_campaigns" DROP COLUMN IF EXISTS "is_active";

-- Fix product_stock_history: add missing columns
ALTER TABLE "product_stock_history" ADD COLUMN IF NOT EXISTS "quantity_delta" integer;
ALTER TABLE "product_stock_history" ADD COLUMN IF NOT EXISTS "reason" text NOT NULL DEFAULT 'manual';
ALTER TABLE "product_stock_history" ADD COLUMN IF NOT EXISTS "order_id" text;

-- Create security_events table if missing
CREATE TABLE IF NOT EXISTS "security_events" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "ip" text NOT NULL,
  "user_id" text,
  "details" text NOT NULL,
  "severity" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
