-- Add idempotency_key column to wallet_transactions to prevent duplicate transactions
-- from replayed requests (offline queue, retries, race conditions).
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_txn_idempotency_key_idx ON wallet_transactions (idempotency_key) WHERE idempotency_key IS NOT NULL;
