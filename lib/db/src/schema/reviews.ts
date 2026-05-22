import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const reviewsTable = pgTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id").references(() => usersTable.id, { onDelete: "set null" }),
    riderId: text("rider_id").references(() => usersTable.id, { onDelete: "set null" }),
    orderType: text("order_type").notNull(),
    rating: integer("rating").notNull(),
    riderRating: integer("rider_rating"),
    comment: text("comment"),
    photos: text("photos").array(),
    productId: text("product_id"),
    hidden: boolean("hidden").notNull().default(false),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by"),
    status: text("status").notNull().default("visible"),
    moderationNote: text("moderation_note"),
    vendorReply: text("vendor_reply"),
    vendorRepliedAt: timestamp("vendor_replied_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reviews_order_user_uidx").on(t.orderId, t.userId),
    index("reviews_user_id_idx").on(t.userId),
    index("reviews_vendor_id_idx").on(t.vendorId),
    index("reviews_rider_id_idx").on(t.riderId),
    index("reviews_product_id_idx").on(t.productId),
    check("reviews_rating_range", sql`${t.rating}       BETWEEN 1 AND 5`),
    check(
      "reviews_rider_rating_range",
      sql`${t.riderRating}  IS NULL OR ${t.riderRating} BETWEEN 1 AND 5`
    ),
  ]
);

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({ createdAt: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviewsTable.$inferSelect;
