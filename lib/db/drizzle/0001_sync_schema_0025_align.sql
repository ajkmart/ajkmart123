-- Sync Drizzle schema with DB reality after migration 0025.
-- Migration 0025 already renamed ride_ratings.customer_id → user_id.
-- This is a no-op if that rename was already applied (idempotent guard).
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ride_ratings'
      AND column_name  = 'customer_id'
  ) THEN
    ALTER TABLE "ride_ratings" RENAME COLUMN "customer_id" TO "user_id";
  END IF;
END $$;
