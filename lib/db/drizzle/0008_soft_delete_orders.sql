ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
