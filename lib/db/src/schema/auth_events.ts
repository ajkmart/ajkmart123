import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const authEventsTable = pgTable(
  "auth_events",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    channel: text("channel"),
    role: text("role"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    deviceId: text("device_id"),
    country: text("country"),
    city: text("city"),
    success: boolean("success").notNull().default(true),
    failureReason: text("failure_reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("auth_events_user_id_idx").on(t.userId),
    index("auth_events_event_type_idx").on(t.eventType),
    index("auth_events_created_at_idx").on(t.createdAt),
    index("auth_events_ip_created_at_idx").on(t.ip, t.createdAt),
  ]
);

export type AuthEvent = typeof authEventsTable.$inferSelect;
export type NewAuthEvent = typeof authEventsTable.$inferInsert;
