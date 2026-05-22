import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const popupImpressionsTable = pgTable(
  "popup_impressions",
  {
    id: text("id").primaryKey(),
    popupId: text("popup_id").notNull(),
    userId: text("user_id").notNull(),
    action: text("action").notNull().default("view"),
    seenAt: timestamp("seen_at").notNull().defaultNow(),
    sessionId: text("session_id"),
  },
  (t) => [
    index("popup_impressions_popup_id_idx").on(t.popupId),
    index("popup_impressions_user_id_idx").on(t.userId),
    index("popup_impressions_popup_user_idx").on(t.popupId, t.userId),
  ]
);

export type PopupImpression = typeof popupImpressionsTable.$inferSelect;
