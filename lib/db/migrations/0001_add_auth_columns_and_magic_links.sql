-- Migration: Add auth-related columns to users table and create magic_link_tokens table
-- Safe for existing databases: uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS

-- Add new auth columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_reg_no text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS driving_license text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_address text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ntn text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_enabled boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trusted_devices text;

-- Create magic_link_tokens table
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL
);
