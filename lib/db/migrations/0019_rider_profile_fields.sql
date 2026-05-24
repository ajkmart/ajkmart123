-- Migration: Add KYC, emergency contact, and bank fields to rider_profiles
-- Also adds composite index on rider_penalties

ALTER TABLE rider_profiles
  ADD COLUMN IF NOT EXISTS kyc_status        TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS documents_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
  ADD COLUMN IF NOT EXISTS bank_name         TEXT,
  ADD COLUMN IF NOT EXISTS bank_account      TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_title TEXT;

CREATE INDEX IF NOT EXISTS rider_profiles_kyc_status_idx
  ON rider_profiles (kyc_status);
