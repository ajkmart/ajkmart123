import { db } from "@workspace/db";
import {
  ordersTable,
  productsTable,
  ridesTable,
  usersTable,
  vendorProfilesTable,
} from "@workspace/db/schema";
import { and, count, eq, gte, isNull, sql, sum } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { getDiskPct, getMemoryPct, getP95Ms, getSampleCount } from "../lib/metrics/responseTime.js";
import { sendInternalError, sendSuccess } from "../lib/response.js";
import { adminAuth } from "./admin-shared.js";

const router: IRouter = Router();

router.get("/public", async (_req, res) => {
  try {
    const [[products], [vendors]] = await Promise.all([
      db.select({ c: count() }).from(productsTable).where(eq(productsTable.inStock, true)),
      db
        .select({ c: count() })
        .from(vendorProfilesTable)
        .where(eq(vendorProfilesTable.storeIsOpen, true)),
    ]);
    sendSuccess(res, {
      productCount: products?.c ?? 0,
      restaurantCount: vendors?.c ?? 0,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendInternalError(res, "Failed to fetch stats");
  }
});

router.get("/", adminAuth, async (_req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const [
      totalRevenueRow,
      todayRevenueRow,
      orderStatusRows,
      ridesCountRow,
      newUsersWeekRow,
      newUsersTodayRow,
      activeVendorsRow,
    ] = await Promise.all([
      db
        .select({ total: sum(ordersTable.total) })
        .from(ordersTable)
        .where(
          and(
            sql`${ordersTable.status} NOT IN ('cancelled', 'refunded')`,
            isNull(ordersTable.deletedAt)
          )
        ),
      db
        .select({ total: sum(ordersTable.total) })
        .from(ordersTable)
        .where(
          and(
            gte(ordersTable.createdAt, todayStart),
            sql`${ordersTable.status} NOT IN ('cancelled', 'refunded')`,
            isNull(ordersTable.deletedAt)
          )
        ),
      db
        .select({ status: ordersTable.status, c: count() })
        .from(ordersTable)
        .where(isNull(ordersTable.deletedAt))
        .groupBy(ordersTable.status),
      db.select({ c: count() }).from(ridesTable).where(eq(ridesTable.status, "completed")),
      db
        .select({ c: count() })
        .from(usersTable)
        .where(and(gte(usersTable.createdAt, weekStart), isNull(usersTable.deletedAt))),
      db
        .select({ c: count() })
        .from(usersTable)
        .where(and(gte(usersTable.createdAt, todayStart), isNull(usersTable.deletedAt))),
      db
        .select({ c: count() })
        .from(vendorProfilesTable)
        .where(eq(vendorProfilesTable.storeIsOpen, true)),
    ]);

    const ordersByStatus: Record<string, number> = {};
    for (const row of orderStatusRows) {
      ordersByStatus[row.status] = Number(row.c);
    }

    sendSuccess(res, {
      revenue: {
        total: parseFloat(String(totalRevenueRow[0]?.total ?? "0")),
        today: parseFloat(String(todayRevenueRow[0]?.total ?? "0")),
      },
      orders: {
        byStatus: ordersByStatus,
        total: orderStatusRows.reduce((s, r) => s + Number(r.c), 0),
      },
      rides: {
        completed: Number(ridesCountRow[0]?.c ?? 0),
      },
      users: {
        newToday: Number(newUsersTodayRow[0]?.c ?? 0),
        newThisWeek: Number(newUsersWeekRow[0]?.c ?? 0),
      },
      vendors: {
        active: Number(activeVendorsRow[0]?.c ?? 0),
      },
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendInternalError(res, "Failed to fetch stats");
  }
});

/**
 * GET /api/metrics — real-time system performance metrics.
 * Requires admin JWT. Returns p95 response time, memory %, disk %, and
 * rolling request sample count. Suitable for admin dashboards and alerting.
 */
router.get("/metrics", adminAuth, (_req, res) => {
  sendSuccess(res, {
    p95ResponseTimeMs: getP95Ms(),
    memoryPct: getMemoryPct(),
    diskPct: getDiskPct(),
    requestCount: getSampleCount(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
