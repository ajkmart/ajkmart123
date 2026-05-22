import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimitsTable = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  windowStart: timestamp("window_start").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type RateLimit = typeof rateLimitsTable.$inferSelect;
