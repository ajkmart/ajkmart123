-- PROMPT 8 — Step 1: Copy active (non-expired) OTPs from users table into otp_tokens
-- Run this FIRST before dropping any columns.
-- Note: otp_code stored as plain text in users table; copying as-is into otp_hash.
-- These tokens expire within minutes so the hash mismatch is acceptable for this short window.

INSERT INTO otp_tokens (
  id,
  identifier,
  identifier_type,
  otp_type,
  otp_hash,
  expires_at,
  used_at,
  user_id,
  channel,
  created_at
)
SELECT
  gen_random_uuid()::text,
  phone,
  'phone',
  'login',
  otp_code,
  otp_expiry,
  NULL,
  id,
  'sms',
  NOW()
FROM users
WHERE
  otp_code IS NOT NULL
  AND otp_expiry > NOW()
  AND otp_used = false
  AND phone IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate email OTPs
INSERT INTO otp_tokens (
  id,
  identifier,
  identifier_type,
  otp_type,
  otp_hash,
  expires_at,
  used_at,
  user_id,
  channel,
  created_at
)
SELECT
  gen_random_uuid()::text,
  email,
  'email',
  'login',
  email_otp_code,
  email_otp_expiry,
  NULL,
  id,
  'email',
  NOW()
FROM users
WHERE
  email_otp_code IS NOT NULL
  AND email_otp_expiry > NOW()
  AND email_otp_used = false
  AND email IS NOT NULL
ON CONFLICT DO NOTHING;
