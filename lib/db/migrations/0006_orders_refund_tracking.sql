ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_amount numeric(10,2);
CREATE INDEX IF NOT EXISTS orders_refunded_at_idx ON orders(refunded_at) WHERE refunded_at IS NOT NULL;
