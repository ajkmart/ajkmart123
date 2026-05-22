-- Migration: Token Family Invalidation (Replay Attack Detection)
-- Adds three columns to refresh_tokens for token-family chaining and replay detection.

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS token_family_id  TEXT,
  ADD COLUMN IF NOT EXISTS used_at          TIMESTAMP,
  ADD COLUMN IF NOT EXISTS revoked_reason   TEXT;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens (token_family_id);
