import { db } from "@workspace/db";
import { productsTable, wishlistTable } from "@workspace/db/schema";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import { Router } from "express";
import { sendError, sendSuccess } from "../../lib/response.js";

const router = Router();

/* ── GET /wishlist-analytics — top products by wishlist count ── */
router.get("/wishlist-analytics", async (_req, res) => {
  try {
    const results = await db
      .select({
        productId: wishlistTable.productId,
        wishlistCount: count(),
        productName: productsTable.name,
        productImage: productsTable.image,
        productCategory: productsTable.category,
        productPrice: productsTable.price,
        productInStock: productsTable.inStock,
        vendorName: productsTable.vendorName,
      })
      .from(wishlistTable)
      .innerJoin(productsTable, eq(wishlistTable.productId, productsTable.id))
      .groupBy(
        wishlistTable.productId,
        productsTable.name,
        productsTable.image,
        productsTable.category,
        productsTable.price,
        productsTable.inStock,
        productsTable.vendorName
      )
      .orderBy(desc(count()));

    sendSuccess(res, { products: results });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /wishlist-analytics/timeline?days=30 ──
   Returns daily wishlist addition counts for the past N days.
   Used for the "Wishlist Additions Over Time" line chart.
─────────────────────────────────────────────────────────── */
router.get("/wishlist-analytics/timeline", async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await db
      .select({
        date: sql<string>`DATE(${wishlistTable.createdAt})`.as("date"),
        total: count(),
      })
      .from(wishlistTable)
      .where(gte(wishlistTable.createdAt, since))
      .groupBy(sql`DATE(${wishlistTable.createdAt})`)
      .orderBy(sql`DATE(${wishlistTable.createdAt})`);

    sendSuccess(res, { timeline: rows, days });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

export default router;
