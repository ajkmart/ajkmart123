-- Migration: 0026_user_metrics_columns.sql
-- Adds user metrics columns to the users table for the admin condition engine.
-- These fields store aggregated behavioural metrics so that the condition rules
-- can evaluate them without unsafe (user as any) casts in the application code.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cancellation_rate    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_incidents      INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abuse_reports        INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS miss_ignore_rate     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_completion_rate NUMERIC(5,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS avg_rating           NUMERIC(3,2);
