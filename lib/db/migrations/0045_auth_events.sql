-- Migration 0045: auth_events and trusted_devices tables

CREATE TABLE IF NOT EXISTS auth_events (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT REFERENCES users(id) ON DELETE CASCADE,
  event_type     TEXT NOT NULL,
  channel        TEXT,
  role           TEXT,
  ip             TEXT,
  user_agent     TEXT,
  device_id      TEXT,
  country        TEXT,
  city           TEXT,
  success        BOOLEAN NOT NULL DEFAULT true,
  failure_reason TEXT,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_events_user_id_idx      ON auth_events(user_id);
CREATE INDEX IF NOT EXISTS auth_events_event_type_idx   ON auth_events(event_type);
CREATE INDEX IF NOT EXISTS auth_events_created_at_idx   ON auth_events(created_at);
CREATE INDEX IF NOT EXISTS auth_events_ip_created_at_idx ON auth_events(ip, created_at);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id    TEXT NOT NULL,
  device_name  TEXT,
  device_type  TEXT,
  fingerprint  TEXT,
  trusted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  is_revoked   BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS trusted_devices_user_id_idx   ON trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS trusted_devices_device_id_idx ON trusted_devices(device_id);
CREATE INDEX IF NOT EXISTS trusted_devices_expires_at_idx ON trusted_devices(expires_at);
