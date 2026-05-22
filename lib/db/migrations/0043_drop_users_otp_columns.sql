-- PROMPT 8 — Step 2: Drop OTP columns from users table
-- Run AFTER 0042 (data already copied to otp_tokens).
-- Run AFTER confirming the new OTP module login flow works correctly.

ALTER TABLE users DROP COLUMN IF EXISTS otp_code;
ALTER TABLE users DROP COLUMN IF EXISTS otp_expiry;
ALTER TABLE users DROP COLUMN IF EXISTS otp_used;

ALTER TABLE users DROP COLUMN IF EXISTS email_otp_code;
ALTER TABLE users DROP COLUMN IF EXISTS email_otp_expiry;
ALTER TABLE users DROP COLUMN IF EXISTS email_otp_used;

ALTER TABLE users DROP COLUMN IF EXISTS merge_otp_code;
ALTER TABLE users DROP COLUMN IF EXISTS merge_otp_expiry;
