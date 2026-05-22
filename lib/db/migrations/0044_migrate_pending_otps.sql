-- PROMPT 8 — Step 3: Migrate pending_otps table into otp_tokens, then drop it
-- Idempotent: safely handles case where pending_otps was already dropped manually.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pending_otps') THEN
    INSERT INTO otp_tokens (
      id,
      identifier,
      identifier_type,
      otp_type,
      otp_hash,
      expires_at,
      used_at,
      user_id,
      channel,
      created_at
    )
    SELECT
      gen_random_uuid()::text,
      phone,
      'phone',
      'register',
      otp_hash,
      otp_expiry,
      NULL,
      NULL,
      'sms',
      created_at
    FROM pending_otps
    WHERE otp_expiry > NOW()
    ON CONFLICT DO NOTHING;

    DROP TABLE pending_otps;
  END IF;
END $$;
