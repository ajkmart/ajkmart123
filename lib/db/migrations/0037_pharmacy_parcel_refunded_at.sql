-- Add refunded_at idempotency stamp to pharmacy_orders and parcel_bookings.
-- isNull(refunded_at) is used as the guard inside the cancellation transaction
-- to prevent double-refund under concurrent cancel requests.

ALTER TABLE pharmacy_orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP;
ALTER TABLE parcel_bookings ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP;
