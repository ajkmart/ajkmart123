-- Migration: Add language preference column to admin_accounts table
-- Date: 2026-03-31

ALTER TABLE admin_accounts
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
