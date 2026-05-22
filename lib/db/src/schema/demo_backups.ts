import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const demoBackupsTable = pgTable("demo_backups", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  tablesJson: text("tables_json").notNull(),
  rowsTotal: integer("rows_total").notNull().default(0),
  sizeKb: integer("size_kb").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DemoBackup = typeof demoBackupsTable.$inferSelect;
