-- Migration: Add composite index on rider_penalties for efficient per-rider lookups.
-- This must run AFTER 0048_rider_penalties.sql which creates the rider_penalties table.

CREATE INDEX IF NOT EXISTS rider_penalties_rider_created_idx
  ON rider_penalties (rider_id, created_at DESC);
