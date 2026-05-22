import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { usersTable } from "./users";

export const orderAuditLogTable = pgTable(
  "order_audit_log",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    note: text("note"),
    changedAt: timestamp("changed_at").notNull().defaultNow(),
  },
  (t) => [
    index("order_audit_log_order_id_idx").on(t.orderId),
    index("order_audit_log_vendor_id_idx").on(t.vendorId),
    index("order_audit_log_changed_at_idx").on(t.changedAt),
  ]
);

export type OrderAuditLog = typeof orderAuditLogTable.$inferSelect;
