-- Migration: Add token family tracking columns to refresh_tokens
-- Enables token rotation with family-based invalidation (detect token theft).
-- All columns are nullable / have defaults so existing rows are not broken.

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS token_family_id TEXT,
  ADD COLUMN IF NOT EXISTS revoked         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revoked_reason  TEXT;

-- Backfill: mark existing rows that have revokedAt set as revoked=true
UPDATE refresh_tokens
   SET revoked = TRUE
 WHERE revoked_at IS NOT NULL AND revoked = FALSE;

-- Index on token_family_id for fast family-wide invalidation queries
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id
  ON refresh_tokens (token_family_id)
  WHERE token_family_id IS NOT NULL;
