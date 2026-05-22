-- Create user_totp_setup table for two-phase TOTP enrollment
CREATE TABLE IF NOT EXISTS user_totp_setup (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret           TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_totp_setup_user_id_idx ON user_totp_setup (user_id);
