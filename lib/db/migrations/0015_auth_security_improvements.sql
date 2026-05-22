-- Migration: Auth security improvements
-- 1) Make phone nullable (social login users may not have a phone)
-- 2) Add merge OTP fields (separate from login OTP)
-- 3) Add pending merge identifier
-- 4) Add token version for JWT revocation
-- 5) Add social login fields (google_id, facebook_id)
-- 6) Add 2FA / TOTP fields
-- 7) Create rate_limits table for persistent lockouts
-- 8) Clean up fake phone numbers from social login users

-- phone is already nullable in new schema; ensure existing DB matches
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- Merge OTP fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS merge_otp_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS merge_otp_expiry TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_merge_identifier TEXT;

-- Token version for JWT revocation
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Social login fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id TEXT UNIQUE;

-- 2FA / TOTP fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trusted_devices TEXT;

-- Auto-suspension tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_suspended_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_suspend_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_override_suspension BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- Rate limits table for persistent login lockouts and IP blocks
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP,
  window_start TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Clean up fake phone numbers from social login users
UPDATE users SET phone = NULL WHERE phone LIKE 'google_%';
UPDATE users SET phone = NULL WHERE phone LIKE 'facebook_%';
