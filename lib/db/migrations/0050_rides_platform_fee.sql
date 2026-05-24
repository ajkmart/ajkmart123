-- Migration: add platform_fee column to rides table
ALTER TABLE rides ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0;
