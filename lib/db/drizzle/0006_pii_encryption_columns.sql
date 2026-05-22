-- Task #1 Security Hardening: Add PII encryption columns to users table.
-- Dual-write pattern: plaintext columns remain for backward compatibility;
-- new writes also populate encrypted_phone / encrypted_email.
-- Full backfill of existing rows is a separate follow-up data-migration task.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "encrypted_phone" TEXT;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "encrypted_email" TEXT;
