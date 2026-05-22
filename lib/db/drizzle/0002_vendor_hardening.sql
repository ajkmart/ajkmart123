CREATE TABLE IF NOT EXISTS "order_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
	"vendor_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"note" text,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_audit_log_order_id_idx" ON "order_audit_log" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_audit_log_vendor_id_idx" ON "order_audit_log" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_audit_log_changed_at_idx" ON "order_audit_log" USING btree ("changed_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "product_stock_history" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
	"vendor_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"previous_stock" integer,
	"new_stock" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_stock_history_product_id_idx" ON "product_stock_history" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_stock_history_vendor_id_idx" ON "product_stock_history" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_stock_history_changed_at_idx" ON "product_stock_history" USING btree ("changed_at");--> statement-breakpoint

ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock" >= 0 OR "stock" IS NULL);
