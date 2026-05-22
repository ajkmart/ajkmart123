import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const webhookRegistrationsTable = pgTable(
  "webhook_registrations",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    events: jsonb("events").notNull().default([]),
    secret: text("secret"),
    isActive: boolean("is_active").notNull().default(true),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("webhook_registrations_active_idx").on(t.isActive)]
);

export const webhookLogsTable = pgTable(
  "webhook_logs",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhookRegistrationsTable.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    url: text("url").notNull(),
    status: integer("status"),
    requestBody: jsonb("request_body"),
    responseBody: text("response_body"),
    success: boolean("success").notNull().default(false),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("webhook_logs_webhook_idx").on(t.webhookId),
    index("webhook_logs_event_idx").on(t.event),
    index("webhook_logs_created_idx").on(t.createdAt),
  ]
);

export type WebhookRegistration = typeof webhookRegistrationsTable.$inferSelect;
export type WebhookLog = typeof webhookLogsTable.$inferSelect;
