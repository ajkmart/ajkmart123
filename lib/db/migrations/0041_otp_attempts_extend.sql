-- Migration: 0041_otp_attempts_extend
-- Extends otp_attempts table with identifier_type and otp_type columns
-- so we can track phone vs email attempts and login vs reset attempts separately.

ALTER TABLE otp_attempts
  ADD COLUMN IF NOT EXISTS identifier_type TEXT NOT NULL DEFAULT 'phone'
    CHECK (identifier_type IN ('phone', 'email')),
  ADD COLUMN IF NOT EXISTS otp_type TEXT NOT NULL DEFAULT 'login'
    CHECK (otp_type IN ('login', 'register', 'reset', 'merge', 'trip'));
