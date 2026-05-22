-- Migration: 0040_otp_tokens_table
-- Creates the unified otp_tokens table to replace:
--   - pending_otps table (for unregistered users)
--   - OTP columns scattered in users table (otp_code, email_otp_code, etc.)
-- This is ADDITIVE only — no existing tables are dropped here.

CREATE TABLE IF NOT EXISTS otp_tokens (
  id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier          TEXT        NOT NULL,
  identifier_type     TEXT        NOT NULL CHECK (identifier_type IN ('phone', 'email')),
  otp_type            TEXT        NOT NULL CHECK (otp_type IN ('login', 'register', 'reset', 'merge', 'trip')),
  otp_hash            TEXT        NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  used_at             TIMESTAMPTZ,
  user_id             TEXT        REFERENCES users(id) ON DELETE SET NULL,
  channel             TEXT        NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email', 'console')),
  ip_address          TEXT,
  device_fingerprint  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_tokens_identifier
  ON otp_tokens (identifier, identifier_type);

CREATE INDEX IF NOT EXISTS idx_otp_tokens_expires
  ON otp_tokens (expires_at)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_otp_tokens_user_id
  ON otp_tokens (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_otp_tokens_lookup
  ON otp_tokens (identifier, identifier_type, otp_type, used_at, expires_at);
