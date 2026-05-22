import { db } from "@workspace/db";
import {
  notificationsTable,
  schoolRoutesTable,
  schoolSubscriptionsTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { t, type TranslationKey } from "@workspace/i18n";
import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getUserLanguage } from "../lib/getUserLanguage.js";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendError, sendNotFound, sendSuccess } from "../lib/response.js";
import { customerAuth } from "../middleware/security.js";
import { adminAuth } from "./admin-shared.js";

const router: IRouter = Router();

const safeNum = (v: unknown, def = 0) => {
  const n = parseFloat(String(v ?? def));
  return isNaN(n) ? def : n;
};

function formatRoute(r: Record<string, unknown>) {
  return {
    ...r,
    monthlyPrice: safeNum(r.monthlyPrice),
    fromLat: r.fromLat ? safeNum(r.fromLat) : null,
    fromLng: r.fromLng ? safeNum(r.fromLng) : null,
    toLat: r.toLat ? safeNum(r.toLat) : null,
    toLng: r.toLng ? safeNum(r.toLng) : null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

/* ══════════════════════════════════════════════════════
   GET /school/routes — Public list of active school routes
══════════════════════════════════════════════════════ */
router.get("/routes", async (_req, res) => {
  try {
    const routes = await db
      .select()
      .from(schoolRoutesTable)
      .where(eq(schoolRoutesTable.isActive, true))
      .orderBy(asc(schoolRoutesTable.sortOrder), asc(schoolRoutesTable.schoolName));
    res.json({ routes: routes.map(formatRoute) });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ error: "Server error" });
  }
});

/* ══════════════════════════════════════════════════════
   GET /school/routes/:id — Single route details
══════════════════════════════════════════════════════ */
router.get("/routes/:id", async (req, res) => {
  try {
    const [route] = await db
      .select()
      .from(schoolRoutesTable)
      .where(eq(schoolRoutesTable.id, String(req.params["id"] as string)))
      .limit(1);
    if (!route) {
      res.status(404).json({ error: "Route not found" });
      return;
    }
    res.json(formatRoute(route));
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ error: "Server error" });
  }
});

/* ══════════════════════════════════════════════════════
   POST /school/subscribe — Subscribe a student to a school route
   Body: { routeId, studentName, studentClass, paymentMethod }
══════════════════════════════════════════════════════ */
router.post("/subscribe", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    const {
      routeId,
      studentName,
      studentClass,
      paymentMethod = "cash",
      notes,
      shift,
      startDate: startDateReq,
      recurring,
    } = req.body;
    if (!routeId || !studentName || !studentClass) {
      res.status(400).json({ error: "routeId, studentName, studentClass required" });
      return;
    }
    const validShifts = ["morning", "afternoon", "both"];
    if (shift && !validShifts.includes(shift)) {
      res.status(400).json({ error: "shift must be morning, afternoon, or both" });
      return;
    }

    const [route] = await db
      .select()
      .from(schoolRoutesTable)
      .where(and(eq(schoolRoutesTable.id, routeId), eq(schoolRoutesTable.isActive, true)))
      .limit(1);
    if (!route) {
      res.status(404).json({ error: "Route not found or inactive" });
      return;
    }

    /* Capacity check */
    if (route.enrolledCount >= route.capacity) {
      res.status(409).json({ error: `Route is full. Capacity: ${route.capacity}` });
      return;
    }

    /* Prevent duplicate active subscription */
    const [existing] = await db
      .select({ id: schoolSubscriptionsTable.id })
      .from(schoolSubscriptionsTable)
      .where(
        and(
          eq(schoolSubscriptionsTable.userId, userId),
          eq(schoolSubscriptionsTable.routeId, routeId),
          eq(schoolSubscriptionsTable.status, "active")
        )
      )
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "You already have an active subscription for this route" });
      return;
    }

    /* Wallet deduction for first month (only if wallet payment) */
    const monthlyAmt = safeNum(route.monthlyPrice);
    if (paymentMethod === "wallet" && monthlyAmt > 0) {
      const [wUser] = await db
        .select({ blockedServices: usersTable.blockedServices })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (
        wUser &&
        (wUser.blockedServices || "")
          .split(",")
          .map((sv) => sv.trim())
          .includes("wallet")
      ) {
        res.status(403).json({
          error: "wallet_frozen",
          message: "Your wallet has been temporarily frozen. Contact support.",
        });
        return;
      }

      const [user] = await db
        .select({ walletBalance: usersTable.walletBalance })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const balance = safeNum(user.walletBalance);
      if (balance < monthlyAmt) {
        res
          .status(400)
          .json({ error: `Insufficient wallet balance. Need Rs. ${monthlyAmt.toFixed(0)}` });
        return;
      }
      /* DB floor guard — deducts only if balance ≥ amount at UPDATE time */
      const [deducted] = await db
        .update(usersTable)
        .set({ walletBalance: sql`wallet_balance - ${monthlyAmt.toFixed(2)}` })
        .where(and(eq(usersTable.id, userId), gte(usersTable.walletBalance, monthlyAmt.toFixed(2))))
        .returning({ id: usersTable.id });
      if (!deducted) {
        res.status(400).json({
          error: "Insufficient wallet balance (concurrent request conflict). Please try again.",
        });
        return;
      }
      await db
        .insert(walletTransactionsTable)
        .values({
          id: generateId(),
          userId,
          type: "debit",
          amount: monthlyAmt.toFixed(2),
          description: `School Shift — ${route.schoolName} (1st month)`,
        })
        .catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), userId, routeId },
            "[school] wallet transaction insert failed (non-critical)"
          );
        });
    }

    /* Resolve start date — default to today, or validate requested date (must be ≥ today) */
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate = new Date(today);
    if (startDateReq) {
      const requested = new Date(startDateReq);
      if (isNaN(requested.getTime())) {
        res.status(400).json({ error: "Invalid startDate format. Use YYYY-MM-DD." });
        return;
      }
      if (requested < today) {
        res.status(400).json({ error: "startDate cannot be in the past" });
        return;
      }
      startDate = requested;
    }
    const nextBillingDate = new Date(startDate);
    nextBillingDate.setDate(nextBillingDate.getDate() + 30);

    /* Build composite notes */
    const noteParts: string[] = [];
    if (shift) noteParts.push(`Shift: ${shift}`);
    if (recurring === false) noteParts.push("Non-recurring");
    if (notes?.trim()) noteParts.push(notes.trim());
    const compositeNotes = noteParts.join(" | ") || null;

    const [sub] = await db
      .insert(schoolSubscriptionsTable)
      .values({
        id: generateId(),
        userId,
        routeId,
        studentName,
        studentClass,
        monthlyAmount: monthlyAmt.toFixed(2),
        status: "active",
        paymentMethod,
        startDate,
        nextBillingDate,
        notes: compositeNotes,
      })
      .returning();

    /* Atomic increment — prevents under-counting under concurrent subscriptions */
    await db
      .update(schoolRoutesTable)
      .set({ enrolledCount: sql`enrolled_count + 1`, updatedAt: new Date() })
      .where(eq(schoolRoutesTable.id, routeId));

    /* Notification */
    const schoolLang = await getUserLanguage(userId);
    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId,
        title: t("notifSchoolSubscribedTitle" as TranslationKey, schoolLang),
        body: t("notifSchoolSubscribedBody" as TranslationKey, schoolLang)
          .replace("{student}", studentName)
          .replace("{school}", route.schoolName)
          .replace("{route}", `${route.fromArea} → ${route.toAddress}`)
          .replace("{amount}", monthlyAmt.toFixed(0)),
        type: "ride",
        icon: "bus-outline",
      })
      .catch((err: unknown) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), userId },
          "[school] subscription notification insert failed (non-critical)"
        );
      });

    res
      .status(201)
      .json({ ...sub, monthlyAmount: safeNum(sub!.monthlyAmount), route: formatRoute(route) });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ error: "Server error" });
  }
});

/* ══════════════════════════════════════════════════════
   GET /school/my-subscriptions — requires JWT
══════════════════════════════════════════════════════ */
router.get("/my-subscriptions", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;

    const subs = await db
      .select()
      .from(schoolSubscriptionsTable)
      .where(eq(schoolSubscriptionsTable.userId, userId))
      .orderBy(desc(schoolSubscriptionsTable.createdAt));

    /* Enrich with route info */
    const enriched = await Promise.all(
      subs.map(async (sub) => {
        const [route] = await db
          .select()
          .from(schoolRoutesTable)
          .where(eq(schoolRoutesTable.id, sub.routeId))
          .limit(1);
        return {
          ...sub,
          monthlyAmount: safeNum(sub.monthlyAmount),
          route: route ? formatRoute(route) : null,
          startDate: sub.startDate instanceof Date ? sub.startDate.toISOString() : sub.startDate,
          nextBillingDate:
            sub.nextBillingDate instanceof Date
              ? sub.nextBillingDate.toISOString()
              : sub.nextBillingDate,
          createdAt: sub.createdAt instanceof Date ? sub.createdAt.toISOString() : sub.createdAt,
        };
      })
    );

    res.json({ subscriptions: enriched });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ error: "Server error" });
  }
});

/* ══════════════════════════════════════════════════════
   PATCH /school/subscriptions/:id/cancel
   Requires JWT — cancels the calling user's own subscription.
══════════════════════════════════════════════════════ */
router.patch("/subscriptions/:id/cancel", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;

    const [sub] = await db
      .select()
      .from(schoolSubscriptionsTable)
      .where(
        and(
          eq(schoolSubscriptionsTable.id, String(req.params["id"] as string)),
          eq(schoolSubscriptionsTable.userId, userId)
        )
      )
      .limit(1);
    if (!sub) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }
    if (sub.status !== "active") {
      res.status(400).json({ error: "Subscription is already inactive" });
      return;
    }

    /* TOCTOU guard: include userId in UPDATE WHERE so the ownership check
       and the mutation are atomic — a token swap between SELECT and UPDATE
       cannot cancel another user's subscription */
    const [updated] = await db
      .update(schoolSubscriptionsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(schoolSubscriptionsTable.id, String(req.params["id"] as string)),
          eq(schoolSubscriptionsTable.userId, userId)
        )
      )
      .returning();

    /* Decrement enrolled count on the route */
    await db
      .update(schoolRoutesTable)
      .set({ enrolledCount: sql`enrolled_count - 1`, updatedAt: new Date() })
      .where(eq(schoolRoutesTable.id, sub.routeId));

    res.json({ ...updated, monthlyAmount: safeNum(updated!.monthlyAmount) });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ error: "Server error" });
  }
});

/* ══════════════════════════════════════════════════════════════════
   Shared admin handlers — used by BOTH the legacy /school/admin/...
   paths (main router) AND the canonical /admin/school/... paths
   (adminSchoolRouter). Single implementation, zero duplication.
═══════════════════════════════════════════════════════════════════ */
async function handleAdminSubscriptionsList(
  req: import("express").Request,
  res: import("express").Response
) {
  const status = (req.query["status"] as string | undefined) ?? "";
  const routeId = (req.query["routeId"] as string | undefined) ?? "";
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10)));
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(schoolSubscriptionsTable.status, status) as ReturnType<typeof eq>);
  if (routeId)
    conditions.push(eq(schoolSubscriptionsTable.routeId, routeId) as ReturnType<typeof eq>);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db
    .select({ total: count() })
    .from(schoolSubscriptionsTable)
    .where(whereClause);
  const total = Number(countRow?.total ?? 0);

  const subs = await db
    .select({
      id: schoolSubscriptionsTable.id,
      userId: schoolSubscriptionsTable.userId,
      routeId: schoolSubscriptionsTable.routeId,
      studentName: schoolSubscriptionsTable.studentName,
      studentClass: schoolSubscriptionsTable.studentClass,
      monthlyAmount: schoolSubscriptionsTable.monthlyAmount,
      status: schoolSubscriptionsTable.status,
      paymentMethod: schoolSubscriptionsTable.paymentMethod,
      startDate: schoolSubscriptionsTable.startDate,
      nextBillingDate: schoolSubscriptionsTable.nextBillingDate,
      notes: schoolSubscriptionsTable.notes,
      createdAt: schoolSubscriptionsTable.createdAt,
      updatedAt: schoolSubscriptionsTable.updatedAt,
      routeName: schoolRoutesTable.routeName,
      schoolName: schoolRoutesTable.schoolName,
      fromArea: schoolRoutesTable.fromArea,
      toAddress: schoolRoutesTable.toAddress,
      userName: usersTable.name,
      userPhone: usersTable.phone,
    })
    .from(schoolSubscriptionsTable)
    .leftJoin(schoolRoutesTable, eq(schoolSubscriptionsTable.routeId, schoolRoutesTable.id))
    .leftJoin(usersTable, eq(schoolSubscriptionsTable.userId, usersTable.id))
    .where(whereClause)
    .orderBy(desc(schoolSubscriptionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  sendSuccess(res, {
    subscriptions: subs.map((s) => ({
      ...s,
      monthlyAmount: safeNum(s.monthlyAmount),
      startDate: s.startDate instanceof Date ? s.startDate.toISOString() : s.startDate,
      nextBillingDate:
        s.nextBillingDate instanceof Date ? s.nextBillingDate.toISOString() : s.nextBillingDate,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
    })),
    total,
    page,
    limit,
    hasMore: offset + subs.length < total,
  });
}

async function handleAdminSubscriptionCancel(
  req: import("express").Request,
  res: import("express").Response
) {
  const subId = String(req.params["id"] as string);
  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : "Admin cancellation";

  const [sub] = await db
    .select()
    .from(schoolSubscriptionsTable)
    .where(eq(schoolSubscriptionsTable.id, subId))
    .limit(1);
  if (!sub) {
    sendNotFound(res, "Subscription not found");
    return;
  }
  if (sub.status !== "active") {
    sendError(res, "Subscription is not active", 400);
    return;
  }

  const monthlyAmount = safeNum(sub.monthlyAmount);
  const startDate = sub.startDate instanceof Date ? sub.startDate : new Date(sub.startDate);
  const daysUsed = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 86_400_000));
  const daysRemaining = Math.max(0, 30 - daysUsed);
  /* Always credit the pro-rated refund to wallet regardless of original payment
     method — cancelled subscribers are due a refund for unused days.            */
  const proRatedRefund =
    monthlyAmount > 0 ? parseFloat(((monthlyAmount * daysRemaining) / 30).toFixed(2)) : 0;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schoolSubscriptionsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(schoolSubscriptionsTable.id, subId));
      await tx
        .update(schoolRoutesTable)
        .set({ enrolledCount: sql`GREATEST(enrolled_count - 1, 0)`, updatedAt: new Date() })
        .where(eq(schoolRoutesTable.id, sub.routeId));
      if (proRatedRefund > 0) {
        await tx
          .update(usersTable)
          .set({
            walletBalance: sql`wallet_balance + ${proRatedRefund.toFixed(2)}`,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, sub.userId));
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId: sub.userId,
          type: "credit",
          amount: proRatedRefund.toFixed(2),
          description: `School subscription refund (pro-rated, ${daysRemaining} days remaining) — ${reason}`,
          reference: `school_refund:${subId}`,
        });
      }
    });
    sendSuccess(
      res,
      { subscriptionId: subId, status: "cancelled", proRatedRefund, daysRemaining, reason },
      proRatedRefund > 0
        ? `Subscription cancelled. Rs. ${proRatedRefund.toFixed(0)} refunded to wallet.`
        : "Subscription cancelled."
    );
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendError(res, "Failed to cancel subscription. Please try again.", 500);
  }
}

/* ── Legacy paths: /school/admin/... — delegate to shared handlers above ─── */
router.get("/admin/subscriptions", adminAuth, handleAdminSubscriptionsList);
router.post("/admin/subscriptions/:id/cancel", adminAuth, handleAdminSubscriptionCancel);

/* ══════════════════════════════════════════════════════════════════
   Canonical admin paths: /admin/school/... — same shared handlers
   mounted via adminSchoolRouter in index.ts.
═══════════════════════════════════════════════════════════════════ */
export const adminSchoolRouter: IRouter = Router();
adminSchoolRouter.get("/subscriptions", adminAuth, handleAdminSubscriptionsList);
adminSchoolRouter.post("/subscriptions/:id/cancel", adminAuth, handleAdminSubscriptionCancel);

export default router;
