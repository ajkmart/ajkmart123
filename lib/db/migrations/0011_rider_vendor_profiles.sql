-- Migration: Extract rider and vendor profile data into dedicated tables
-- This keeps the users table lean (identity, auth, wallet only)
-- All profile data is linked via user_id (same as users.id)

-- ── Create rider_profiles table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rider_profiles (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type     TEXT,
  vehicle_plate    TEXT,
  vehicle_reg_no   TEXT,
  driving_license  TEXT,
  vehicle_photo    TEXT,
  documents        TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Populate rider_profiles from existing users data (only if columns exist) ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'vehicle_type'
  ) THEN
    INSERT INTO rider_profiles (user_id, vehicle_type, vehicle_plate, vehicle_reg_no, driving_license, vehicle_photo, documents, created_at, updated_at)
    SELECT
      id,
      vehicle_type,
      vehicle_plate,
      vehicle_reg_no,
      driving_license,
      vehicle_photo,
      documents,
      created_at,
      updated_at
    FROM users
    WHERE
      roles LIKE '%rider%'
      AND (
        vehicle_type IS NOT NULL
        OR vehicle_plate IS NOT NULL
        OR vehicle_reg_no IS NOT NULL
        OR driving_license IS NOT NULL
        OR vehicle_photo IS NOT NULL
        OR documents IS NOT NULL
      )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

-- ── Create vendor_profiles table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_profiles (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  store_name         TEXT,
  store_category     TEXT,
  store_banner       TEXT,
  store_description  TEXT,
  store_hours        TEXT,
  store_announcement TEXT,
  store_min_order    NUMERIC(10, 2) DEFAULT 0,
  store_delivery_time TEXT,
  store_is_open      BOOLEAN NOT NULL DEFAULT TRUE,
  store_address      TEXT,
  business_type      TEXT,
  business_name      TEXT,
  ntn                TEXT,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Populate vendor_profiles from existing users data (only if columns exist) ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'store_name'
  ) THEN
    INSERT INTO vendor_profiles (user_id, store_name, store_category, store_banner, store_description, store_hours, store_announcement, store_min_order, store_delivery_time, store_is_open, store_address, business_type, business_name, ntn, created_at, updated_at)
    SELECT
      id,
      store_name,
      store_category,
      store_banner,
      store_description,
      store_hours,
      store_announcement,
      COALESCE(store_min_order, 0),
      store_delivery_time,
      COALESCE(store_is_open, TRUE),
      store_address,
      business_type,
      business_name,
      ntn,
      created_at,
      updated_at
    FROM users
    WHERE
      roles LIKE '%vendor%'
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

-- ── Indexes for common join patterns ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS rider_profiles_user_id_idx ON rider_profiles (user_id);
CREATE INDEX IF NOT EXISTS vendor_profiles_user_id_idx ON vendor_profiles (user_id);
CREATE INDEX IF NOT EXISTS vendor_profiles_store_category_idx ON vendor_profiles (store_category);
CREATE INDEX IF NOT EXISTS vendor_profiles_store_is_open_idx ON vendor_profiles (store_is_open);
