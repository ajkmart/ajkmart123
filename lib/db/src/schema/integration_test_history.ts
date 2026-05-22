import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/* History of integration tests run from Admin → Settings → Integrations.
 * Each row records ONE test attempt (success or failure) for a given
 * integration type so the panel can show last-run status, latency,
 * timestamp and the most recent N runs across page reloads. */
export const integrationTestHistoryTable = pgTable(
  "integration_test_history",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(), // e.g. "email", "sms", "whatsapp", "fcm", "maps", "jazzcash", "easypaisa"
    ok: boolean("ok").notNull(),
    latencyMs: integer("latency_ms").notNull().default(0),
    message: text("message").notNull().default(""),
    errorDetail: text("error_detail"),
    adminId: text("admin_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("integration_test_history_type_idx").on(t.type),
    index("integration_test_history_created_at_idx").on(t.createdAt),
  ]
);

export type IntegrationTestHistory = typeof integrationTestHistoryTable.$inferSelect;
