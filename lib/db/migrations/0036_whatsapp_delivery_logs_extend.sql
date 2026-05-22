ALTER TABLE whatsapp_delivery_logs
  ADD COLUMN IF NOT EXISTS error_code      TEXT,
  ADD COLUMN IF NOT EXISTS fallback_sent   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fallback_channel TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_delivery_logs_provider_message_id_idx
  ON whatsapp_delivery_logs (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
