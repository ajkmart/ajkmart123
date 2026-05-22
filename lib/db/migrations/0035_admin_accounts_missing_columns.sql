-- Migration: Add missing columns to admin_accounts table
-- Adds username, email, must_change_password, password_changed_at, default_credentials
-- All use IF NOT EXISTS so this is safe to run multiple times (idempotent).

ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "username" text;
ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "must_change_password" boolean NOT NULL DEFAULT false;
ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp;
ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS "default_credentials" boolean NOT NULL DEFAULT false;

-- Add unique constraint on username only if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_accounts_username_unique'
      AND conrelid = 'admin_accounts'::regclass
  ) THEN
    ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_username_unique UNIQUE (username);
  END IF;
END $$;
