CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "idempotency_key" text NOT NULL,
  "response_data" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_key_uniq" UNIQUE ("user_id", "idempotency_key");
