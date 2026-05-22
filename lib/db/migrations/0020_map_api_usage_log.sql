CREATE TABLE IF NOT EXISTS "map_api_usage_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "endpoint_type" text NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "date" date NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "map_api_usage_log_unique" UNIQUE ("provider", "endpoint_type", "date")
);
