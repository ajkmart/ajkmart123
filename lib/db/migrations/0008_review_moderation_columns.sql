-- Migration: Add soft-delete, visibility, and dual-rating columns to reviews and ride_ratings tables
-- Applied via: drizzle-kit push (schema already reflects these columns)
-- Date: 2026-03-31

-- ───────────────────────────────────────────────
-- reviews table
-- ───────────────────────────────────────────────
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS hidden      BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_by  TEXT,
  -- Separate rider rating for dual-rating (vendor + rider on same delivery order)
  ADD COLUMN IF NOT EXISTS rider_rating INTEGER CHECK (rider_rating BETWEEN 1 AND 5);

-- ride_ratings table
ALTER TABLE ride_ratings
  ADD COLUMN IF NOT EXISTS hidden      BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_by  TEXT;

-- ───────────────────────────────────────────────
-- Indexes
-- ───────────────────────────────────────────────
-- Unique constraint: one review per (order, customer)
CREATE UNIQUE INDEX IF NOT EXISTS reviews_order_user_uidx ON reviews (order_id, user_id);

-- Fast lookups by hidden/deleted status for admin moderation
CREATE INDEX IF NOT EXISTS reviews_hidden_idx        ON reviews (hidden);
CREATE INDEX IF NOT EXISTS reviews_deleted_idx        ON reviews (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ride_ratings_hidden_idx    ON ride_ratings (hidden);
CREATE INDEX IF NOT EXISTS ride_ratings_deleted_idx   ON ride_ratings (deleted_at) WHERE deleted_at IS NOT NULL;

-- Fast lookup by vendor / rider for stats
CREATE INDEX IF NOT EXISTS reviews_vendor_id_idx      ON reviews (vendor_id);
CREATE INDEX IF NOT EXISTS reviews_rider_id_idx       ON reviews (rider_id);
CREATE INDEX IF NOT EXISTS reviews_user_id_idx        ON reviews (user_id);
CREATE INDEX IF NOT EXISTS ride_ratings_rider_id_idx  ON ride_ratings (rider_id);
CREATE INDEX IF NOT EXISTS ride_ratings_customer_id_idx ON ride_ratings (customer_id);
