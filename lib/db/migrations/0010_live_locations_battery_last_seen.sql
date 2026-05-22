-- Add battery_level and last_seen to live_locations for durable heartbeat persistence
ALTER TABLE "live_locations"
  ADD COLUMN IF NOT EXISTS "battery_level" real,
  ADD COLUMN IF NOT EXISTS "last_seen" timestamp;
