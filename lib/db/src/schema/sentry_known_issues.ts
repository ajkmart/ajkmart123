import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const sentryKnownIssuesTable = pgTable("sentry_known_issues", {
  fingerprint: text("fingerprint").primaryKey(),
  title: text("title").notNull(),
  sentryId: text("sentry_id"),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});

export type SentryKnownIssue = typeof sentryKnownIssuesTable.$inferSelect;
