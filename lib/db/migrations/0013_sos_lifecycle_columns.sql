-- Migration: Add SOS lifecycle columns to notifications table
-- These columns track the full Pending → Acknowledged → Resolved lifecycle for SOS alerts

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS sos_status        TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS acknowledged_at   TIMESTAMP,
  ADD COLUMN IF NOT EXISTS acknowledged_by   TEXT,
  ADD COLUMN IF NOT EXISTS acknowledged_by_name TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at       TIMESTAMP,
  ADD COLUMN IF NOT EXISTS resolved_by       TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by_name  TEXT,
  ADD COLUMN IF NOT EXISTS resolution_notes  TEXT;

CREATE INDEX IF NOT EXISTS notifications_sos_status_idx ON notifications (sos_status);
