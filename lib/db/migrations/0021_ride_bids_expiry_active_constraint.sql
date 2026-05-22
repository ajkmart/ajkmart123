-- Add expires_at column to ride_bids (NOT NULL, default 30 min from now for existing open bids)
ALTER TABLE ride_bids ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Back-fill existing open bids with a 30-minute expiry from creation time
UPDATE ride_bids SET expires_at = created_at + INTERVAL '30 minutes'
WHERE expires_at IS NULL AND status = 'pending';

-- For all other existing bids (accepted/rejected), set expiry to their updatedAt
UPDATE ride_bids SET expires_at = updated_at
WHERE expires_at IS NULL;

-- Now enforce NOT NULL
ALTER TABLE ride_bids ALTER COLUMN expires_at SET NOT NULL;

-- Add index on expires_at for efficient expiry queries
CREATE INDEX IF NOT EXISTS ride_bids_expires_at_idx ON ride_bids (expires_at);

-- Update the active-ride partial uniqueness index to cover all live statuses
-- (including dispatched and pending so no future status can silently bypass it)
DROP INDEX IF EXISTS rides_one_active_per_user_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS rides_one_active_per_user_uidx
  ON rides (user_id)
  WHERE status IN ('searching', 'bargaining', 'accepted', 'arrived', 'in_transit', 'dispatched', 'pending');
