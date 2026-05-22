ALTER TABLE rides ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
CREATE INDEX IF NOT EXISTS rides_refunded_at_idx ON rides(refunded_at) WHERE refunded_at IS NOT NULL;
