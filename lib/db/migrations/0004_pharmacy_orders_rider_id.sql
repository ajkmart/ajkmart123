ALTER TABLE pharmacy_orders ADD COLUMN IF NOT EXISTS rider_id text;
CREATE INDEX IF NOT EXISTS pharmacy_orders_rider_id_idx ON pharmacy_orders(rider_id);
