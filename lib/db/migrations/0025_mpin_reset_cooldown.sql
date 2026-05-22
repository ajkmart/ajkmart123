-- Migration: 0025_mpin_reset_cooldown.sql
-- Adds two columns to support the MPIN forgot-flow cooldown (SIM-swap protection).
-- When a user without TOTP enabled requests an MPIN reset, the new hashed MPIN is
-- stored in mpin_reset_new_hash_pending and the request timestamp in
-- mpin_reset_pending_at. The hash is only promoted to wallet_pin_hash after the
-- 24-hour cooldown elapses (via POST /wallet/pin/reset-activate).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mpin_reset_pending_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS mpin_reset_new_hash_pending TEXT;
