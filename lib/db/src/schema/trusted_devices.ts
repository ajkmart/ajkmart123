import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const trustedDevicesTable = pgTable(
  "trusted_devices",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    deviceName: text("device_name"),
    deviceType: text("device_type"),
    fingerprint: text("fingerprint"),
    trustedAt: timestamp("trusted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    isRevoked: boolean("is_revoked").notNull().default(false),
  },
  (t) => [
    index("trusted_devices_user_id_idx").on(t.userId),
    index("trusted_devices_device_id_idx").on(t.deviceId),
    index("trusted_devices_expires_at_idx").on(t.expiresAt),
  ]
);

export type TrustedDevice = typeof trustedDevicesTable.$inferSelect;
export type NewTrustedDevice = typeof trustedDevicesTable.$inferInsert;
