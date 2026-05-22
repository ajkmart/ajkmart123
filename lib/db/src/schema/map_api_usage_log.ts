import { date, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const mapApiUsageLogTable = pgTable(
  "map_api_usage_log",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    endpointType: text("endpoint_type").notNull(),
    count: integer("count").notNull().default(0),
    date: date("date").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("map_api_usage_log_unique").on(t.provider, t.endpointType, t.date)]
);

export type MapApiUsageLog = typeof mapApiUsageLogTable.$inferSelect;
