-- Migration: Add FTS GIN index on products and compound indexes on orders/rides
-- Additive only — no existing indexes, columns, or constraints are modified.

-- GIN expression index for full-text search on products (name + description).
-- Allows to_tsvector queries to use the index instead of scanning every row.
CREATE INDEX IF NOT EXISTS "products_fts_gin_idx"
  ON "products"
  USING gin (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", '')));

-- Compound index for the common "fetch a user's orders filtered by status" pattern.
-- Complements the existing single-column orders_user_id_idx and orders_status_idx.
CREATE INDEX IF NOT EXISTS "orders_user_id_status_idx"
  ON "orders" ("user_id", "status");

-- Compound index for the rider-dashboard "all rides for rider X with status Y" pattern.
-- Complements the existing rides_status_rider_id_idx (status-first) by adding a rider-first variant.
CREATE INDEX IF NOT EXISTS "rides_rider_id_status_idx"
  ON "rides" ("rider_id", "status");
