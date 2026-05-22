-- Add prescription_photo_url column to pharmacy_orders
ALTER TABLE "pharmacy_orders" ADD COLUMN IF NOT EXISTS "prescription_photo_url" text;

-- Create pharmacy_prescription_refs table
CREATE TABLE IF NOT EXISTS "pharmacy_prescription_refs" (
  "ref_id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "photo_url" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "pharmacy_prescription_refs_user_id_idx" ON "pharmacy_prescription_refs" ("user_id");
CREATE INDEX IF NOT EXISTS "pharmacy_prescription_refs_expires_at_idx" ON "pharmacy_prescription_refs" ("expires_at");

-- Create referral_codes table
CREATE TABLE IF NOT EXISTS "referral_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "owner_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reward_amount" numeric(10, 2) NOT NULL DEFAULT '50',
  "used_count" integer NOT NULL DEFAULT 0,
  "max_uses" integer,
  "is_active" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "referral_codes_code_uidx" ON "referral_codes" ("code");
CREATE INDEX IF NOT EXISTS "referral_codes_owner_user_id_idx" ON "referral_codes" ("owner_user_id");

-- Create referral_usages table
CREATE TABLE IF NOT EXISTS "referral_usages" (
  "id" text PRIMARY KEY NOT NULL,
  "code_id" text NOT NULL REFERENCES "referral_codes"("id") ON DELETE CASCADE,
  "referee_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "referrer_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reward_amount" numeric(10, 2) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "referral_usages_referee_uidx" ON "referral_usages" ("referee_user_id");
CREATE INDEX IF NOT EXISTS "referral_usages_code_id_idx" ON "referral_usages" ("code_id");
CREATE INDEX IF NOT EXISTS "referral_usages_referrer_idx" ON "referral_usages" ("referrer_user_id");
