import { db } from "@workspace/db";
import { ordersTable, ridesTable, usersTable, vendorProfilesTable } from "@workspace/db/schema";
import { and, count, desc, eq, gte, isNull, sql, sum } from "drizzle-orm";
import { Router } from "express";
import { logger } from "../../lib/logger.js";
import { sendError, sendSuccess } from "../../lib/response.js";

const router = Router();

/**
 * GET /admin/revenue-analytics
 * Returns 12-month stacked revenue breakdown + category totals + top vendors.
 * Used by the Revenue Analytics page in the admin dashboard.
 */
router.get("/revenue-analytics", async (_req, res) => {
  try {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const [
      monthlyOrderRows,
      monthlyPharmacyRows,
      monthlyRideRows,
      allTimeOrders,
      allTimePharmacy,
      allTimeRides,
      topVendorRows,
    ] = await Promise.all([
      /* Monthly mart/food orders (all types except pharmacy) */
      db
        .select({
          month: sql<string>`to_char(${ordersTable.createdAt}, 'YYYY-MM')`.as("month"),
          total: sum(ordersTable.total),
        })
        .from(ordersTable)
        .where(
          and(
            gte(ordersTable.createdAt, twelveMonthsAgo),
            isNull(ordersTable.deletedAt),
            sql`${ordersTable.status} NOT IN ('cancelled', 'refunded')`,
            sql`${ordersTable.type} != 'pharmacy'`
          )
        )
        .groupBy(sql`to_char(${ordersTable.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${ordersTable.createdAt}, 'YYYY-MM')`),

      /* Monthly pharmacy orders */
      db
        .select({
          month: sql<string>`to_char(${ordersTable.createdAt}, 'YYYY-MM')`.as("month"),
          total: sum(ordersTable.total),
        })
        .from(ordersTable)
        .where(
          and(
            gte(ordersTable.createdAt, twelveMonthsAgo),
            isNull(ordersTable.deletedAt),
            sql`${ordersTable.status} NOT IN ('cancelled', 'refunded')`,
            eq(ordersTable.type, "pharmacy")
          )
        )
        .groupBy(sql`to_char(${ordersTable.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${ordersTable.createdAt}, 'YYYY-MM')`),

      /* Monthly rides revenue */
      db
        .select({
          month: sql<string>`to_char(${ridesTable.createdAt}, 'YYYY-MM')`.as("month"),
          total: sum(ridesTable.fare),
        })
        .from(ridesTable)
        .where(and(gte(ridesTable.createdAt, twelveMonthsAgo), eq(ridesTable.status, "completed")))
        .groupBy(sql`to_char(${ridesTable.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${ridesTable.createdAt}, 'YYYY-MM')`),

      /* All-time order totals (non-pharmacy) */
      db
        .select({ total: sum(ordersTable.total) })
        .from(ordersTable)
        .where(
          and(
            isNull(ordersTable.deletedAt),
            sql`${ordersTable.status} NOT IN ('cancelled', 'refunded')`,
            sql`${ordersTable.type} != 'pharmacy'`
          )
        ),

      /* All-time pharmacy totals */
      db
        .select({ total: sum(ordersTable.total) })
        .from(ordersTable)
        .where(
          and(
            isNull(ordersTable.deletedAt),
            sql`${ordersTable.status} NOT IN ('cancelled', 'refunded')`,
            eq(ordersTable.type, "pharmacy")
          )
        ),

      /* All-time rides revenue */
      db
        .select({ total: sum(ridesTable.fare) })
        .from(ridesTable)
        .where(eq(ridesTable.status, "completed")),

      /* Top 10 vendors by total order revenue */
      db
        .select({
          id: usersTable.id,
          phone: usersTable.phone,
          name: vendorProfilesTable.storeName,
          orderCount: count(),
          totalRevenue: sum(ordersTable.total),
        })
        .from(ordersTable)
        .innerJoin(usersTable, eq(ordersTable.vendorId, usersTable.id))
        .leftJoin(vendorProfilesTable, eq(vendorProfilesTable.userId, usersTable.id))
        .where(
          and(
            isNull(ordersTable.deletedAt),
            sql`${ordersTable.status} NOT IN ('cancelled', 'refunded')`,
            isNull(usersTable.deletedAt)
          )
        )
        .groupBy(usersTable.id, usersTable.phone, vendorProfilesTable.storeName)
        .orderBy(desc(sum(ordersTable.total)))
        .limit(10),
    ]);

    /* Build a full 12-month skeleton so the chart always has all bars */
    const monthMap = new Map<string, { orders: number; rides: number; pharmacy: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, { orders: 0, rides: 0, pharmacy: 0 });
    }

    for (const row of monthlyOrderRows) {
      const entry = monthMap.get(row.month);
      if (entry) entry.orders = parseFloat(String(row.total ?? "0"));
    }
    for (const row of monthlyPharmacyRows) {
      const entry = monthMap.get(row.month);
      if (entry) entry.pharmacy = parseFloat(String(row.total ?? "0"));
    }
    for (const row of monthlyRideRows) {
      const entry = monthMap.get(row.month);
      if (entry) entry.rides = parseFloat(String(row.total ?? "0"));
    }

    const monthly = Array.from(monthMap.entries()).map(([month, v]) => ({
      month,
      orders: v.orders,
      rides: v.rides,
      pharmacy: v.pharmacy,
      total: v.orders + v.rides + v.pharmacy,
    }));

    const ordersTotal = parseFloat(String(allTimeOrders[0]?.total ?? "0"));
    const ridesTotal = parseFloat(String(allTimeRides[0]?.total ?? "0"));
    const pharmacyTotal = parseFloat(String(allTimePharmacy[0]?.total ?? "0"));

    const categoryTotals = {
      orders: ordersTotal,
      rides: ridesTotal,
      pharmacy: pharmacyTotal,
      total: ordersTotal + ridesTotal + pharmacyTotal,
    };

    const topVendors = topVendorRows.map((v) => ({
      id: v.id,
      name: v.name ?? null,
      phone: v.phone,
      orderCount: Number(v.orderCount),
      totalRevenue: parseFloat(String(v.totalRevenue ?? "0")),
    }));

    sendSuccess(res, { monthly, categoryTotals, topVendors });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "[revenue-analytics] query failed"
    );
    sendError(res, "Failed to fetch revenue analytics", 500);
  }
});

export default router;
