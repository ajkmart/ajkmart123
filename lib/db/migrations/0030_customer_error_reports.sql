CREATE TYPE "customer_report_status" AS ENUM ('new', 'reviewed', 'closed');

CREATE TABLE "customer_error_reports" (
  "id" text PRIMARY KEY,
  "timestamp" timestamp DEFAULT now() NOT NULL,
  "customer_name" text NOT NULL,
  "customer_email" text,
  "customer_phone" text,
  "user_id" text,
  "app_version" text,
  "device_info" text,
  "platform" text,
  "screen" text,
  "description" text NOT NULL,
  "repro_steps" text,
  "status" "customer_report_status" DEFAULT 'new' NOT NULL,
  "admin_note" text,
  "reviewed_at" timestamp
);
