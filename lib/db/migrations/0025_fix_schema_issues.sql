-- Migration: 0025_fix_schema_issues
-- Fixes schema issues #35–#45: FKs, indexes, column renames, deprecated column removal, GPS precision.
-- Run this migration AFTER deploying the updated application code.
-- All statements use IF EXISTS / IF NOT EXISTS guards to be idempotent.

-- ═══════════════════════════════════════════════════════════════════
-- #35: reviews table
--   • make order_id nullable (required for ON DELETE SET NULL FK)
--   • add FK on order_id → orders(id) ON DELETE SET NULL
--   • add FK on product_id → products(id) ON DELETE SET NULL
--   • add index on order_id
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE reviews ALTER COLUMN order_id DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_order_id_orders_id_fk'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_order_id_orders_id_fk
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_product_id_products_id_fk'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_product_id_products_id_fk
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS reviews_order_id_idx ON reviews (order_id);

-- ═══════════════════════════════════════════════════════════════════
-- #36: orders table — index on assigned_rider_id
-- ═══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS orders_assigned_rider_id_idx ON orders (assigned_rider_id);

-- ═══════════════════════════════════════════════════════════════════
-- #37: products table — indexes on name and price
-- ═══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS products_name_idx ON products (name);
CREATE INDEX IF NOT EXISTS products_price_idx ON products (price);

-- ═══════════════════════════════════════════════════════════════════
-- #38/#39: users table — backfill roles from role, drop role column
-- Step 1: backfill roles from role for any rows where roles is still
--         the default 'customer' but role has a more specific value.
-- Step 2: drop legacy indexes, drop role column, add new indexes.
-- ═══════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    UPDATE users
    SET roles = role
    WHERE role IS NOT NULL
      AND role != ''
      AND (roles = 'customer' OR roles IS NULL OR roles = '');
  END IF;
END $$;

DROP INDEX IF EXISTS users_role_idx;
DROP INDEX IF EXISTS users_role_is_online_idx;

ALTER TABLE users DROP COLUMN IF EXISTS role;

CREATE INDEX IF NOT EXISTS users_roles_idx ON users (roles);
CREATE INDEX IF NOT EXISTS users_roles_is_online_idx ON users (roles, is_online);

-- ═══════════════════════════════════════════════════════════════════
-- #40: users table — remove deprecated vendor fields
--   (data was already migrated to vendor_profiles in migration 0011)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE users
  DROP COLUMN IF EXISTS store_name,
  DROP COLUMN IF EXISTS store_category,
  DROP COLUMN IF EXISTS store_banner,
  DROP COLUMN IF EXISTS store_description,
  DROP COLUMN IF EXISTS store_hours,
  DROP COLUMN IF EXISTS store_announcement,
  DROP COLUMN IF EXISTS store_min_order,
  DROP COLUMN IF EXISTS store_delivery_time,
  DROP COLUMN IF EXISTS store_is_open,
  DROP COLUMN IF EXISTS store_address,
  DROP COLUMN IF EXISTS store_lat,
  DROP COLUMN IF EXISTS store_lng,
  DROP COLUMN IF EXISTS business_type,
  DROP COLUMN IF EXISTS business_name,
  DROP COLUMN IF EXISTS ntn;

-- ═══════════════════════════════════════════════════════════════════
-- #41: users table — remove deprecated rider fields
--   (data was already migrated to rider_profiles in migration 0011)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE users
  DROP COLUMN IF EXISTS vehicle_type,
  DROP COLUMN IF EXISTS vehicle_plate,
  DROP COLUMN IF EXISTS vehicle_reg_no,
  DROP COLUMN IF EXISTS driving_license,
  DROP COLUMN IF EXISTS vehicle_photo,
  DROP COLUMN IF EXISTS documents;

-- ═══════════════════════════════════════════════════════════════════
-- #42: ride_ratings table — rename customer_id → user_id
--   Drop old FK and index first, rename, then re-create.
-- ═══════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_ratings' AND column_name = 'customer_id'
  ) THEN
    -- Drop old FK constraint if present
    IF EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'ride_ratings_customer_id_fk'
    ) THEN
      ALTER TABLE ride_ratings DROP CONSTRAINT ride_ratings_customer_id_fk;
    END IF;
    -- Drop old index if present
    DROP INDEX IF EXISTS ride_ratings_customer_id_idx;
    -- Rename column
    ALTER TABLE ride_ratings RENAME COLUMN customer_id TO user_id;
    -- Re-add FK under new name
    ALTER TABLE ride_ratings
      ADD CONSTRAINT ride_ratings_user_id_users_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    -- Re-add index under new name
    CREATE INDEX IF NOT EXISTS ride_ratings_user_id_idx ON ride_ratings (user_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- #43/#44: GPS precision — numeric(10,6) → numeric(10,7)
-- Tables: van_routes (from_lat/from_lng/to_lat/to_lng)
--         popular_locations (lat/lng)
-- The TYPE change is safe: numeric(10,7) is a superset of numeric(10,6).
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE van_routes
  ALTER COLUMN from_lat TYPE numeric(10,7),
  ALTER COLUMN from_lng TYPE numeric(10,7),
  ALTER COLUMN to_lat   TYPE numeric(10,7),
  ALTER COLUMN to_lng   TYPE numeric(10,7);

ALTER TABLE popular_locations
  ALTER COLUMN lat TYPE numeric(10,7),
  ALTER COLUMN lng TYPE numeric(10,7);

-- ═══════════════════════════════════════════════════════════════════
-- #45: SOS alerts — no schema change required.
-- SOS alerts are stored as rows in the notifications table with
-- type='sos'. The sosStatus, acknowledgedAt/By, resolvedAt/By, and
-- resolutionNotes columns handle the full SOS lifecycle. A separate
-- sos_alerts table is not needed — this keeps admin inbox and SOS
-- queries on a single unified surface.
-- ═══════════════════════════════════════════════════════════════════
