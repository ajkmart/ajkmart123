ALTER TABLE products ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';
CREATE INDEX IF NOT EXISTS products_approval_status_idx ON products(approval_status);
