ALTER TABLE orders ADD COLUMN IF NOT EXISTS txn_ref text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';
