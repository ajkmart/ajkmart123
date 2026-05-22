-- Migration 0048: Create rider_penalties table
-- Records penalty events applied to riders (e.g. late cancellations,
-- misconduct, policy violations). Linked to users with CASCADE delete
-- so records are cleaned up when a rider account is removed.

CREATE TABLE IF NOT EXISTS rider_penalties (
  id          TEXT          PRIMARY KEY,
  rider_id    TEXT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT          NOT NULL,
  amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason      TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rider_penalties_rider_id_idx
  ON rider_penalties(rider_id);

CREATE INDEX IF NOT EXISTS rider_penalties_type_idx
  ON rider_penalties(type);

CREATE INDEX IF NOT EXISTS rider_penalties_created_at_idx
  ON rider_penalties(created_at);
