-- Migration 0046: Add P2P transfer columns to wallet_transactions
-- These columns track the recipient and optional note for peer-to-peer
-- wallet transfers. Previously handled by a runtime stub (ensureWalletP2PColumns).

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS receiver_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receiver_name TEXT,
  ADD COLUMN IF NOT EXISTS p2p_note      TEXT;

CREATE INDEX IF NOT EXISTS idx_wallet_txn_receiver
  ON wallet_transactions(receiver_id);
