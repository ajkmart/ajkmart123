ALTER TABLE "ride_event_logs" ALTER COLUMN "rider_id" DROP NOT NULL;
ALTER TABLE "ride_event_logs" ADD COLUMN IF NOT EXISTS "admin_id" text;
