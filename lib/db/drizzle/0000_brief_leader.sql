CREATE TYPE "public"."language_mode" AS ENUM('en', 'ur', 'roman', 'en_roman', 'en_ur');--> statement-breakpoint
CREATE TYPE "public"."condition_mode" AS ENUM('default', 'ai_recommended', 'custom');--> statement-breakpoint
CREATE TYPE "public"."condition_severity" AS ENUM('warning', 'restriction_normal', 'restriction_strict', 'suspension', 'ban');--> statement-breakpoint
CREATE TYPE "public"."condition_type" AS ENUM('warning_l1', 'warning_l2', 'warning_l3', 'restriction_service_block', 'restriction_wallet_freeze', 'restriction_promo_block', 'restriction_order_cap', 'restriction_review_block', 'restriction_cash_only', 'restriction_new_order_block', 'restriction_rate_limit', 'restriction_pending_review_gate', 'restriction_device_restriction', 'suspension_temporary', 'suspension_extended', 'suspension_pending_review', 'ban_soft', 'ban_hard', 'ban_fraud');--> statement-breakpoint
CREATE TYPE "public"."error_severity" AS ENUM('critical', 'medium', 'minor');--> statement-breakpoint
CREATE TYPE "public"."error_status" AS ENUM('new', 'acknowledged', 'in_progress', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."error_type" AS ENUM('frontend_crash', 'api_error', 'db_error', 'route_error', 'ui_error', 'unhandled_exception');--> statement-breakpoint
CREATE TYPE "public"."resolution_method" AS ENUM('manual', 'auto_resolved', 'task_created');--> statement-breakpoint
CREATE TYPE "public"."error_source_app" AS ENUM('customer', 'rider', 'vendor', 'admin', 'api');--> statement-breakpoint
CREATE TYPE "public"."customer_report_status" AS ENUM('new', 'reviewed', 'closed');--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text,
	"name" text,
	"email" text,
	"roles" text DEFAULT 'customer' NOT NULL,
	"avatar" text,
	"wallet_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"otp_code" text,
	"otp_expiry" timestamp,
	"otp_used" boolean DEFAULT false NOT NULL,
	"email_otp_code" text,
	"email_otp_expiry" timestamp,
	"username" text,
	"password_hash" text,
	"require_password_change" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"approval_status" text DEFAULT 'approved' NOT NULL,
	"approval_note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"blocked_services" text DEFAULT '' NOT NULL,
	"security_note" text,
	"is_online" boolean DEFAULT false NOT NULL,
	"cnic" text,
	"address" text,
	"city" text,
	"area" text,
	"latitude" text,
	"longitude" text,
	"kyc_status" text DEFAULT 'none' NOT NULL,
	"account_level" text DEFAULT 'bronze' NOT NULL,
	"emergency_contact" text,
	"bank_name" text,
	"bank_account" text,
	"bank_account_title" text,
	"national_id" text,
	"biometric_enabled" boolean DEFAULT false NOT NULL,
	"wallet_pin_hash" text,
	"wallet_pin_attempts" integer DEFAULT 0 NOT NULL,
	"wallet_pin_locked_until" timestamp,
	"wallet_hidden" boolean DEFAULT false NOT NULL,
	"mpin_reset_pending_at" timestamp,
	"mpin_reset_new_hash_pending" text,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"backup_codes" text,
	"trusted_devices" text,
	"firebase_uid" text,
	"google_id" text,
	"facebook_id" text,
	"cancel_count" integer DEFAULT 0 NOT NULL,
	"ignore_count" integer DEFAULT 0 NOT NULL,
	"is_restricted" boolean DEFAULT false NOT NULL,
	"cancellation_debt" numeric(10, 2) DEFAULT '0' NOT NULL,
	"merge_otp_code" text,
	"merge_otp_expiry" timestamp,
	"pending_merge_identifier" text,
	"device_id" text,
	"token_version" integer DEFAULT 0 NOT NULL,
	"dev_otp_enabled" boolean DEFAULT false NOT NULL,
	"otp_bypass_until" timestamp,
	"cancellation_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"fraud_incidents" integer DEFAULT 0 NOT NULL,
	"abuse_reports" integer DEFAULT 0 NOT NULL,
	"miss_ignore_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"order_completion_rate" numeric(5, 2) DEFAULT '100' NOT NULL,
	"avg_rating" numeric(3, 2),
	"auto_suspended_at" timestamp,
	"auto_suspend_reason" text,
	"admin_override_suspension" boolean DEFAULT false NOT NULL,
	"commission_override" text,
	"ajk_id" text,
	"chat_muted" boolean DEFAULT false NOT NULL,
	"comm_blocked" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp,
	"last_active" timestamp,
	"accepted_terms_version" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_facebook_id_unique" UNIQUE("facebook_id"),
	CONSTRAINT "users_ajk_id_unique" UNIQUE("ajk_id"),
	CONSTRAINT "users_wallet_non_negative" CHECK ("users"."wallet_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"original_price" numeric(10, 2),
	"category" text NOT NULL,
	"type" text DEFAULT 'mart' NOT NULL,
	"image" text,
	"images" text[],
	"video_url" text,
	"vendor_id" text NOT NULL,
	"vendor_name" text,
	"rating" numeric(3, 1) DEFAULT '4.0',
	"review_count" integer DEFAULT 0,
	"in_stock" boolean DEFAULT true NOT NULL,
	"stock" integer,
	"unit" text,
	"delivery_time" text,
	"deal_expires_at" timestamp,
	"approval_status" text DEFAULT 'approved' NOT NULL,
	"low_stock_threshold" integer,
	"max_quantity_per_order" integer,
	"back_in_stock_notify" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_positive" CHECK ("products"."price" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"items" json NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"delivery_address" text,
	"payment_method" text NOT NULL,
	"rider_id" text,
	"rider_name" text,
	"rider_phone" text,
	"vendor_id" text,
	"estimated_time" text,
	"proof_photo_url" text,
	"txn_ref" text,
	"payment_status" text DEFAULT 'pending',
	"refunded_at" timestamp,
	"refunded_amount" numeric(10, 2),
	"assigned_rider_id" text,
	"assigned_at" timestamp,
	"accepted_at" timestamp,
	"customer_lat" numeric(10, 7),
	"customer_lng" numeric(10, 7),
	"gps_accuracy" double precision,
	"gps_mismatch" boolean DEFAULT false,
	"delivery_lat" numeric(10, 7),
	"delivery_lng" numeric(10, 7),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_total_non_negative" CHECK ("orders"."total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"payment_method" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_txn_amount_non_negative" CHECK ("wallet_transactions"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'searching' NOT NULL,
	"pickup_address" text NOT NULL,
	"drop_address" text NOT NULL,
	"pickup_lat" numeric(10, 6),
	"pickup_lng" numeric(10, 6),
	"drop_lat" numeric(10, 6),
	"drop_lng" numeric(10, 6),
	"fare" numeric(10, 2) NOT NULL,
	"distance" numeric(10, 2) NOT NULL,
	"rider_id" text,
	"rider_name" text,
	"rider_phone" text,
	"payment_method" text NOT NULL,
	"offered_fare" numeric(10, 2),
	"counter_fare" numeric(10, 2),
	"bargain_status" text,
	"bargain_rounds" integer DEFAULT 0,
	"bargain_note" text,
	"cancellation_reason" text,
	"dispatched_rider_id" text,
	"dispatch_attempts" jsonb DEFAULT '[]'::jsonb,
	"dispatch_loop_count" integer DEFAULT 0,
	"dispatched_at" timestamp,
	"expires_at" timestamp,
	"trip_otp" text,
	"otp_verified" boolean DEFAULT false NOT NULL,
	"is_parcel" boolean DEFAULT false NOT NULL,
	"receiver_name" text,
	"receiver_phone" text,
	"package_type" text,
	"is_scheduled" boolean DEFAULT false NOT NULL,
	"scheduled_at" timestamp,
	"stops" jsonb DEFAULT 'null'::jsonb,
	"is_pool_ride" boolean DEFAULT false NOT NULL,
	"pool_group_id" text,
	"accepted_at" timestamp,
	"arrived_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"refunded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_bids" (
	"id" text PRIMARY KEY NOT NULL,
	"ride_id" text NOT NULL,
	"rider_id" text NOT NULL,
	"rider_name" text NOT NULL,
	"rider_phone" text,
	"fare" numeric(10, 2) NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_locations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"latitude" numeric(10, 6) NOT NULL,
	"longitude" numeric(10, 6) NOT NULL,
	"role" text NOT NULL,
	"action" text,
	"battery_level" real,
	"last_seen" timestamp,
	"online_since" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pharmacy_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rider_id" text,
	"items" json NOT NULL,
	"prescription_note" text,
	"delivery_address" text NOT NULL,
	"contact_phone" text NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"estimated_time" text DEFAULT '25-40 min',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parcel_bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_phone" text NOT NULL,
	"pickup_address" text NOT NULL,
	"receiver_name" text NOT NULL,
	"receiver_phone" text NOT NULL,
	"drop_address" text NOT NULL,
	"parcel_type" text NOT NULL,
	"weight" numeric(6, 2),
	"description" text,
	"fare" numeric(10, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"estimated_time" text DEFAULT '45-60 min',
	"rider_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"type" text DEFAULT 'system' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"icon" text DEFAULT 'notifications-outline',
	"link" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sos_status" text DEFAULT 'pending',
	"acknowledged_at" timestamp,
	"acknowledged_by" text,
	"acknowledged_by_name" text,
	"resolved_at" timestamp,
	"resolved_by" text,
	"resolved_by_name" text,
	"resolution_notes" text
);
--> statement-breakpoint
CREATE TABLE "saved_addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"city" text DEFAULT 'Muzaffarabad' NOT NULL,
	"icon" text DEFAULT 'location-outline' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"notif_orders" boolean DEFAULT true NOT NULL,
	"notif_wallet" boolean DEFAULT true NOT NULL,
	"notif_deals" boolean DEFAULT true NOT NULL,
	"notif_rides" boolean DEFAULT true NOT NULL,
	"location_sharing" boolean DEFAULT true NOT NULL,
	"biometric" boolean DEFAULT false NOT NULL,
	"two_factor" boolean DEFAULT false NOT NULL,
	"dark_mode" boolean DEFAULT false NOT NULL,
	"language" "language_mode" DEFAULT 'en_roman' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flash_deals" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"title" text,
	"badge" text DEFAULT 'FLASH' NOT NULL,
	"discount_pct" numeric(5, 2),
	"discount_flat" numeric(10, 2),
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"deal_stock" integer,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"discount_pct" numeric(5, 2),
	"discount_flat" numeric(10, 2),
	"min_order_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"max_discount" numeric(10, 2),
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"applies_to" text DEFAULT 'all' NOT NULL,
	"expires_at" timestamp,
	"vendor_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "admin_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text,
	"email" text,
	"secret" text NOT NULL,
	"role" text DEFAULT 'manager' NOT NULL,
	"permissions" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'en',
	"must_change_password" boolean DEFAULT false NOT NULL,
	"password_changed_at" timestamp,
	"default_credentials" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_accounts_username_unique" UNIQUE("username"),
	CONSTRAINT "admin_accounts_secret_unique" UNIQUE("secret")
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text,
	"event" text NOT NULL,
	"ip" varchar(45) NOT NULL,
	"user_agent" text,
	"result" varchar(20) NOT NULL,
	"reason" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"ip" varchar(45) NOT NULL,
	"user_agent" text,
	"csrf_token_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_used_at" timestamp DEFAULT now(),
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "admin_password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"requested_by" text DEFAULT 'self' NOT NULL,
	"requester_admin_id" text,
	"requester_ip" varchar(45) DEFAULT 'unknown' NOT NULL,
	"requester_user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_password_hash_snapshots" (
	"admin_id" text PRIMARY KEY NOT NULL,
	"secret_hash" text NOT NULL,
	"password_changed_at" timestamp,
	"last_verified_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbac_admin_role_assignments" (
	"admin_id" text NOT NULL,
	"role_id" text NOT NULL,
	"granted_by" text,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rbac_admin_role_assignments_admin_id_role_id_pk" PRIMARY KEY("admin_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "rbac_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbac_role_permissions" (
	"role_id" text NOT NULL,
	"permission_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rbac_role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "rbac_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rbac_roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "rbac_user_role_assignments" (
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"scope_type" text DEFAULT 'global' NOT NULL,
	"scope_id" text,
	"granted_by" text,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rbac_user_role_assignments_user_id_role_id_scope_type_pk" PRIMARY KEY("user_id","role_id","scope_type")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"user_id" text NOT NULL,
	"vendor_id" text,
	"rider_id" text,
	"order_type" text NOT NULL,
	"rating" integer NOT NULL,
	"rider_rating" integer,
	"comment" text,
	"photos" text[],
	"product_id" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text,
	"status" text DEFAULT 'visible' NOT NULL,
	"moderation_note" text,
	"vendor_reply" text,
	"vendor_replied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating"       BETWEEN 1 AND 5),
	CONSTRAINT "reviews_rider_rating_range" CHECK ("reviews"."rider_rating"  IS NULL OR "reviews"."rider_rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "system_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"action_id" text NOT NULL,
	"tables_json" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_backups" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"tables_json" text NOT NULL,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"size_kb" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_service_types" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"name_urdu" text,
	"icon" text DEFAULT '🚗' NOT NULL,
	"description" text,
	"color" text DEFAULT '#059669' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"base_fare" numeric(10, 2) DEFAULT '15' NOT NULL,
	"per_km" numeric(10, 2) DEFAULT '8' NOT NULL,
	"min_fare" numeric(10, 2) DEFAULT '50' NOT NULL,
	"max_passengers" integer DEFAULT 1 NOT NULL,
	"allow_bargaining" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ride_service_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "popular_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_urdu" text,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"icon" text DEFAULT '📍' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"route_name" text NOT NULL,
	"school_name" text NOT NULL,
	"school_name_urdu" text,
	"from_area" text NOT NULL,
	"from_area_urdu" text,
	"to_address" text NOT NULL,
	"from_lat" numeric(10, 6),
	"from_lng" numeric(10, 6),
	"to_lat" numeric(10, 6),
	"to_lng" numeric(10, 6),
	"monthly_price" numeric(10, 2) NOT NULL,
	"morning_time" text DEFAULT '7:30 AM',
	"afternoon_time" text,
	"capacity" integer DEFAULT 30 NOT NULL,
	"enrolled_count" integer DEFAULT 0 NOT NULL,
	"vehicle_type" text DEFAULT 'school_shift' NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"route_id" text NOT NULL,
	"student_name" text NOT NULL,
	"student_class" text NOT NULL,
	"monthly_amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"next_billing_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_event_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"ride_id" text NOT NULL,
	"rider_id" text,
	"admin_id" text,
	"event" text NOT NULL,
	"lat" numeric(10, 6),
	"lng" numeric(10, 6),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"auth_method" text,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "auth_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"event" text NOT NULL,
	"ip" text DEFAULT 'unknown' NOT NULL,
	"user_agent" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "magic_link_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rider_penalties" (
	"id" text PRIMARY KEY NOT NULL,
	"rider_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"ride_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"rider_id" text NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_notified_riders" (
	"id" text PRIMARY KEY NOT NULL,
	"ride_id" text NOT NULL,
	"rider_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'rider' NOT NULL,
	"latitude" numeric(10, 6) NOT NULL,
	"longitude" numeric(10, 6) NOT NULL,
	"accuracy" real,
	"speed" real,
	"heading" real,
	"battery_level" real,
	"is_spoofed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"window_start" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"label" text NOT NULL,
	"type" text DEFAULT 'size' NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"original_price" numeric(10, 2),
	"sku" text,
	"stock" integer,
	"in_stock" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"attributes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"image_url" text,
	"link_type" text DEFAULT 'none' NOT NULL,
	"link_value" text,
	"target_service" text,
	"placement" text DEFAULT 'home' NOT NULL,
	"color_from" text DEFAULT '#7C3AED' NOT NULL,
	"color_to" text DEFAULT '#4F46E5' NOT NULL,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"interaction_type" text DEFAULT 'view' NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rider_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"vehicle_type" text,
	"vehicle_plate" text,
	"vehicle_reg_no" text,
	"driving_license" text,
	"vehicle_photo" text,
	"documents" text,
	"daily_goal" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"store_name" text,
	"store_category" text,
	"store_banner" text,
	"store_description" text,
	"store_hours" text,
	"store_announcement" text,
	"store_min_order" numeric(10, 2) DEFAULT '0',
	"store_delivery_time" text,
	"store_is_open" boolean DEFAULT true NOT NULL,
	"store_address" text,
	"store_lat" numeric(10, 7),
	"store_lng" numeric(10, 7),
	"business_type" text,
	"business_name" text,
	"ntn" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'customer' NOT NULL,
	"token_type" text DEFAULT 'vapid' NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text,
	"auth_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_otps" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"otp_hash" text NOT NULL,
	"otp_expiry" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pending_otps_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "kyc_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"full_name" text,
	"cnic" text,
	"date_of_birth" text,
	"gender" text,
	"address" text,
	"city" text,
	"front_id_photo" text,
	"back_id_photo" text,
	"selfie_photo" text,
	"rejection_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"refresh_token_id" text,
	"device_name" text,
	"browser" text,
	"os" text,
	"ip" text,
	"location" text,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ip" text,
	"device_name" text,
	"browser" text,
	"os" text,
	"location" text,
	"success" boolean DEFAULT true NOT NULL,
	"method" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "van_bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"schedule_id" text NOT NULL,
	"route_id" text NOT NULL,
	"seat_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seat_tiers" jsonb DEFAULT 'null'::jsonb,
	"tier_label" text,
	"price_paid" numeric(10, 2),
	"travel_date" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"fare" numeric(10, 2) NOT NULL,
	"tier_breakdown" jsonb DEFAULT 'null'::jsonb,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"passenger_name" text,
	"passenger_phone" text,
	"boarded_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "van_drivers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"van_code" text NOT NULL,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "van_drivers_van_code_unique" UNIQUE("van_code")
);
--> statement-breakpoint
CREATE TABLE "van_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_urdu" text,
	"from_address" text NOT NULL,
	"from_address_urdu" text,
	"from_lat" numeric(10, 7),
	"from_lng" numeric(10, 7),
	"to_address" text NOT NULL,
	"to_address_urdu" text,
	"to_lat" numeric(10, 7),
	"to_lng" numeric(10, 7),
	"distance_km" numeric(6, 2),
	"duration_min" integer,
	"fare_per_seat" numeric(10, 2) NOT NULL,
	"fare_window" numeric(10, 2),
	"fare_aisle" numeric(10, 2),
	"fare_economy" numeric(10, 2),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "van_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL,
	"vehicle_id" text,
	"driver_id" text,
	"van_driver_id" text,
	"departure_time" text NOT NULL,
	"return_time" text,
	"days_of_week" jsonb DEFAULT '[1,2,3,4,5,6]'::jsonb NOT NULL,
	"trip_status" text DEFAULT 'idle' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "van_vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_id" text,
	"plate_number" text NOT NULL,
	"model" text DEFAULT 'Suzuki Carry' NOT NULL,
	"total_seats" integer DEFAULT 12 NOT NULL,
	"seat_layout" jsonb DEFAULT 'null'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"lat" numeric(10, 6) NOT NULL,
	"lng" numeric(10, 6) NOT NULL,
	"radius_km" numeric(8, 2) DEFAULT '30' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"applies_to_rides" boolean DEFAULT true NOT NULL,
	"applies_to_orders" boolean DEFAULT true NOT NULL,
	"applies_to_parcel" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'grid-outline' NOT NULL,
	"type" text DEFAULT 'mart' NOT NULL,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ride_id" text,
	"order_id" text,
	"coords" jsonb NOT NULL,
	"heading" numeric(6, 2),
	"speed" numeric(8, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_api_usage_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"endpoint_type" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "map_api_usage_log_unique" UNIQUE("provider","endpoint_type","date")
);
--> statement-breakpoint
CREATE TABLE "delivery_access_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor_id" text NOT NULL,
	"service_type" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "delivery_whitelist" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"target_id" text NOT NULL,
	"service_type" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_until" timestamp,
	"delivery_label" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text,
	"admin_name" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"old_value" text,
	"new_value" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_conditions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_role" text NOT NULL,
	"condition_type" "condition_type" NOT NULL,
	"severity" "condition_severity" NOT NULL,
	"category" text NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"applied_by" text,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"lifted_at" timestamp,
	"lifted_by" text,
	"lift_reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "condition_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"target_role" text NOT NULL,
	"metric" text NOT NULL,
	"operator" text NOT NULL,
	"threshold" text NOT NULL,
	"condition_type" "condition_type" NOT NULL,
	"severity" "condition_severity" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "condition_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" "condition_mode" DEFAULT 'default' NOT NULL,
	"custom_thresholds" jsonb,
	"ai_parameters" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "popup_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"media_url" text,
	"cta_text" text,
	"cta_link" text,
	"popup_type" text DEFAULT 'modal' NOT NULL,
	"display_frequency" text DEFAULT 'once' NOT NULL,
	"max_impressions_per_user" integer DEFAULT 1,
	"max_total_impressions" integer,
	"priority" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"timezone" text DEFAULT 'Asia/Karachi',
	"targeting" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"style_preset" text DEFAULT 'default',
	"color_from" text DEFAULT '#7C3AED',
	"color_to" text DEFAULT '#4F46E5',
	"text_color" text DEFAULT '#FFFFFF',
	"animation" text DEFAULT 'fade',
	"template_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "popup_impressions" (
	"id" text PRIMARY KEY NOT NULL,
	"popup_id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text DEFAULT 'view' NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL,
	"session_id" text
);
--> statement-breakpoint
CREATE TABLE "popup_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general',
	"popup_type" text DEFAULT 'modal' NOT NULL,
	"default_title" text,
	"default_body" text,
	"default_cta_text" text,
	"color_from" text DEFAULT '#7C3AED' NOT NULL,
	"color_to" text DEFAULT '#4F46E5' NOT NULL,
	"text_color" text DEFAULT '#FFFFFF' NOT NULL,
	"animation" text DEFAULT 'fade',
	"style_preset" text DEFAULT 'default',
	"preview_image_url" text,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"theme" text DEFAULT 'general' NOT NULL,
	"color_from" text DEFAULT '#7C3AED' NOT NULL,
	"color_to" text DEFAULT '#4F46E5' NOT NULL,
	"banner_image" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"budget_cap" numeric(12, 2),
	"budget_spent" numeric(12, 2) DEFAULT '0' NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_participations" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"user_id" text NOT NULL,
	"order_id" text,
	"discount" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"code" text,
	"discount_pct" numeric(5, 2),
	"discount_flat" numeric(10, 2),
	"min_order_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"max_discount" numeric(10, 2),
	"buy_qty" integer,
	"get_qty" integer,
	"cashback_pct" numeric(5, 2),
	"cashback_max" numeric(10, 2),
	"free_delivery" boolean DEFAULT false NOT NULL,
	"targeting_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"usage_limit" integer,
	"usage_per_user" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"applies_to" text DEFAULT 'all' NOT NULL,
	"vendor_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"created_by" text,
	"approved_by" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "offers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "offer_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"code" text,
	"discount_pct" numeric(5, 2),
	"discount_flat" numeric(10, 2),
	"min_order_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"max_discount" numeric(10, 2),
	"buy_qty" integer,
	"get_qty" integer,
	"cashback_pct" numeric(5, 2),
	"cashback_max" numeric(10, 2),
	"free_delivery" boolean DEFAULT false NOT NULL,
	"targeting_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"usage_limit" integer,
	"usage_per_user" integer DEFAULT 1 NOT NULL,
	"applies_to" text DEFAULT 'all' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"message" text NOT NULL,
	"is_from_support" boolean DEFAULT false NOT NULL,
	"is_read_by_admin" boolean DEFAULT false NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"source_app" "error_source_app" NOT NULL,
	"error_type" "error_type" NOT NULL,
	"severity" "error_severity" NOT NULL,
	"status" "error_status" DEFAULT 'new' NOT NULL,
	"function_name" text,
	"module_name" text,
	"component_name" text,
	"error_message" text NOT NULL,
	"short_impact" text,
	"stack_trace" text,
	"metadata" jsonb,
	"resolved_at" timestamp,
	"acknowledged_at" timestamp,
	"resolution_method" "resolution_method",
	"resolution_notes" text,
	"root_cause" text,
	"updated_at" timestamp,
	"error_hash" text,
	"occurrence_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_error_reports" (
	"id" text PRIMARY KEY NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "error_resolution_backups" (
	"id" text PRIMARY KEY NOT NULL,
	"error_report_id" text NOT NULL,
	"previous_status" text NOT NULL,
	"previous_data" jsonb NOT NULL,
	"resolution_method" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_resolve_log" (
	"id" text PRIMARY KEY NOT NULL,
	"error_report_id" text NOT NULL,
	"reason" text NOT NULL,
	"rule_matched" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_moderation_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action_type" text NOT NULL,
	"input_text" text,
	"output_text" text,
	"tokens_used" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"caller_id" text NOT NULL,
	"callee_id" text NOT NULL,
	"conversation_id" text,
	"duration" integer,
	"status" text DEFAULT 'initiated' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"content" text,
	"original_content" text,
	"translated_content" text,
	"message_type" text DEFAULT 'text' NOT NULL,
	"voice_note_url" text,
	"voice_note_transcript" text,
	"voice_note_duration" integer,
	"voice_note_waveform" text,
	"image_url" text,
	"file_url" text,
	"file_name" text,
	"file_size" integer,
	"delivery_status" text DEFAULT 'sent' NOT NULL,
	"read_at" timestamp,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text,
	"reason" text NOT NULL,
	"keyword" text,
	"reviewed_by_admin_id" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" jsonb,
	"role_pair_rules" jsonb,
	"category_rules" jsonb,
	"time_windows" jsonb,
	"message_limits" jsonb,
	"is_preset" boolean DEFAULT false NOT NULL,
	"created_by_ai" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comm_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"participant1_id" text NOT NULL,
	"participant2_id" text NOT NULL,
	"type" text DEFAULT 'direct' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"context_type" text,
	"context_id" text,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"response_data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_user_key_uniq" UNIQUE("user_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "qr_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text DEFAULT 'payment' NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "qr_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "chat_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"reported_user_id" text NOT NULL,
	"message_id" text,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weather_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"widget_enabled" boolean DEFAULT true NOT NULL,
	"cities" text DEFAULT 'Muzaffarabad,Rawalakot,Mirpur,Bagh,Kotli,Neelum' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_time" text DEFAULT '09:00' NOT NULL,
	"close_time" text DEFAULT '21:00' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ab_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"variant" text NOT NULL,
	"converted" boolean DEFAULT false NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ab_experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"traffic_pct" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"event" text NOT NULL,
	"url" text NOT NULL,
	"status" integer,
	"request_body" jsonb,
	"response_body" text,
	"success" boolean DEFAULT false NOT NULL,
	"error" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deep_links" (
	"id" text PRIMARY KEY NOT NULL,
	"short_code" text NOT NULL,
	"target_screen" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deep_links_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "stock_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_subscriptions_user_product_uniq" UNIQUE("user_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "consent_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"consent_type" text NOT NULL,
	"consent_version" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms_versions" (
	"policy" text NOT NULL,
	"version" text NOT NULL,
	"effective_at" timestamp DEFAULT now() NOT NULL,
	"body_markdown" text,
	"changelog" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "terms_versions_policy_version_pk" PRIMARY KEY("policy","version")
);
--> statement-breakpoint
CREATE TABLE "release_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"release_date" text NOT NULL,
	"notes" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"features_json" text DEFAULT '[]' NOT NULL,
	"commission_rate" real DEFAULT 15 NOT NULL,
	"monthly_fee" real DEFAULT 0 NOT NULL,
	"max_products" integer DEFAULT 50 NOT NULL,
	"max_orders" integer DEFAULT 500 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "admin_role_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"permissions_json" text DEFAULT '[]' NOT NULL,
	"role" text DEFAULT 'manager' NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_role_presets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sms_gateways" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"account_sid" text,
	"auth_token" text,
	"from_number" text,
	"msg91_key" text,
	"sender_id" text,
	"api_key" text,
	"api_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whitelist_users" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"label" text,
	"bypass_code" text DEFAULT '000000' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whitelist_users_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "otp_bypass_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"user_id" text,
	"admin_id" text,
	"phone" varchar(20),
	"email" varchar(255),
	"bypass_reason" varchar(100),
	"expires_at" timestamp,
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_test_history" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"ok" boolean NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"error_detail" text,
	"admin_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "search_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"query" text NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_scan_results" (
	"id" text PRIMARY KEY NOT NULL,
	"scanned_at" timestamp DEFAULT now() NOT NULL,
	"duration_ms" integer NOT NULL,
	"total_findings" integer NOT NULL,
	"findings" jsonb NOT NULL,
	"triggered_by" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_action_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text,
	"admin_name" text,
	"ip" text DEFAULT 'unknown' NOT NULL,
	"action" text NOT NULL,
	"result" text DEFAULT 'success' NOT NULL,
	"details" text,
	"affected_user_id" text,
	"affected_user_name" text,
	"affected_user_role" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"first_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_vendor_id_users_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_users_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_rider_id_users_id_fk" FOREIGN KEY ("assigned_rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_dispatched_rider_id_users_id_fk" FOREIGN KEY ("dispatched_rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_bids" ADD CONSTRAINT "ride_bids_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_bids" ADD CONSTRAINT "ride_bids_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_locations" ADD CONSTRAINT "live_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_orders" ADD CONSTRAINT "pharmacy_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_orders" ADD CONSTRAINT "pharmacy_orders_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_bookings" ADD CONSTRAINT "parcel_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcel_bookings" ADD CONSTRAINT "parcel_bookings_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_addresses" ADD CONSTRAINT "saved_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_vendor_id_users_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_password_reset_tokens" ADD CONSTRAINT "admin_password_reset_tokens_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_password_reset_tokens" ADD CONSTRAINT "admin_password_reset_tokens_requester_admin_id_admin_accounts_id_fk" FOREIGN KEY ("requester_admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_password_hash_snapshots" ADD CONSTRAINT "admin_password_hash_snapshots_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendor_id_users_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_subscriptions" ADD CONSTRAINT "school_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_subscriptions" ADD CONSTRAINT "school_subscriptions_route_id_school_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."school_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_event_logs" ADD CONSTRAINT "ride_event_logs_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_event_logs" ADD CONSTRAINT "ride_event_logs_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_audit_log" ADD CONSTRAINT "auth_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_penalties" ADD CONSTRAINT "rider_penalties_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_ratings" ADD CONSTRAINT "ride_ratings_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_ratings" ADD CONSTRAINT "ride_ratings_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_ratings" ADD CONSTRAINT "ride_ratings_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_notified_riders" ADD CONSTRAINT "ride_notified_riders_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_notified_riders" ADD CONSTRAINT "ride_notified_riders_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_logs" ADD CONSTRAINT "location_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interactions" ADD CONSTRAINT "user_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interactions" ADD CONSTRAINT "user_interactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_profiles" ADD CONSTRAINT "rider_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_bookings" ADD CONSTRAINT "van_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_bookings" ADD CONSTRAINT "van_bookings_schedule_id_van_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."van_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_bookings" ADD CONSTRAINT "van_bookings_route_id_van_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."van_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_drivers" ADD CONSTRAINT "van_drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_schedules" ADD CONSTRAINT "van_schedules_route_id_van_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."van_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_schedules" ADD CONSTRAINT "van_schedules_vehicle_id_van_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."van_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_schedules" ADD CONSTRAINT "van_schedules_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "van_vehicles" ADD CONSTRAINT "van_vehicles_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_access_requests" ADD CONSTRAINT "delivery_access_requests_vendor_id_users_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_whitelist" ADD CONSTRAINT "delivery_whitelist_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_conditions" ADD CONSTRAINT "account_conditions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_participations" ADD CONSTRAINT "campaign_participations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_moderation_logs" ADD CONSTRAINT "ai_moderation_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_caller_id_users_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_callee_id_users_id_fk" FOREIGN KEY ("callee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_conversation_id_comm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."comm_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_comm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."comm_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_flags" ADD CONSTRAINT "communication_flags_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_requests" ADD CONSTRAINT "communication_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_requests" ADD CONSTRAINT "communication_requests_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_conversations" ADD CONSTRAINT "comm_conversations_participant1_id_users_id_fk" FOREIGN KEY ("participant1_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comm_conversations" ADD CONSTRAINT "comm_conversations_participant2_id_users_id_fk" FOREIGN KEY ("participant2_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ab_assignments" ADD CONSTRAINT "ab_assignments_experiment_id_ab_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."ab_experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_webhook_id_webhook_registrations_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhook_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_subscriptions" ADD CONSTRAINT "stock_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_subscriptions" ADD CONSTRAINT "stock_subscriptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_action_audit_log" ADD CONSTRAINT "admin_action_audit_log_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_action_audit_log" ADD CONSTRAINT "admin_action_audit_log_affected_user_id_users_id_fk" FOREIGN KEY ("affected_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_roles_idx" ON "users" USING btree ("roles");--> statement-breakpoint
CREATE INDEX "users_is_online_idx" ON "users" USING btree ("is_online");--> statement-breakpoint
CREATE INDEX "users_roles_is_online_idx" ON "users" USING btree ("roles","is_online");--> statement-breakpoint
CREATE INDEX "users_ajk_id_idx" ON "users" USING btree ("ajk_id");--> statement-breakpoint
CREATE INDEX "products_vendor_id_idx" ON "products" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "products_in_stock_idx" ON "products" USING btree ("in_stock");--> statement-breakpoint
CREATE INDEX "products_type_idx" ON "products" USING btree ("type");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_price_idx" ON "products" USING btree ("price");--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_rider_id_idx" ON "orders" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "orders_vendor_id_idx" ON "orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_assigned_rider_id_idx" ON "orders" USING btree ("assigned_rider_id");--> statement-breakpoint
CREATE INDEX "orders_status_rider_id_idx" ON "orders" USING btree ("status","rider_id");--> statement-breakpoint
CREATE INDEX "wallet_txn_user_id_idx" ON "wallet_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_txn_created_at_idx" ON "wallet_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wallet_txn_reference_idx" ON "wallet_transactions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "rides_user_id_idx" ON "rides" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rides_rider_id_idx" ON "rides" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "rides_status_idx" ON "rides" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rides_created_at_idx" ON "rides" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rides_status_rider_id_idx" ON "rides" USING btree ("status","rider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rides_one_active_per_user_uidx" ON "rides" USING btree ("user_id") WHERE status IN ('searching', 'bargaining', 'accepted', 'arrived', 'in_transit', 'dispatched', 'pending');--> statement-breakpoint
CREATE UNIQUE INDEX "ride_bids_ride_rider_uidx" ON "ride_bids" USING btree ("ride_id","rider_id");--> statement-breakpoint
CREATE INDEX "ride_bids_ride_id_idx" ON "ride_bids" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ride_bids_rider_id_idx" ON "ride_bids" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "ride_bids_status_idx" ON "ride_bids" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ride_bids_expires_at_idx" ON "ride_bids" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "live_locations_role_idx" ON "live_locations" USING btree ("role");--> statement-breakpoint
CREATE INDEX "live_locations_lat_lng_idx" ON "live_locations" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "live_locations_role_updated_idx" ON "live_locations" USING btree ("role","updated_at");--> statement-breakpoint
CREATE INDEX "pharmacy_orders_user_id_idx" ON "pharmacy_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pharmacy_orders_rider_id_idx" ON "pharmacy_orders" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "pharmacy_orders_status_idx" ON "pharmacy_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pharmacy_orders_created_at_idx" ON "pharmacy_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "parcel_bookings_user_id_idx" ON "parcel_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "parcel_bookings_rider_id_idx" ON "parcel_bookings" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "parcel_bookings_status_idx" ON "parcel_bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "parcel_bookings_created_at_idx" ON "parcel_bookings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_sos_status_idx" ON "notifications" USING btree ("sos_status");--> statement-breakpoint
CREATE INDEX "saved_addresses_user_id_idx" ON "saved_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "flash_deals_product_id_idx" ON "flash_deals" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "flash_deals_is_active_idx" ON "flash_deals" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "flash_deals_end_time_idx" ON "flash_deals" USING btree ("end_time");--> statement-breakpoint
CREATE INDEX "promo_codes_vendor_id_idx" ON "promo_codes" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "promo_codes_is_active_idx" ON "promo_codes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "promo_codes_expires_at_idx" ON "promo_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "admin_password_reset_tokens_admin_idx" ON "admin_password_reset_tokens" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_password_reset_tokens_expires_idx" ON "admin_password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "rbac_admin_role_assignments_admin_idx" ON "rbac_admin_role_assignments" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "rbac_role_permissions_role_idx" ON "rbac_role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "rbac_user_role_assignments_user_idx" ON "rbac_user_role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_user_uidx" ON "reviews" USING btree ("order_id","user_id");--> statement-breakpoint
CREATE INDEX "reviews_order_id_idx" ON "reviews" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "reviews_user_id_idx" ON "reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reviews_vendor_id_idx" ON "reviews" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "reviews_rider_id_idx" ON "reviews" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "reviews_product_id_idx" ON "reviews" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_subs_user_route_uidx" ON "school_subscriptions" USING btree ("user_id","route_id") WHERE status != 'cancelled';--> statement-breakpoint
CREATE INDEX "school_subs_user_id_idx" ON "school_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "school_subs_route_id_idx" ON "school_subscriptions" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "school_subs_status_idx" ON "school_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ride_event_logs_ride_id_idx" ON "ride_event_logs" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ride_event_logs_rider_id_idx" ON "ride_event_logs" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "rider_penalties_rider_id_idx" ON "rider_penalties" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "rider_penalties_type_idx" ON "rider_penalties" USING btree ("type");--> statement-breakpoint
CREATE INDEX "rider_penalties_created_at_idx" ON "rider_penalties" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_ratings_ride_id_uidx" ON "ride_ratings" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ride_ratings_rider_id_idx" ON "ride_ratings" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "ride_ratings_customer_id_idx" ON "ride_ratings" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_notified_riders_ride_rider_uidx" ON "ride_notified_riders" USING btree ("ride_id","rider_id");--> statement-breakpoint
CREATE INDEX "ride_notified_riders_ride_id_idx" ON "ride_notified_riders" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "location_logs_user_ts_idx" ON "location_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "location_logs_user_idx" ON "location_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "location_logs_role_idx" ON "location_logs" USING btree ("role");--> statement-breakpoint
CREATE INDEX "location_logs_role_ts_idx" ON "location_logs" USING btree ("role","created_at");--> statement-breakpoint
CREATE INDEX "location_logs_lat_lng_idx" ON "location_logs" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variants_type_idx" ON "product_variants" USING btree ("type");--> statement-breakpoint
CREATE INDEX "product_variants_sku_idx" ON "product_variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "banners_is_active_idx" ON "banners" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "banners_placement_idx" ON "banners" USING btree ("placement");--> statement-breakpoint
CREATE INDEX "banners_sort_order_idx" ON "banners" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "user_interactions_user_id_idx" ON "user_interactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_interactions_product_id_idx" ON "user_interactions" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "user_interactions_type_idx" ON "user_interactions" USING btree ("interaction_type");--> statement-breakpoint
CREATE INDEX "user_interactions_created_at_idx" ON "user_interactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "push_sub_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_sub_role_idx" ON "push_subscriptions" USING btree ("role");--> statement-breakpoint
CREATE INDEX "push_sub_type_idx" ON "push_subscriptions" USING btree ("token_type");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_history_user_id_idx" ON "login_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "van_bookings_user_id_idx" ON "van_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "van_bookings_schedule_id_idx" ON "van_bookings" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "van_bookings_travel_date_idx" ON "van_bookings" USING btree ("travel_date");--> statement-breakpoint
CREATE INDEX "van_bookings_status_idx" ON "van_bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "van_drivers_user_id_idx" ON "van_drivers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "van_drivers_van_code_idx" ON "van_drivers" USING btree ("van_code");--> statement-breakpoint
CREATE INDEX "van_routes_is_active_idx" ON "van_routes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "van_schedules_route_id_idx" ON "van_schedules" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "van_schedules_vehicle_id_idx" ON "van_schedules" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "van_schedules_driver_id_idx" ON "van_schedules" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "van_vehicles_driver_id_idx" ON "van_vehicles" USING btree ("driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_user_product_uidx" ON "wishlist" USING btree ("user_id","product_id");--> statement-breakpoint
CREATE INDEX "wishlist_user_id_idx" ON "wishlist" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "service_zones_is_active_idx" ON "service_zones" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "service_zones_city_idx" ON "service_zones" USING btree ("city");--> statement-breakpoint
CREATE INDEX "categories_type_idx" ON "categories" USING btree ("type");--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "categories_sort_order_idx" ON "categories" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "categories_is_active_idx" ON "categories" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "location_history_user_id_idx" ON "location_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "location_history_created_at_idx" ON "location_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "location_history_user_created_idx" ON "location_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "delivery_access_requests_vendor_idx" ON "delivery_access_requests" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "delivery_access_requests_status_idx" ON "delivery_access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "delivery_whitelist_type_target_service_idx" ON "delivery_whitelist" USING btree ("type","target_id","service_type");--> statement-breakpoint
CREATE INDEX "delivery_whitelist_type_status_idx" ON "delivery_whitelist" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "ac_u_idx" ON "account_conditions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ac_t_idx" ON "account_conditions" USING btree ("condition_type");--> statement-breakpoint
CREATE INDEX "popup_campaigns_status_idx" ON "popup_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "popup_campaigns_priority_idx" ON "popup_campaigns" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "popup_campaigns_start_date_idx" ON "popup_campaigns" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "popup_campaigns_end_date_idx" ON "popup_campaigns" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "popup_impressions_popup_id_idx" ON "popup_impressions" USING btree ("popup_id");--> statement-breakpoint
CREATE INDEX "popup_impressions_user_id_idx" ON "popup_impressions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "popup_impressions_popup_user_idx" ON "popup_impressions" USING btree ("popup_id","user_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaigns_start_date_idx" ON "campaigns" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "campaigns_end_date_idx" ON "campaigns" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "campaigns_priority_idx" ON "campaigns" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "campaign_participations_campaign_id_idx" ON "campaign_participations" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_participations_vendor_id_idx" ON "campaign_participations" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "offer_redemptions_offer_id_idx" ON "offer_redemptions" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "offer_redemptions_user_id_idx" ON "offer_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "offer_redemptions_order_id_idx" ON "offer_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "offer_redemptions_created_at_idx" ON "offer_redemptions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "offers_campaign_id_idx" ON "offers" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "offers_status_idx" ON "offers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "offers_type_idx" ON "offers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "offers_code_idx" ON "offers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "offers_start_date_idx" ON "offers" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "offers_end_date_idx" ON "offers" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "offers_applies_to_idx" ON "offers" USING btree ("applies_to");--> statement-breakpoint
CREATE INDEX "offers_vendor_id_idx" ON "offers" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "ai_log_user_idx" ON "ai_moderation_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_log_type_idx" ON "ai_moderation_logs" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "ai_log_created_idx" ON "ai_moderation_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "call_caller_idx" ON "call_logs" USING btree ("caller_id");--> statement-breakpoint
CREATE INDEX "call_callee_idx" ON "call_logs" USING btree ("callee_id");--> statement-breakpoint
CREATE INDEX "call_status_idx" ON "call_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "call_started_idx" ON "call_logs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "msg_conv_idx" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "msg_sender_idx" ON "chat_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "msg_created_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "msg_delivery_idx" ON "chat_messages" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "flag_msg_idx" ON "communication_flags" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "flag_resolved_idx" ON "communication_flags" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "comm_req_sender_idx" ON "communication_requests" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "comm_req_receiver_idx" ON "communication_requests" USING btree ("receiver_id");--> statement-breakpoint
CREATE INDEX "comm_req_status_idx" ON "communication_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conv_p1_idx" ON "comm_conversations" USING btree ("participant1_id");--> statement-breakpoint
CREATE INDEX "conv_p2_idx" ON "comm_conversations" USING btree ("participant2_id");--> statement-breakpoint
CREATE INDEX "conv_status_idx" ON "comm_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conv_last_msg_idx" ON "comm_conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "qr_codes_type_idx" ON "qr_codes" USING btree ("type");--> statement-breakpoint
CREATE INDEX "qr_codes_is_active_idx" ON "qr_codes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "qr_codes_code_idx" ON "qr_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "chat_reports_reporter_idx" ON "chat_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "chat_reports_reported_idx" ON "chat_reports" USING btree ("reported_user_id");--> statement-breakpoint
CREATE INDEX "chat_reports_status_idx" ON "chat_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_schedules_vendor_day_idx" ON "vendor_schedules" USING btree ("vendor_id","day_of_week");--> statement-breakpoint
CREATE INDEX "ab_assignments_experiment_idx" ON "ab_assignments" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "ab_assignments_user_idx" ON "ab_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ab_assignments_variant_idx" ON "ab_assignments" USING btree ("variant");--> statement-breakpoint
CREATE UNIQUE INDEX "ab_assignments_exp_user_unique" ON "ab_assignments" USING btree ("experiment_id","user_id");--> statement-breakpoint
CREATE INDEX "ab_experiments_status_idx" ON "ab_experiments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_logs_webhook_idx" ON "webhook_logs" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "webhook_logs_event_idx" ON "webhook_logs" USING btree ("event");--> statement-breakpoint
CREATE INDEX "webhook_logs_created_idx" ON "webhook_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "webhook_registrations_active_idx" ON "webhook_registrations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "deep_links_short_code_idx" ON "deep_links" USING btree ("short_code");--> statement-breakpoint
CREATE INDEX "deep_links_target_idx" ON "deep_links" USING btree ("target_screen");--> statement-breakpoint
CREATE INDEX "stock_subscriptions_user_id_idx" ON "stock_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_subscriptions_product_id_idx" ON "stock_subscriptions" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "terms_versions_policy_effective_idx" ON "terms_versions" USING btree ("policy","effective_at");--> statement-breakpoint
CREATE INDEX "integration_test_history_type_idx" ON "integration_test_history" USING btree ("type");--> statement-breakpoint
CREATE INDEX "integration_test_history_created_at_idx" ON "integration_test_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "search_logs_result_count_created_at_idx" ON "search_logs" USING btree ("result_count","created_at");--> statement-breakpoint
CREATE INDEX "search_logs_query_idx" ON "search_logs" USING btree ("query");--> statement-breakpoint
CREATE INDEX "search_logs_created_at_idx" ON "search_logs" USING btree ("created_at");