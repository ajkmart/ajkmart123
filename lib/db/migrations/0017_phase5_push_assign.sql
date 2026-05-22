-- Migration: Phase 5 — Push subscriptions + vendor order rider assignment

-- Push subscription storage (Web Push VAPID)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'customer',
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth_key      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- Vendor order: manual rider assignment
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_rider_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
