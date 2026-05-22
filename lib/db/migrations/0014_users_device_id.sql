-- Migration: Add device_id to users table for device fingerprinting
-- Supports Unified Auth Gatekeeper: detect multi-account abuse per device

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS device_id TEXT;

CREATE INDEX IF NOT EXISTS users_device_id_idx ON users (device_id);
