-- Migration: Unique partial index to prevent a customer from booking two concurrent rides.
-- A customer can only have ONE ride whose status is in the active set at any point in time.
-- The database enforces this atomically, eliminating the double-booking race (C-02).
--
-- Statuses covered:
--   searching   — ride posted, waiting for a rider
--   bargaining  — fare negotiation in progress
--   accepted    — rider accepted the fare
--   arrived     — rider arrived at pickup location
--   in_transit  — ride in progress
--
-- Completed and cancelled rides are NOT included, so historical data is unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS rides_one_active_per_user
  ON rides (user_id)
  WHERE status IN ('searching', 'bargaining', 'accepted', 'arrived', 'in_transit');
