-- Add online_since to live_locations: stable session-start timestamp, set once when rider goes online
-- Unlike last_seen (updated on every heartbeat), online_since is set only at session start.
ALTER TABLE "live_locations"
  ADD COLUMN IF NOT EXISTS "online_since" timestamp;
