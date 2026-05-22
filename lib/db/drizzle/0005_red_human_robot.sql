-- Task #5: soft-delete columns for users and products, plus security tables.
-- Applied at startup by the Drizzle migration track in sqlMigrationRunner.ts
-- (tracked in _drizzle_migrations). Custom SQL migrations in lib/db/migrations/
-- handle FK rewrites and any DDL that Drizzle cannot express directly.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
--> statement-breakpoint

-- Security tables: created here as part of the Drizzle migration track so
-- they are applied at startup alongside all other schema changes. The custom
-- SQL migration (0005_soft_delete_fk_cascade.sql) also guards these with
-- IF NOT EXISTS so both tracks are idempotent and safe to run together.
CREATE TABLE IF NOT EXISTS "data_export_logs" (
  "id"           TEXT PRIMARY KEY,
  "user_id"      TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "ip"           TEXT NOT NULL DEFAULT 'unknown',
  "user_agent"   TEXT,
  "masked_phone" TEXT,
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ,
  "success"      BOOLEAN NOT NULL DEFAULT FALSE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_data_export_logs_user_id"      ON "data_export_logs" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_data_export_logs_requested_at" ON "data_export_logs" ("requested_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sentry_known_issues" (
  "fingerprint"   TEXT PRIMARY KEY,
  "title"         TEXT NOT NULL,
  "sentry_id"     TEXT,
  "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "last_seen_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "totp_recovery_codes" (
  "id"         TEXT PRIMARY KEY,
  "user_id"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash"  TEXT NOT NULL,
  "used_at"    TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "totp_recovery_codes_user_id_idx" ON "totp_recovery_codes" ("user_id");
