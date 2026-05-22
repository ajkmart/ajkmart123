import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const fileScanResultsTable = pgTable("file_scan_results", {
  id: text("id").primaryKey(),
  scannedAt: timestamp("scanned_at").defaultNow().notNull(),
  durationMs: integer("duration_ms").notNull(),
  totalFindings: integer("total_findings").notNull(),
  findings: jsonb("findings").notNull(),
  triggeredBy: text("triggered_by").default("manual").notNull(),
});

export type FileScanResult = typeof fileScanResultsTable.$inferSelect;
