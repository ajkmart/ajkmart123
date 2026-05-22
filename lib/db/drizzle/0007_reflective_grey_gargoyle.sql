CREATE TABLE "whatsapp_delivery_logs" (
        "id" text PRIMARY KEY NOT NULL,
        "phone" text NOT NULL,
        "message" text NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "provider_message_id" text,
        "error_message" text,
        "retries" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_rules" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "description" text DEFAULT '' NOT NULL,
        "trigger" text NOT NULL,
        "conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "actions" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "priority" integer DEFAULT 0 NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_campaigns" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "description" text DEFAULT '' NOT NULL,
        "points_reward" integer DEFAULT 0 NOT NULL,
        "min_order_amount" numeric(10, 2),
        "start_date" timestamp NOT NULL,
        "end_date" timestamp NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_rewards" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "description" text DEFAULT '' NOT NULL,
        "points_cost" integer DEFAULT 0 NOT NULL,
        "reward_type" text NOT NULL,
        "reward_value" numeric(10, 2) DEFAULT '0.00' NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "stock" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "encrypted_phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "encrypted_email" text;