import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const systemSnapshotsTable = pgTable("system_snapshots", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  actionId: text("action_id").notNull(),
  tablesJson: text("tables_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type SystemSnapshot = typeof systemSnapshotsTable.$inferSelect;
