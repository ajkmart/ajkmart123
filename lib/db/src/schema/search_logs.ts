import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const searchLogsTable = pgTable(
  "search_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    query: text("query").notNull(),
    resultCount: integer("result_count").notNull().default(0),
    userId: text("user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("search_logs_result_count_created_at_idx").on(t.resultCount, t.createdAt),
    index("search_logs_query_idx").on(t.query),
    index("search_logs_created_at_idx").on(t.createdAt),
  ]
);

export type SearchLog = typeof searchLogsTable.$inferSelect;
