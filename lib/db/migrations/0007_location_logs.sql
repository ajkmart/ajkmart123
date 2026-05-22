CREATE TABLE IF NOT EXISTS "location_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "role" text DEFAULT 'rider' NOT NULL,
  "latitude" numeric(10,6) NOT NULL,
  "longitude" numeric(10,6) NOT NULL,
  "accuracy" real,
  "speed" real,
  "heading" real,
  "battery_level" real,
  "is_spoofed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "location_logs_user_ts_idx" ON "location_logs" ("user_id","created_at");
CREATE INDEX IF NOT EXISTS "location_logs_user_idx" ON "location_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "location_logs_role_idx" ON "location_logs" ("role");
