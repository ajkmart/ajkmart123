import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const deliveryWhitelistTable = pgTable(
  "delivery_whitelist",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    targetId: text("target_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    serviceType: text("service_type").notNull().default("all"),
    status: text("status").notNull().default("active"),
    validUntil: timestamp("valid_until"),
    deliveryLabel: text("delivery_label"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("delivery_whitelist_type_target_service_idx").on(t.type, t.targetId, t.serviceType),
    index("delivery_whitelist_type_status_idx").on(t.type, t.status),
  ]
);

export type DeliveryWhitelist = typeof deliveryWhitelistTable.$inferSelect;

export const deliveryAccessRequestsTable = pgTable(
  "delivery_access_requests",
  {
    id: text("id").primaryKey(),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    serviceType: text("service_type").notNull().default("all"),
    status: text("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: text("resolved_by"),
    notes: text("notes"),
  },
  (t) => [
    index("delivery_access_requests_vendor_idx").on(t.vendorId),
    index("delivery_access_requests_status_idx").on(t.status),
  ]
);

export type DeliveryAccessRequest = typeof deliveryAccessRequestsTable.$inferSelect;

export const systemAuditLogTable = pgTable("system_audit_log", {
  id: text("id").primaryKey(),
  adminId: text("admin_id"),
  adminName: text("admin_name"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SystemAuditLog = typeof systemAuditLogTable.$inferSelect;
