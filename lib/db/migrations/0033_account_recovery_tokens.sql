CREATE TABLE IF NOT EXISTS "account_recovery_tokens" (
  "id"         TEXT PRIMARY KEY,
  "user_id"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" TEXT NOT NULL UNIQUE,
  "expires_at" TIMESTAMP NOT NULL,
  "used_at"    TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "account_recovery_tokens_user_id_idx" ON "account_recovery_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "account_recovery_tokens_expires_at_idx" ON "account_recovery_tokens" ("expires_at");
