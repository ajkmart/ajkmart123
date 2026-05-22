import { db } from "@workspace/db";
import { ordersTable, usersTable } from "@workspace/db/schema";
import { and, gte, isNull, sql, sum } from "drizzle-orm";
import { Router } from "express";
import { logger } from "../../lib/logger.js";
import { sendError, sendSuccess } from "../../lib/response.js";

const router = Router();

/**
 * GET /admin/analytics
 *
 * Unified analytics endpoint.
 *
 * metric=orders  → daily order counts for the selected period
 * metric=revenue_by_category → all-time revenue split by service category
 * metric=user_growth → daily new-user count for the selected period
 * (no metric param) → returns all three in a single payload
 *
 * Query params:
 *   period  – "7d" | "30d" | "90d" | "1y"  (default "30d")
 *   metric  – "orders" | "revenue_by_category" | "user_growth"
 */
router.get("/analytics", async (req, res) => {
  try {
    const periodParam = String(req.query.period ?? "30d");
    const metric = req.query.metric as string | undefined;

    const days =
      periodParam === "7d" ? 7 : periodParam === "90d" ? 90 : periodParam === "1y" ? 365 : 30;

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const wantOrders = !metric || metric === "orders";
    const wantRevenue = !metric || metric === "revenue_by_category";
    const wantGrowth = !metric || metric === "user_growth";

    const [orderRows, _pharmOrderRows, revenueRows, growthRows] = await Promise.all([
      /* Orders over time (non-pharmacy) */
      wantOrders
        ? db
            .select({
              date: sql<string>`DATE(${ordersTable.createdAt})`.as("date"),
              count: sql<number>`count(*)::int`.as("count"),
            })
            .from(ordersTable)
            .where(
              and(
                gte(ordersTable.createdAt, since),
                isNull(ordersTable.deletedAt),
                sql`${ordersTable.status} NOT IN ('cancelled','refunded')`
              )
            )
            .groupBy(sql`DATE(${ordersTable.createdAt})`)
            .orderBy(sql`DATE(${ordersTable.createdAt})`)
        : Promise.resolve([]),

      /* Revenue by category — all-time totals */
      wantRevenue
        ? db
            .select({
              type: ordersTable.type,
              total: sum(ordersTable.total),
            })
            .from(ordersTable)
            .where(
              and(
                isNull(ordersTable.deletedAt),
                sql`${ordersTable.status} NOT IN ('cancelled','refunded')`
              )
            )
            .groupBy(ordersTable.type)
        : Promise.resolve([] as Array<{ type: string | null; total: string | null }>),

      /* Pharmacy needs a separate label */
      Promise.resolve([] as Array<{ type: string | null; total: string | null }>),

      /* User growth over time */
      wantGrowth
        ? db
            .select({
              date: sql<string>`DATE(${usersTable.createdAt})`.as("date"),
              newUsers: sql<number>`count(*)::int`.as("newUsers"),
            })
            .from(usersTable)
            .where(and(gte(usersTable.createdAt, since), isNull(usersTable.deletedAt)))
            .groupBy(sql`DATE(${usersTable.createdAt})`)
            .orderBy(sql`DATE(${usersTable.createdAt})`)
        : Promise.resolve([]),
    ]);

    /* Build a full daily skeleton for orders so there are no gaps */
    const ordersMap = new Map<string, number>();
    for (const row of orderRows) {
      ordersMap.set(row.date, row.count);
    }

    const growthMap = new Map<string, number>();
    for (const row of growthRows) {
      growthMap.set(row.date, row.newUsers);
    }

    const dateRange: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dateRange.push(d.toISOString().slice(0, 10));
    }

    const orders = dateRange.map((date) => ({
      date,
      count: ordersMap.get(date) ?? 0,
    }));

    const userGrowth = dateRange.map((date) => ({
      date,
      newUsers: growthMap.get(date) ?? 0,
    }));

    /* Revenue by category — human-readable labels */
    const CATEGORY_LABELS: Record<string, string> = {
      mart: "Mart",
      grocery: "Grocery",
      food: "Food",
      restaurant: "Food",
      pharmacy: "Pharmacy",
      parcel: "Parcel",
      ride: "Rides",
      rides: "Rides",
    };

    const revenueByCategoryRaw: Record<string, number> = {};
    for (const row of revenueRows) {
      const label =
        CATEGORY_LABELS[String(row.type ?? "").toLowerCase()] ?? String(row.type ?? "Other");
      revenueByCategoryRaw[label] =
        (revenueByCategoryRaw[label] ?? 0) + parseFloat(String(row.total ?? "0"));
    }
    const revenue = Object.entries(revenueByCategoryRaw).map(([category, amount]) => ({
      category,
      amount: parseFloat(amount.toFixed(2)),
    }));

    sendSuccess(res, { orders, revenue, userGrowth, period: periodParam, days });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "[analytics] query failed"
    );
    sendError(res, "Failed to fetch analytics", 500);
  }
});

export default router;
