-- Migration: Ride Phase 4
-- 1) Add trip OTP (4-digit code for starting trip)
-- 2) Add parcel delivery fields
-- 3) Add precise event timestamps
ALTER TABLE rides ADD COLUMN IF NOT EXISTS trip_otp TEXT;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS otp_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS is_parcel BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS receiver_name TEXT;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS receiver_phone TEXT;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS package_type TEXT;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
