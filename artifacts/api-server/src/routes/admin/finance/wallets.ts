import { db } from "@workspace/db";
import {
  notificationsTable,
  ordersTable,
  rideRatingsTable,
  riderPenaltiesTable,
  usersTable,
  vendorProfilesTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { and, count, desc, eq, ilike, inArray, isNull, sql, sum } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { buildCursorPage, decodeCursor } from "../../../lib/pagination/cursor.js";
import {
  sendError,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../../../lib/response.js";
import { getIO } from "../../../lib/socketio.js";
import { requirePermission } from "../../../middleware/require-permission.js";
import { validateBody } from "../../../middleware/validate.js";
import { AuditService } from "../../../services/admin-audit.service.js";
import { FinanceService } from "../../../services/admin-finance.service.js";
import {
  addAuditEntry,
  generateId,
  getCachedSettings,
  getClientIp,
  getUserLanguage,
  logger,
  revokeAllUserSessions,
  sendUserNotification,
  stripUser,
  t,
  type AdminRequest,
  type TranslationKey,
} from "../../admin-shared.js";

const router = Router();
router.get("/transactions", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query["limit"] as string) || 50, 200);
    const after = req.query["after"] as string | undefined;
    const cursor = after ? decodeCursor(after) : null;

    const rows = await db
      .select()
      .from(walletTransactionsTable)
      .where(
        cursor ? sql`${walletTransactionsTable.createdAt} < ${cursor}::timestamptz` : undefined
      )
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(limit + 1);

    const page = buildCursorPage({
      data: rows,
      limit,
      getCursorValue: (t: (typeof rows)[0]) => t.createdAt.toISOString(),
    });

    const totalCredit = page.data
      .filter((t: (typeof rows)[0]) => t.type === "credit")
      .reduce((s: number, t: (typeof rows)[0]) => s + parseFloat(t.amount), 0);
    const totalDebit = page.data
      .filter((t: (typeof rows)[0]) => t.type === "debit")
      .reduce((s: number, t: (typeof rows)[0]) => s + parseFloat(t.amount), 0);

    sendSuccess(res, {
      transactions: page.data.map((t) => ({
        ...t,
        amount: parseFloat(t.amount),
        createdAt: t.createdAt.toISOString(),
      })),
      count: page.data.length,
      totalCredit,
      totalDebit,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── Platform Settings ── */
router.get("/transactions-enriched", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query["limit"] as string) || 50, 300);
    const after = req.query["after"] as string | undefined;
    const cursor = after ? decodeCursor(after) : null;

    const rows = await db
      .select()
      .from(walletTransactionsTable)
      .where(
        cursor ? sql`${walletTransactionsTable.createdAt} < ${cursor}::timestamptz` : undefined
      )
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(limit + 1);

    const page = buildCursorPage({
      data: rows,
      limit,
      getCursorValue: (t: (typeof rows)[0]) => t.createdAt.toISOString(),
    });

    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
      })
      .from(usersTable);
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const enriched = page.data.map((t) => ({
      ...t,
      amount: parseFloat(t.amount),
      createdAt: t.createdAt.toISOString(),
      userName: userMap[t.userId]?.name || null,
      userPhone: userMap[t.userId]?.phone || null,
    }));

    const totalCredit = enriched
      .filter((t) => t.type === "credit")
      .reduce((s, t) => s + t.amount, 0);
    const totalDebit = enriched.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);

    sendSuccess(res, {
      transactions: enriched,
      total: enriched.length,
      totalCredit,
      totalDebit,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── Vendors list ── */
router.get("/vendors", requirePermission("vendors.view"), async (_req, res) => {
  try {
    const settings = await getCachedSettings();
    const isDemoMode = (settings["platform_mode"] ?? "demo") === "demo";

    if (isDemoMode) {
      const { getDemoSnapshot } = await import("../../../lib/demo-snapshot.js");
      const snap = await getDemoSnapshot();
      sendSuccess(res, {
        vendors: snap.vendors,
        total: snap.vendors.length,
        isDemo: true,
      });
      return;
    }

    const vendors = await db
      .select({
        id: usersTable.id,
        phone: usersTable.phone,
        name: usersTable.name,
        email: usersTable.email,
        roles: usersTable.roles,
        walletBalance: usersTable.walletBalance,
        isActive: usersTable.isActive,
        isBanned: usersTable.isBanned,
        banReason: usersTable.banReason,
        approvalStatus: usersTable.approvalStatus,
        approvalNote: usersTable.approvalNote,
        commissionOverride: usersTable.commissionOverride,
        accountLevel: usersTable.accountLevel,
        kycStatus: usersTable.kycStatus,
        cnic: usersTable.cnic,
        nationalId: usersTable.nationalId,
        autoSuspendedAt: usersTable.autoSuspendedAt,
        adminOverrideSuspension: usersTable.adminOverrideSuspension,
        createdAt: usersTable.createdAt,
        lastLoginAt: usersTable.lastLoginAt,
        storeName: vendorProfilesTable.storeName,
        storeCategory: vendorProfilesTable.storeCategory,
        storeIsOpen: vendorProfilesTable.storeIsOpen,
        storeDescription: vendorProfilesTable.storeDescription,
        storeAddress: vendorProfilesTable.storeAddress,
        businessName: vendorProfilesTable.businessName,
        businessType: vendorProfilesTable.businessType,
        ntn: vendorProfilesTable.ntn,
      })
      .from(usersTable)
      .leftJoin(vendorProfilesTable, eq(usersTable.id, vendorProfilesTable.userId))
      .where(and(ilike(usersTable.roles, "%vendor%"), isNull(usersTable.deletedAt)))
      .orderBy(desc(usersTable.createdAt));

    const vendorIds = vendors.map((v) => v.id);
    let orderStats: {
      vendorId: string | null;
      totalOrders: number;
      totalRevenue: string | null;
      pendingOrders: number;
    }[] = [];
    if (vendorIds.length > 0) {
      orderStats = await db
        .select({
          vendorId: ordersTable.vendorId,
          totalOrders: count(),
          totalRevenue: sum(ordersTable.total),
          pendingOrders: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} = 'pending')`,
        })
        .from(ordersTable)
        .where(inArray(ordersTable.vendorId, vendorIds))
        .groupBy(ordersTable.vendorId)
        .catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            "[wallets] vendor order-stats aggregate query failed — returning empty stats"
          );
          return [] as {
            vendorId: string | null;
            totalOrders: number;
            totalRevenue: string | null;
            pendingOrders: number;
          }[];
        });
    }

    const statsMap = Object.fromEntries(orderStats.map((s) => [s.vendorId, s]));

    sendSuccess(res, {
      vendors: vendors.map((v) => {
        const stats = statsMap[v.id] || {};
        return {
          id: v.id,
          phone: v.phone,
          name: v.name,
          email: v.email,
          storeName: v.storeName,
          storeCategory: v.storeCategory,
          storeIsOpen: v.storeIsOpen,
          storeDescription: v.storeDescription,
          storeAddress: v.storeAddress ?? null,
          businessName: v.businessName ?? null,
          businessType: v.businessType ?? null,
          ntn: v.ntn ?? null,
          walletBalance: parseFloat(v.walletBalance ?? "0"),
          isActive: v.isActive,
          isBanned: v.isBanned,
          banReason: v.banReason ?? null,
          approvalStatus: v.approvalStatus,
          approvalNote: v.approvalNote,
          roles: v.roles,
          commissionOverride: v.commissionOverride ?? null,
          accountLevel: v.accountLevel ?? "bronze",
          kycStatus: v.kycStatus ?? "none",
          cnic: v.cnic ?? null,
          nationalId: v.nationalId ?? null,
          autoSuspendedAt: v.autoSuspendedAt ? v.autoSuspendedAt.toISOString() : null,
          adminOverrideSuspension: v.adminOverrideSuspension ?? false,
          createdAt: v.createdAt.toISOString(),
          lastLoginAt: v.lastLoginAt ? v.lastLoginAt.toISOString() : null,
          totalOrders: Number(stats.totalOrders ?? 0),
          totalRevenue: parseFloat(String(stats.totalRevenue ?? "0")),
          pendingOrders: Number(stats.pendingOrders ?? 0),
        };
      }),
      total: vendors.length,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── POST /admin/vendors/:id/payout — deduct from vendor wallet ── */
router.post(
  "/vendors/:id/payout",
  requirePermission("finance.payouts.release"),
  async (req, res) => {
    const { amount, description } = req.body as { amount?: unknown; description?: string };
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: "Valid amount required" });
      return;
    }
    const vendorId = req.params["id"] as string;
    const [vendor] = await db.select().from(usersTable).where(eq(usersTable.id, vendorId)).limit(1);
    if (!vendor) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    const amt = Number(amount);
    const currentBal = parseFloat(vendor.walletBalance ?? "0");
    if (currentBal < amt) {
      res.status(400).json({ error: `Insufficient wallet balance (Rs. ${currentBal.toFixed(0)})` });
      return;
    }
    const [updated] = await db
      .update(usersTable)
      .set({ walletBalance: sql`wallet_balance - ${amt}`, updatedAt: new Date() })
      .where(and(eq(usersTable.id, vendorId), sql`CAST(wallet_balance AS NUMERIC) >= ${amt}`))
      .returning();
    if (!updated) {
      res.status(400).json({
        error:
          "Payout failed: insufficient balance at time of processing (possible concurrent request).",
      });
      return;
    }
    const newBal = parseFloat(updated.walletBalance ?? "0");
    await db.insert(walletTransactionsTable).values({
      id: generateId(),
      userId: vendorId,
      type: "debit",
      amount: String(amt),
      description: description || `Admin payout processed: Rs. ${amt}`,
      reference: "admin_payout",
    });
    await sendUserNotification(
      vendorId,
      "Payout Processed 💰",
      `Rs. ${amt} has been paid out from your vendor wallet.`,
      "system",
      "cash-outline"
    );
    res.json({
      success: true,
      amount: amt,
      newBalance: newBal,
      vendor: { ...stripUser(updated), walletBalance: newBal },
    });
  }
);

/* ── POST /admin/vendors/:id/credit — credit vendor wallet ── */
router.post("/vendors/:id/credit", requirePermission("finance.wallet.adjust"), async (req, res) => {
  const { amount, description } = req.body as { amount?: unknown; description?: string };
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    res.status(400).json({ error: "Valid amount required" });
    return;
  }
  const vendorId = req.params["id"] as string;
  const [vendor] = await db.select().from(usersTable).where(eq(usersTable.id, vendorId)).limit(1);
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  const amt = Number(amount);
  const [updated] = await db
    .update(usersTable)
    .set({ walletBalance: sql`wallet_balance + ${amt}`, updatedAt: new Date() })
    .where(eq(usersTable.id, vendorId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  const newBal = parseFloat(updated.walletBalance ?? "0");
  await db.insert(walletTransactionsTable).values({
    id: generateId(),
    userId: vendorId,
    type: "credit",
    amount: String(amt),
    description: description || `Admin credit: Rs. ${amt}`,
    reference: "admin_credit",
  });
  await sendUserNotification(
    vendorId,
    "Wallet Credited 💰",
    `Rs. ${amt} has been credited to your vendor wallet.`,
    "system",
    "wallet-outline"
  );
  res.json({
    success: true,
    amount: amt,
    newBalance: newBal,
    vendor: { ...stripUser(updated), walletBalance: newBal },
  });
});

const vendorStatusSchema = z.object({
  isActive: z.boolean().optional(),
  isBanned: z.boolean().optional(),
  banReason: z.string().max(500).nullable().optional(),
  securityNote: z.string().max(500).nullable().optional(),
});

router.patch(
  "/vendors/:id/status",
  requirePermission("vendors.edit"),
  validateBody(vendorStatusSchema),
  async (req, res) => {
    try {
      const { isActive, isBanned, banReason, securityNote } = req.body;

      const [existing] = await db
        .select({
          id: usersTable.id,
          roles: usersTable.roles,
          isBanned: usersTable.isBanned,
        })
        .from(usersTable)
        .where(eq(usersTable.id, req.params["id"] as string))
        .limit(1);
      if (!existing) {
        sendNotFound(res, "Vendor not found");
        return;
      }
      if (!existing.roles || !existing.roles.toLowerCase().includes("vendor")) {
        sendValidationError(res, "User is not a vendor");
        return;
      }

      const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
      if (isActive !== undefined) updates.isActive = isActive;
      if (isBanned !== undefined) updates.isBanned = isBanned;
      if (banReason !== undefined) updates.banReason = banReason || null;
      if (securityNote !== undefined) updates.securityNote = securityNote || null;
      const effectiveBanned = isBanned !== undefined ? isBanned : existing.isBanned;
      if (isActive === true && !effectiveBanned) updates.approvalStatus = "approved";
      const [user] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, req.params["id"] as string))
        .returning();
      if (!user) {
        sendNotFound(res, "Vendor not found");
        return;
      }
      if (isBanned || isActive === false) {
        revokeAllUserSessions(req.params["id"] as string).catch((err: unknown) => {
          logger.warn(
            {
              err: err instanceof Error ? err.message : String(err),
              userId: req.params["id"] as string,
            },
            "[wallets] revokeAllUserSessions (vendor ban) failed — sessions may persist"
          );
        });
        if (isBanned) {
          await sendUserNotification(
            req.params["id"] as string,
            "Store Account Suspended ⚠️",
            banReason || "Your vendor account has been suspended. Contact support.",
            "warning",
            "warning-outline"
          );
        }
      }
      sendSuccess(res, {
        ...user,
        walletBalance: parseFloat(String(user.walletBalance ?? "0")),
      });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

const vendorFinancialSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  description: z.string().max(200).optional(),
});

router.post(
  "/vendors/:id/payout",
  requirePermission("vendors.edit"),
  validateBody(vendorFinancialSchema),
  async (req, res) => {
    try {
      const adminReq = req as AdminRequest;
      const { amount, description } = req.body;
      const vendorId = req.params["id"] as string;

      try {
        const result = await AuditService.executeWithAudit(
          {
            adminId: adminReq.adminId,
            adminName: adminReq.adminName,
            adminIp: adminReq.adminIp || getClientIp(req),
            action: "vendor_payout",
            resourceType: "vendor",
            resource: vendorId,
            details: `Amount: Rs. ${amount}`,
          },
          () =>
            FinanceService.createTransaction({
              userId: vendorId,
              amount: Number(amount),
              type: "debit",
              reason: description || `Admin payout: Rs. ${amount}`,
              reference: "admin_payout",
            })
        );

        const [vendor] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, vendorId))
          .limit(1);
        await sendUserNotification(
          vendorId,
          "Payout Processed 💰",
          `Rs. ${amount} has been paid out from your vendor wallet.`,
          "system",
          "cash-outline"
        );

        sendSuccess(res, {
          amount,
          newBalance: result.newBalance,
          vendor: { ...stripUser(vendor!), walletBalance: result.newBalance },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        sendError(res, message, 400);
      }
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

router.post(
  "/vendors/:id/credit",
  requirePermission("vendors.edit"),
  validateBody(vendorFinancialSchema),
  async (req, res) => {
    try {
      const adminReq = req as AdminRequest;
      const { amount, description } = req.body;
      const vendorId = req.params["id"] as string;

      try {
        const result = await AuditService.executeWithAudit(
          {
            adminId: adminReq.adminId,
            adminName: adminReq.adminName,
            adminIp: adminReq.adminIp || getClientIp(req),
            action: "vendor_credit",
            resourceType: "vendor",
            resource: vendorId,
            details: `Amount: Rs. ${amount}`,
          },
          () =>
            FinanceService.createTransaction({
              userId: vendorId,
              amount: Number(amount),
              type: "credit",
              reason: description || `Admin credit: Rs. ${amount}`,
              reference: "admin_credit",
            })
        );

        const [vendor] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, vendorId))
          .limit(1);
        await sendUserNotification(
          vendorId,
          "Wallet Credited 💰",
          `Rs. ${amount} has been credited to your vendor wallet.`,
          "system",
          "wallet-outline"
        );

        sendSuccess(res, {
          amount,
          newBalance: result.newBalance,
          vendor: { ...stripUser(vendor!), walletBalance: result.newBalance },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        sendError(res, message, 400);
      }
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ══════════════════════════════════════
   RIDER MANAGEMENT
══════════════════════════════════════ */
router.get("/riders", async (_req, res) => {
  try {
    const settings = await getCachedSettings();
    const isDemoMode = (settings["platform_mode"] ?? "demo") === "demo";

    if (isDemoMode) {
      const { getDemoSnapshot } = await import("../../../lib/demo-snapshot.js");
      const snap = await getDemoSnapshot();
      sendSuccess(res, {
        riders: snap.riders,
        total: snap.riders.length,
        isDemo: true,
      });
      return;
    }

    const riders = await db
      .select()
      .from(usersTable)
      .where(and(ilike(usersTable.roles, "%rider%"), isNull(usersTable.deletedAt)))
      .orderBy(desc(usersTable.createdAt));

    const riderIds = riders.map((r) => r.id);
    const [penaltyRows, ratingRows] = await Promise.all([
      riderIds.length > 0
        ? db
            .select({
              riderId: riderPenaltiesTable.riderId,
              total: sum(riderPenaltiesTable.amount),
            })
            .from(riderPenaltiesTable)
            .where(sql`${riderPenaltiesTable.riderId} IN ${riderIds}`)
            .groupBy(riderPenaltiesTable.riderId)
        : Promise.resolve([]),
      riderIds.length > 0
        ? db
            .select({
              riderId: rideRatingsTable.riderId,
              avgRating: sql<string>`ROUND(AVG(${rideRatingsTable.stars})::numeric, 1)`,
              ratingCount: count(),
            })
            .from(rideRatingsTable)
            .where(sql`${rideRatingsTable.riderId} IN ${riderIds}`)
            .groupBy(rideRatingsTable.riderId)
        : Promise.resolve([]),
    ]);
    const penaltyMap = new Map(
      penaltyRows.map((r: Record<string, unknown>) => [
        r.riderId,
        parseFloat(String(r.total ?? "0")),
      ]) as [string, number][]
    );
    const ratingMap = new Map(
      ratingRows.map((r: Record<string, unknown>) => [
        r.riderId,
        {
          avg: parseFloat(String(r.avgRating ?? "0")),
          count: (r.ratingCount as number) ?? 0,
        },
      ]) as [string, { avg: number; count: number }][]
    );

    sendSuccess(res, {
      riders: riders.map((r) => ({
        id: r.id,
        phone: r.phone,
        name: r.name,
        email: r.email,
        avatar: r.avatar,
        walletBalance: parseFloat(r.walletBalance ?? "0"),
        isActive: r.isActive,
        isBanned: r.isBanned,
        isRestricted: r.isRestricted ?? false,
        cancelCount: r.cancelCount ?? 0,
        ignoreCount: r.ignoreCount ?? 0,
        penaltyTotal: penaltyMap.get(r.id) ?? 0,
        avgRating: ratingMap.get(r.id)?.avg ?? 0,
        ratingCount: ratingMap.get(r.id)?.count ?? 0,
        roles: r.roles,
        isOnline: r.isOnline ?? false,
        createdAt: r.createdAt.toISOString(),
        lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
      })),
      total: riders.length,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.patch("/riders/:id/status", async (req, res) => {
  try {
    const { isActive, isBanned, banReason } = req.body;
    const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
    if (isActive !== undefined) updates.isActive = isActive;
    if (isBanned !== undefined) updates.isBanned = isBanned;
    if (banReason !== undefined) updates.banReason = banReason || null;
    if (isActive === true) {
      const [current] = await db
        .select({ isBanned: usersTable.isBanned })
        .from(usersTable)
        .where(eq(usersTable.id, req.params["id"] as string))
        .limit(1);
      if (!isBanned && !current?.isBanned) updates.approvalStatus = "approved";
    }
    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.params["id"] as string))
      .returning();
    if (!user) {
      sendNotFound(res, "Rider not found");
      return;
    }
    if (isBanned || isActive === false) {
      revokeAllUserSessions(req.params["id"] as string).catch((err: unknown) => {
        logger.warn(
          {
            err: err instanceof Error ? err.message : String(err),
            userId: req.params["id"] as string,
          },
          "[wallets] revokeAllUserSessions (rider ban) failed — sessions may persist"
        );
      });
      if (isBanned) {
        await sendUserNotification(
          req.params["id"] as string,
          "Rider Account Suspended ⚠️",
          banReason || "Your rider account has been suspended. Contact support.",
          "warning",
          "warning-outline"
        );
      }
    }
    sendSuccess(res, {
      ...user,
      walletBalance: parseFloat(String(user.walletBalance ?? "0")),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/riders/:id/payout", async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      sendValidationError(res, "Valid amount required");
      return;
    }
    const [rider] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.params["id"] as string))
      .limit(1);
    if (!rider) {
      sendNotFound(res, "Rider not found");
      return;
    }
    const amt = Number(amount);
    const currentBal = parseFloat(rider.walletBalance ?? "0");
    if (currentBal < amt) {
      sendValidationError(res, `Insufficient wallet balance (Rs. ${currentBal.toFixed(0)})`);
      return;
    }
    let updated: typeof usersTable.$inferSelect | undefined;
    try {
      updated = await db.transaction(async (tx) => {
        /* Atomic deduction + log in one transaction: WHERE wallet_balance >= amt prevents
         double-deduct from concurrent requests; INSERT inside the same tx ensures the
         audit trail is never lost if the log write fails. */
        const [txUpdated] = await tx
          .update(usersTable)
          .set({
            walletBalance: sql`wallet_balance - ${amt}`,
            updatedAt: new Date(),
          })
          .where(and(eq(usersTable.id, rider.id), sql`CAST(wallet_balance AS NUMERIC) >= ${amt}`))
          .returning();
        if (!txUpdated) {
          throw new Error(
            "Payout failed: insufficient balance at time of processing (possible concurrent request)."
          );
        }
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId: rider.id,
          type: "debit",
          amount: String(amt),
          description: description || `Rider payout: Rs. ${amt}`,
          reference: "rider_payout",
        });
        return txUpdated;
      });
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "";
      if (msg.startsWith("Payout failed")) {
        sendValidationError(res, msg);
        return;
      }
      logger.error("[riders payout] Transaction error:", e);
      sendError(res, "Something went wrong, please try again.", 500);
      return;
    }
    const newBal = parseFloat(updated.walletBalance ?? "0");
    await sendUserNotification(
      rider.id,
      "Earnings Paid Out 💵",
      `Rs. ${amt} has been paid out to your account.`,
      "system",
      "cash-outline"
    );
    sendSuccess(res, {
      amount: amt,
      newBalance: newBal,
      rider: { ...updated, walletBalance: newBal },
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/riders/:id/bonus", async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      sendValidationError(res, "Valid amount required");
      return;
    }
    const riderId = req.params["id"] as string;
    const amt = Number(amount);
    const txId = generateId();

    const bonusSettings = await getCachedSettings();
    const maxBalance = parseFloat(bonusSettings["wallet_max_balance"] ?? "50000");

    let updated: typeof usersTable.$inferSelect | undefined;
    let newBal = 0;
    try {
      await db.transaction(async (tx) => {
        const [rider] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, riderId))
          .limit(1)
          .for("update");
        if (!rider) throw new Error("NOT_FOUND");
        const currentBal = parseFloat(rider.walletBalance ?? "0");
        if (currentBal + amt > maxBalance) throw new Error("BALANCE_CAP");
        const [refreshed] = await tx
          .update(usersTable)
          .set({
            walletBalance: sql`wallet_balance + ${amt}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(usersTable.id, riderId),
              sql`CAST(wallet_balance AS numeric) + ${amt} <= ${maxBalance}`
            )
          )
          .returning();
        if (!refreshed) throw new Error("BALANCE_CAP");
        await tx.insert(walletTransactionsTable).values({
          id: txId,
          userId: riderId,
          type: "credit",
          amount: String(amt),
          description: description || `Admin bonus: Rs. ${amt}`,
          reference: "rider_bonus",
        });
        updated = refreshed;
        newBal = parseFloat(refreshed.walletBalance ?? "0");
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "NOT_FOUND") {
        sendNotFound(res, "Rider not found");
        return;
      }
      if (err instanceof Error && err.message === "BALANCE_CAP") {
        sendValidationError(
          res,
          `Wallet balance limit is Rs. ${maxBalance}. Bonus would exceed the limit.`
        );
        return;
      }
      throw err;
    }
    await sendUserNotification(
      riderId,
      "Bonus Received! 🎉",
      `Rs. ${amt} bonus has been added to your wallet.`,
      "system",
      "gift-outline"
    );
    sendSuccess(res, {
      amount: amt,
      newBalance: newBal,
      rider: { ...updated, walletBalance: newBal },
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/riders/:id/penalties", async (req, res) => {
  try {
    const riderId = req.params["id"] as string;
    const penalties = await db
      .select()
      .from(riderPenaltiesTable)
      .where(eq(riderPenaltiesTable.riderId, riderId))
      .orderBy(desc(riderPenaltiesTable.createdAt))
      .limit(100);
    sendSuccess(res, {
      penalties: penalties.map((p) => ({
        ...p,
        amount: parseFloat(String(p.amount)),
      })),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post(
  "/riders/:id/penalties",
  requirePermission("finance.payouts.release"),
  async (req, res) => {
    try {
      const riderId = req.params["id"] as string;
      const { type = "manual", amount = 0, reason } = req.body as Record<string, unknown>;
      const [rider] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, riderId))
        .limit(1);
      if (!rider) {
        sendNotFound(res, "Rider not found");
        return;
      }
      const amt = parseFloat(String(amount));
      if (isNaN(amt) || amt < 0) {
        sendValidationError(res, "Invalid amount");
        return;
      }
      const [penalty] = await db
        .insert(riderPenaltiesTable)
        .values({
          id: generateId(),
          riderId,
          type: String(type),
          amount: String(amt),
          reason: reason ? String(reason) : null,
        })
        .returning();
      if (amt > 0) {
        await db
          .update(usersTable)
          .set({
            walletBalance: sql`GREATEST(CAST(wallet_balance AS NUMERIC) - ${amt}, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, riderId));
        await db.insert(walletTransactionsTable).values({
          id: generateId(),
          userId: riderId,
          type: "debit",
          amount: String(amt),
          description: `Penalty — ${reason ?? type}`,
          reference: `penalty_${penalty!.id}`,
        });
      }
      await sendUserNotification(
        riderId,
        "Penalty Applied ⚠️",
        reason
          ? `A penalty of Rs. ${amt} has been applied: ${String(reason)}`
          : `A penalty of Rs. ${amt} has been applied to your account.`,
        "warning",
        "alert-circle-outline"
      );
      res.status(201).json({
        success: true,
        penalty: { ...penalty!, amount: amt },
      });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

router.delete(
  "/riders/:id/penalties/:pid",
  requirePermission("finance.payouts.release"),
  async (req, res) => {
    try {
      const { id: riderId, pid } = req.params as { id: string; pid: string };
      const [penalty] = await db
        .select()
        .from(riderPenaltiesTable)
        .where(and(eq(riderPenaltiesTable.id, pid), eq(riderPenaltiesTable.riderId, riderId)))
        .limit(1);
      if (!penalty) {
        sendNotFound(res, "Penalty not found");
        return;
      }
      await db
        .delete(riderPenaltiesTable)
        .where(and(eq(riderPenaltiesTable.id, pid), eq(riderPenaltiesTable.riderId, riderId)));
      const amt = parseFloat(String(penalty.amount));
      if (amt > 0) {
        await db
          .update(usersTable)
          .set({
            walletBalance: sql`CAST(wallet_balance AS NUMERIC) + ${amt}`,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, riderId));
        await db.insert(walletTransactionsTable).values({
          id: generateId(),
          userId: riderId,
          type: "credit",
          amount: String(amt),
          description: `Penalty reversed — ${penalty.reason ?? penalty.type}`,
          reference: `penalty_reversal_${pid}`,
        });
        await sendUserNotification(
          riderId,
          "Penalty Reversed ✅",
          `A penalty of Rs. ${amt} has been reversed and credited back to your account.`,
          "system",
          "checkmark-circle-outline"
        );
      }
      res.json({ success: true });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

router.get("/riders/:id/ratings", async (req, res) => {
  try {
    const riderId = req.params["id"] as string;
    const ratings = await db
      .select()
      .from(rideRatingsTable)
      .where(eq(rideRatingsTable.riderId, riderId))
      .orderBy(desc(rideRatingsTable.createdAt))
      .limit(100);
    sendSuccess(res, { ratings });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/riders/:id/restrict", async (req, res) => {
  try {
    const riderId = req.params["id"] as string;
    const [user] = await db
      .update(usersTable)
      .set({ isRestricted: true, updatedAt: new Date() })
      .where(eq(usersTable.id, riderId))
      .returning();
    if (!user) {
      sendNotFound(res, "Rider not found");
      return;
    }
    await sendUserNotification(
      riderId,
      "Account Restricted ⚠️",
      "Your account has been restricted by admin. Contact support for more details.",
      "system",
      "alert-circle-outline"
    );
    sendSuccess(res, { isRestricted: true });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/riders/:id/unrestrict", async (req, res) => {
  try {
    const riderId = req.params["id"] as string;
    const [user] = await db
      .update(usersTable)
      .set({ isRestricted: false, updatedAt: new Date() })
      .where(eq(usersTable.id, riderId))
      .returning();
    if (!user) {
      sendNotFound(res, "Rider not found");
      return;
    }
    await sendUserNotification(
      riderId,
      "Account Unrestricted ✅",
      "Your account has been unrestricted. You can now accept rides again.",
      "system",
      "checkmark-circle-outline"
    );
    sendSuccess(res, { isRestricted: false });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── GET /admin/withdrawal-requests ─────────── */
router.get(
  "/withdrawal-requests",
  requirePermission("finance.withdrawals.view"),
  async (req, res) => {
    try {
      const statusFilter = req.query["status"] as string | undefined;
      const pageNum = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10) || 1);
      const pageSize = Math.min(
        200,
        Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10) || 50)
      );
      const offset = (pageNum - 1) * pageSize;

      type WithdrawalRow = typeof walletTransactionsTable.$inferSelect;
      const statusToRefPattern: Record<string, string> = {
        pending: "pending",
        paid: "paid:",
        rejected: "rejected:",
      };

      let baseWhere = eq(walletTransactionsTable.type, "withdrawal");
      if (statusFilter && statusFilter in statusToRefPattern) {
        const pattern = statusToRefPattern[statusFilter]!;
        if (pattern === "pending") {
          baseWhere = and(
            baseWhere,
            sql`(${walletTransactionsTable.reference} = 'pending' OR ${walletTransactionsTable.reference} IS NULL)`
          ) as typeof baseWhere;
        } else {
          baseWhere = and(
            baseWhere,
            sql`${walletTransactionsTable.reference} LIKE ${pattern + "%"}`
          ) as typeof baseWhere;
        }
      }

      const [{ total }] = await db
        .select({ total: count() })
        .from(walletTransactionsTable)
        .where(baseWhere);

      const rows = await db
        .select({
          tx: walletTransactionsTable,
          uid: usersTable.id,
          name: usersTable.name,
          phone: usersTable.phone,
          roles: usersTable.roles,
        })
        .from(walletTransactionsTable)
        .leftJoin(usersTable, eq(walletTransactionsTable.userId, usersTable.id))
        .where(baseWhere)
        .orderBy(desc(walletTransactionsTable.createdAt))
        .limit(pageSize)
        .offset(offset);

      const withdrawals = rows.map(({ tx, uid, name, phone, roles }) => {
        const ref = (tx as WithdrawalRow).reference ?? "pending";
        const status =
          ref === "pending"
            ? "pending"
            : ref.startsWith("paid:")
              ? "paid"
              : ref.startsWith("rejected:")
                ? "rejected"
                : ref;
        const refNo = ref.startsWith("paid:")
          ? ref.slice(5)
          : ref.startsWith("rejected:")
            ? ref.slice(9)
            : "";
        return {
          ...tx,
          amount: parseFloat(String(tx.amount)),
          user: uid ? { id: uid, name, phone, roles } : null,
          status,
          refNo,
        };
      });

      sendSuccess(res, {
        withdrawals,
        total: total ?? 0,
        page: pageNum,
        pageSize,
      });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ── PATCH /admin/withdrawal-requests/:id/approve ─── */
router.patch(
  "/withdrawal-requests/:id/approve",
  requirePermission("finance.withdrawals.approve"),
  async (req, res) => {
    try {
      const adminReq = req as AdminRequest;
      const { refNo, note } = req.body;
      const txId = req.params["id"] as string;
      const [tx] = await db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.id, txId))
        .limit(1);
      if (!tx) {
        sendNotFound(res, "Withdrawal not found");
        return;
      }
      if (tx.reference && tx.reference !== "pending") {
        sendError(res, `Already processed (${tx.reference})`, 409);
        return;
      }
      const ref = refNo ? `paid:${refNo.trim()}` : "paid:manual";
      /* Atomic compare-and-swap: only succeeds if still 'pending', preventing double-approval */
      const [updated] = await db
        .update(walletTransactionsTable)
        .set({ reference: ref })
        .where(
          and(
            eq(walletTransactionsTable.id, txId),
            eq(walletTransactionsTable.reference, "pending")
          )
        )
        .returning();
      if (!updated) {
        sendError(res, "Withdrawal already processed by another request", 409);
        return;
      }
      const amt = parseFloat(String(tx.amount));

      void addAuditEntry({
        action: "withdrawal_approved",
        ip: adminReq.adminIp || getClientIp(req),
        details: `Withdrawal ${txId} approved for user ${tx.userId} — Rs. ${amt.toFixed(2)}${refNo ? ` (ref: ${refNo})` : ""}`,
        result: "success",
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
      });

      const wdLang = await getUserLanguage(tx.userId);
      const wdRef = refNo ? ` Reference: ${refNo}` : "";
      const wdNote = note ? ` Note: ${note}` : "";
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: tx.userId,
          title: t("notifWithdrawalApproved" as TranslationKey, wdLang),
          body: t("notifWithdrawalApprovedBody" as TranslationKey, wdLang)
            .replace("{amount}", amt.toFixed(0))
            .replace("{ref}", wdRef)
            .replace("{note}", wdNote),
          type: "wallet",
          icon: "checkmark-circle-outline",
        })
        .catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), txId },
            "[wallets] withdrawal-approved notification insert failed"
          );
        });
      const wdIo = getIO();
      if (wdIo)
        wdIo.to("admin-fleet").emit("wallet:withdrawal-approved", {
          txId,
          userId: tx.userId,
          amount: amt,
        });
      sendSuccess(res, { txId, status: "paid", refNo: refNo || "manual" });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ── PATCH /admin/withdrawal-requests/:id/reject ─── */
router.patch(
  "/withdrawal-requests/:id/reject",
  requirePermission("finance.withdrawals.approve"),
  async (req, res) => {
    try {
      const adminReq = req as AdminRequest;
      const { reason } = req.body;
      const txId = req.params["id"] as string;
      const [tx] = await db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.id, txId))
        .limit(1);
      if (!tx) {
        sendNotFound(res, "Withdrawal not found");
        return;
      }
      if (tx.reference && tx.reference !== "pending") {
        sendValidationError(res, `Already processed (${tx.reference})`);
        return;
      }
      const rejReason = reason?.trim() || "Admin rejected";
      const amt = parseFloat(String(tx.amount));
      const txResult = await db
        .transaction(async (txn) => {
          const [updated] = await txn
            .update(walletTransactionsTable)
            .set({ reference: `rejected:${rejReason}` })
            .where(
              and(
                eq(walletTransactionsTable.id, txId),
                eq(walletTransactionsTable.reference, "pending")
              )
            )
            .returning();
          if (!updated) throw new Error("ALREADY_PROCESSED");
          await txn
            .update(usersTable)
            .set({
              walletBalance: sql`wallet_balance + ${amt}`,
              updatedAt: new Date(),
            })
            .where(eq(usersTable.id, tx.userId));
          await txn.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: tx.userId,
            type: "credit",
            amount: amt.toFixed(2),
            description: `Withdrawal Refunded — ${rejReason}`,
            reference: `refund:${txId}`,
            paymentMethod: null,
          });
          return true;
        })
        .catch((err: Error) => {
          if (err.message === "ALREADY_PROCESSED") return null;
          throw err;
        });
      if (!txResult) {
        sendError(res, "Withdrawal has already been processed", 409);
        return;
      }

      void addAuditEntry({
        action: "withdrawal_rejected",
        ip: adminReq.adminIp || getClientIp(req),
        details: `Withdrawal ${txId} rejected for user ${tx.userId} — Rs. ${amt.toFixed(2)} refunded. Reason: ${rejReason}`,
        result: "success",
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
      });

      const wdRejLang = await getUserLanguage(tx.userId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: tx.userId,
          title: t("notifWithdrawalRejected" as TranslationKey, wdRejLang),
          body: t("notifWithdrawalRejectedBody" as TranslationKey, wdRejLang)
            .replace("{amount}", amt.toFixed(0))
            .replace("{reason}", rejReason),
          type: "wallet",
          icon: "close-circle-outline",
        })
        .catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), txId },
            "[wallets] withdrawal-rejected notification insert failed"
          );
        });
      const wdRejIo = getIO();
      if (wdRejIo)
        wdRejIo.to("admin-fleet").emit("wallet:withdrawal-rejected", {
          txId,
          userId: tx.userId,
          amount: amt,
          reason: rejReason,
        });
      sendSuccess(res, {
        txId,
        status: "rejected",
        reason: rejReason,
        refunded: amt,
      });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ── PATCH /admin/withdrawal-requests/batch-approve ─── */
router.patch(
  "/withdrawal-requests/batch-approve",
  requirePermission("finance.withdrawals.approve"),
  async (req, res) => {
    try {
      const { ids } = req.body as { ids: string[] };
      if (!Array.isArray(ids) || ids.length === 0) {
        sendValidationError(res, "ids required");
        return;
      }
      type ApprovedItem = { txId: string; refNo: string; userId: string; amount: string };
      const approvedItems: ApprovedItem[] = [];
      /* All reference updates committed atomically — if any write fails the
       entire batch is rolled back, leaving no half-approved state. */
      await db.transaction(async (tx) => {
        for (const txId of ids) {
          const [txn] = await tx
            .select()
            .from(walletTransactionsTable)
            .where(eq(walletTransactionsTable.id, txId))
            .limit(1);
          if (!txn) {
            throw Object.assign(new Error(`Withdrawal request not found: ${txId}`), {
              status: 404,
            });
          }
          if (txn.reference && txn.reference !== "pending") {
            throw Object.assign(
              new Error(`Withdrawal ${txId} is already processed (status: ${txn.reference})`),
              { status: 409 }
            );
          }
          const refNo = `BATCH-${Date.now()}`;
          await tx
            .update(walletTransactionsTable)
            .set({ reference: refNo })
            .where(eq(walletTransactionsTable.id, txId));
          approvedItems.push({ txId, refNo, userId: txn.userId, amount: String(txn.amount) });
        }
      });
      /* Notifications are best-effort — sent after the transaction commits so a
       notification failure never rolls back an already-committed approval. */
      for (const item of approvedItems) {
        const batchAppLang = await getUserLanguage(item.userId);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId: item.userId,
            title: t("notifWithdrawalApproved" as TranslationKey, batchAppLang),
            body: t("notifWithdrawalApprovedBody" as TranslationKey, batchAppLang)
              .replace("{amount}", parseFloat(item.amount).toFixed(0))
              .replace("{ref}", ` Ref: ${item.refNo}`)
              .replace("{note}", ""),
            type: "wallet",
            icon: "checkmark-circle-outline",
          })
          .catch((err: unknown) => {
            logger.warn(
              { err: err instanceof Error ? err.message : String(err), txId: item.txId },
              "[wallets] batch-approve notification insert failed"
            );
          });
      }
      sendSuccess(res, { approved: approvedItems.map((i) => i.txId) });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ── PATCH /admin/withdrawal-requests/batch-reject ─── */
router.patch(
  "/withdrawal-requests/batch-reject",
  requirePermission("finance.withdrawals.approve"),
  async (req, res) => {
    try {
      const { ids, reason } = req.body as { ids: string[]; reason: string };
      if (!Array.isArray(ids) || ids.length === 0) {
        sendValidationError(res, "ids required");
        return;
      }
      const rejReason = (reason || "Admin batch rejected").trim();
      type RejectedItem = { txId: string; userId: string; amt: number };
      const rejectedItems: RejectedItem[] = [];
      /* All three per-item writes (mark rejected, refund balance, log credit)
       are committed in one atomic transaction — no partial refund state. */
      await db.transaction(async (tx) => {
        for (const txId of ids) {
          const [txn] = await tx
            .select()
            .from(walletTransactionsTable)
            .where(eq(walletTransactionsTable.id, txId))
            .limit(1);
          if (!txn) {
            throw Object.assign(new Error(`Withdrawal request not found: ${txId}`), {
              status: 404,
            });
          }
          if (txn.reference && txn.reference !== "pending") {
            throw Object.assign(
              new Error(`Withdrawal ${txId} is already processed (status: ${txn.reference})`),
              { status: 409 }
            );
          }
          const amt = parseFloat(String(txn.amount));
          await tx
            .update(walletTransactionsTable)
            .set({ reference: `rejected:${rejReason}` })
            .where(eq(walletTransactionsTable.id, txId));
          await tx
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${amt}`, updatedAt: new Date() })
            .where(eq(usersTable.id, txn.userId));
          await tx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: txn.userId,
            type: "credit",
            amount: amt.toFixed(2),
            description: `Withdrawal Refunded — ${rejReason}`,
            reference: `refund:${txId}`,
            paymentMethod: null,
          });
          rejectedItems.push({ txId, userId: txn.userId, amt });
        }
      });
      /* Notifications are best-effort — sent after commit so a notif failure
       never rolls back an already-committed refund. */
      for (const item of rejectedItems) {
        const batchRejLang = await getUserLanguage(item.userId);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId: item.userId,
            title: t("notifWithdrawalRejected" as TranslationKey, batchRejLang),
            body: t("notifWithdrawalRejectedBody" as TranslationKey, batchRejLang)
              .replace("{amount}", item.amt.toFixed(0))
              .replace("{reason}", rejReason),
            type: "wallet",
            icon: "close-circle-outline",
          })
          .catch((err: unknown) => {
            logger.warn(
              { err: err instanceof Error ? err.message : String(err), txId: item.txId },
              "[wallets] batch-reject notification insert failed"
            );
          });
      }
      sendSuccess(res, { rejected: rejectedItems.map((i) => i.txId) });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ── GET /admin/deposit-requests — List deposit requests with offset pagination ─── */
router.get("/deposit-requests", requirePermission("finance.deposits.review"), async (req, res) => {
  try {
    const statusFilter = req.query["status"] as string | undefined;
    const pageNum = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10) || 50)
    );
    const offset = (pageNum - 1) * pageSize;

    /* Build status-aware WHERE clause so we can count + paginate at DB level. */
    type DepositRow = typeof walletTransactionsTable.$inferSelect;
    const statusToRefPattern: Record<string, string> = {
      pending: "pending",
      approved: "approved:",
      rejected: "rejected:",
    };

    /* Count total matching rows first (cheap — no JOIN needed yet). */
    let baseWhere = eq(walletTransactionsTable.type, "deposit");
    if (statusFilter && statusFilter in statusToRefPattern) {
      const pattern = statusToRefPattern[statusFilter]!;
      if (pattern === "pending") {
        baseWhere = and(
          baseWhere,
          sql`(${walletTransactionsTable.reference} = 'pending' OR ${walletTransactionsTable.reference} IS NULL OR ${walletTransactionsTable.reference} LIKE 'pending:%')`
        ) as typeof baseWhere;
      } else {
        baseWhere = and(
          baseWhere,
          sql`${walletTransactionsTable.reference} LIKE ${pattern + "%"}`
        ) as typeof baseWhere;
      }
    }

    const [{ total }] = await db
      .select({ total: count() })
      .from(walletTransactionsTable)
      .where(baseWhere);

    /* Fetch the current page, JOIN users to eliminate N+1 queries. */
    const rows = await db
      .select({
        tx: walletTransactionsTable,
        uid: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        roles: usersTable.roles,
      })
      .from(walletTransactionsTable)
      .leftJoin(usersTable, eq(walletTransactionsTable.userId, usersTable.id))
      .where(baseWhere)
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(pageSize)
      .offset(offset);

    const deposits = rows.map(({ tx, uid, name, phone, roles }) => {
      const ref = (tx as DepositRow).reference ?? "pending";
      const isPending = ref === "pending" || ref.startsWith("pending:");
      const status = isPending
        ? "pending"
        : ref.startsWith("approved:")
          ? "approved"
          : ref.startsWith("rejected:")
            ? "rejected"
            : ref;
      const refNo =
        ref.startsWith("approved:") || ref.startsWith("rejected:")
          ? ref.split(":").slice(1).join(":")
          : "";
      return {
        ...tx,
        amount: parseFloat(String(tx.amount)),
        user: uid ? { id: uid, name, phone, roles } : null,
        status,
        refNo,
      };
    });

    sendSuccess(res, {
      deposits,
      total: total ?? 0,
      page: pageNum,
      pageSize,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── PATCH /admin/deposit-requests/:id/approve — Approve a rider deposit (credits wallet, atomic) ─── */
router.patch(
  "/deposit-requests/:id/approve",
  requirePermission("finance.deposits.review"),
  async (req, res) => {
    try {
      const { refNo, note: _note } = req.body;
      const txId = req.params["id"] as string;

      const [tx] = await db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.id, txId))
        .limit(1);
      if (!tx) {
        sendNotFound(res, "Deposit not found");
        return;
      }
      if (tx.type !== "deposit") {
        sendValidationError(res, "Not a deposit record");
        return;
      }

      const amt = parseFloat(String(tx.amount));
      const txidSuffix =
        tx.reference && tx.reference.includes("txid:")
          ? `:${tx.reference.split("txid:").pop()}`
          : "";

      if (txidSuffix) {
        const dupes = await db
          .select({ id: walletTransactionsTable.id })
          .from(walletTransactionsTable)
          .where(
            and(
              eq(walletTransactionsTable.type, "deposit"),
              sql`${walletTransactionsTable.reference} LIKE ${"%approved%" + txidSuffix}`,
              sql`RIGHT(${walletTransactionsTable.reference}, ${txidSuffix.length}) = ${txidSuffix}`
            )
          )
          .limit(1);
        if (dupes.length > 0) {
          sendError(res, "A deposit with this Transaction ID has already been approved", 409);
          return;
        }
      }
      const approvedRef = refNo
        ? `approved:${refNo.trim()}${txidSuffix}`
        : `approved:manual${txidSuffix}`;

      const depApprSettings = await getCachedSettings();
      const maxBalance = parseFloat(depApprSettings["wallet_max_balance"] ?? "50000");

      /* Fully atomic: conditional state-transition + wallet credit in ONE transaction.
     If the conditional update hits 0 rows (already processed), transaction rolls back
     and we return 409. No double-credit or orphaned approval possible. */
      let approved = false;
      try {
        await db.transaction(async (trx) => {
          const [marked] = await trx
            .update(walletTransactionsTable)
            .set({ reference: approvedRef })
            .where(
              and(
                eq(walletTransactionsTable.id, txId),
                sql`(${walletTransactionsTable.reference} = 'pending' OR ${walletTransactionsTable.reference} LIKE 'pending:%')`
              )
            )
            .returning({ id: walletTransactionsTable.id });
          if (!marked) throw new Error("ALREADY_PROCESSED");
          const [credited] = await trx
            .update(usersTable)
            .set({
              walletBalance: sql`wallet_balance + ${amt}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(usersTable.id, tx.userId),
                sql`CAST(wallet_balance AS numeric) + ${amt} <= ${maxBalance}`
              )
            )
            .returning({ id: usersTable.id });
          if (!credited) throw new Error("BALANCE_CAP_EXCEEDED");
        });
        approved = true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "ALREADY_PROCESSED") {
          const [current] = await db
            .select({ reference: walletTransactionsTable.reference })
            .from(walletTransactionsTable)
            .where(eq(walletTransactionsTable.id, txId))
            .limit(1);
          sendError(
            res,
            `Deposit already processed (${current?.reference ?? "unknown state"})`,
            409
          );
          return;
        }
        if (msg === "BALANCE_CAP_EXCEEDED") {
          sendValidationError(
            res,
            `Wallet balance limit is Rs. ${maxBalance}. Deposit would exceed the limit.`
          );
          return;
        }
        throw err;
      }

      if (!approved) return;
      const depApprLang = await getUserLanguage(tx.userId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: tx.userId,
          title: t("notifDepositCredited", depApprLang),
          body: t("notifDepositCreditedBody", depApprLang).replace("{amount}", amt.toFixed(0)),
          type: "wallet",
          icon: "wallet-outline",
        })
        .catch((e: unknown) =>
          logger.warn(
            {
              message: "[wallets] deposit approval notif failed",
              error: e instanceof Error ? e.message : String(e),
              code: "WALLET_NOTIF_DEPOSIT_APPROVAL_FAILED",
              correlationId: null,
              timestamp: new Date().toISOString(),
            },
            "[wallets] deposit approval notif failed"
          )
        );
      const fleetIo = getIO();
      if (fleetIo)
        fleetIo.to("admin-fleet").emit("wallet:deposit-approved", {
          txId,
          userId: tx.userId,
          amount: amt,
        });
      sendSuccess(res, { txId, status: "approved", credited: amt });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ── PATCH /admin/deposit-requests/:id/reject — Reject a rider deposit (atomic state transition) ─── */
router.patch(
  "/deposit-requests/:id/reject",
  requirePermission("finance.deposits.review"),
  async (req, res) => {
    try {
      const { reason } = req.body;
      const txId = req.params["id"] as string;

      /* Verify type first (cheap read) */
      const [tx] = await db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.id, txId))
        .limit(1);
      if (!tx) {
        sendNotFound(res, "Deposit not found");
        return;
      }
      if (tx.type !== "deposit") {
        sendValidationError(res, "Not a deposit record");
        return;
      }

      const rejReason = reason?.trim() || "Admin rejected";
      const txidSuffix =
        tx.reference && tx.reference.includes("txid:")
          ? `:${tx.reference.split("txid:").pop()}`
          : "";

      const [marked] = await db
        .update(walletTransactionsTable)
        .set({ reference: `rejected:${rejReason}${txidSuffix}` })
        .where(
          and(
            eq(walletTransactionsTable.id, txId),
            sql`(${walletTransactionsTable.reference} = 'pending' OR ${walletTransactionsTable.reference} LIKE 'pending:%')`
          )
        )
        .returning({ id: walletTransactionsTable.id });

      if (!marked) {
        const [current] = await db
          .select({ reference: walletTransactionsTable.reference })
          .from(walletTransactionsTable)
          .where(eq(walletTransactionsTable.id, txId))
          .limit(1);
        sendError(res, `Deposit already processed (${current?.reference ?? "unknown state"})`, 409);
        return;
      }

      const amt = parseFloat(String(tx.amount));
      const depRejLang = await getUserLanguage(tx.userId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: tx.userId,
          title: t("notifDepositRejected", depRejLang),
          body: t("notifDepositRejectedBody", depRejLang)
            .replace("{amount}", amt.toFixed(0))
            .replace("{reason}", rejReason),
          type: "wallet",
          icon: "close-circle-outline",
        })
        .catch((e: unknown) =>
          logger.warn(
            {
              message: "[wallets] deposit rejection notif failed",
              error: e instanceof Error ? e.message : String(e),
              code: "WALLET_NOTIF_DEPOSIT_REJECTION_FAILED",
              correlationId: null,
              timestamp: new Date().toISOString(),
            },
            "[wallets] deposit rejection notif failed"
          )
        );
      sendSuccess(res, { txId, status: "rejected", reason: rejReason });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ── POST /admin/deposit-requests/bulk-approve — Bulk approve customer pending deposits (all-or-nothing atomic) ─── */
router.post(
  "/deposit-requests/bulk-approve",
  requirePermission("finance.deposits.review"),
  async (req, res) => {
    try {
      const { ids, refNo } = req.body as { ids: string[]; refNo?: string };
      if (!Array.isArray(ids) || ids.length === 0) {
        sendValidationError(res, "ids array is required");
        return;
      }
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length > 50) {
        sendValidationError(res, "Maximum 50 deposits per bulk action");
        return;
      }

      const preChecked: {
        tx: typeof walletTransactionsTable.$inferSelect;
        amt: number;
        approvedRef: string;
      }[] = [];
      for (const txId of uniqueIds) {
        const [tx] = await db
          .select()
          .from(walletTransactionsTable)
          .where(eq(walletTransactionsTable.id, txId))
          .limit(1);
        if (!tx) {
          sendValidationError(res, `Deposit ${txId} not found`);
          return;
        }
        if (tx.type !== "deposit") {
          sendValidationError(res, `${txId} is not a deposit record`);
          return;
        }
        const ref = tx.reference ?? "pending";
        const isPending = ref === "pending" || ref.startsWith("pending:");
        if (!isPending) {
          sendError(res, `Deposit ${txId} already processed (${ref})`, 409);
          return;
        }
        const [user] = await db
          .select({ roles: usersTable.roles })
          .from(usersTable)
          .where(eq(usersTable.id, tx.userId))
          .limit(1);
        if (!user) {
          sendValidationError(res, `User not found for deposit ${txId}`);
          return;
        }
        if (!(user.roles ?? "customer").includes("customer")) {
          sendValidationError(
            res,
            `Deposit ${txId} belongs to a ${user.roles}, not a customer. Bulk actions are for customer deposits only.`
          );
          return;
        }
        const amt = parseFloat(String(tx.amount));
        if (!Number.isFinite(amt) || amt <= 0) {
          sendValidationError(res, `Invalid amount for deposit ${txId}`);
          return;
        }
        const txidSuffix =
          tx.reference && tx.reference.includes("txid:")
            ? `:${tx.reference.split("txid:").pop()}`
            : "";
        const approvedRef = refNo
          ? `approved:${refNo.trim()}${txidSuffix}`
          : `approved:manual${txidSuffix}`;
        preChecked.push({ tx, amt, approvedRef });
      }

      const bulkApprSettings = await getCachedSettings();
      const maxBalance = parseFloat(bulkApprSettings["wallet_max_balance"] ?? "50000");

      try {
        await db.transaction(async (trx) => {
          for (const { tx, amt, approvedRef } of preChecked) {
            const [marked] = await trx
              .update(walletTransactionsTable)
              .set({ reference: approvedRef })
              .where(
                and(
                  eq(walletTransactionsTable.id, tx.id),
                  sql`(${walletTransactionsTable.reference} = 'pending' OR ${walletTransactionsTable.reference} LIKE 'pending:%')`
                )
              )
              .returning({ id: walletTransactionsTable.id });
            if (!marked) throw new Error(`Deposit ${tx.id} was already processed (race condition)`);
            const [credited] = await trx
              .update(usersTable)
              .set({
                walletBalance: sql`wallet_balance + ${amt}`,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(usersTable.id, tx.userId),
                  sql`CAST(wallet_balance AS numeric) + ${amt} <= ${maxBalance}`
                )
              )
              .returning({ id: usersTable.id });
            if (!credited)
              throw new Error(
                `Deposit ${tx.id}: wallet balance limit (Rs. ${maxBalance}) would be exceeded`
              );
          }
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendError(res, msg, 409);
        return;
      }

      for (const { tx, amt } of preChecked) {
        const bulkApprLang = await getUserLanguage(tx.userId);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId: tx.userId,
            title: t("notifDepositCredited", bulkApprLang),
            body: t("notifDepositCreditedBody", bulkApprLang).replace("{amount}", amt.toFixed(0)),
            type: "wallet",
            icon: "wallet-outline",
          })
          .catch((e: unknown) =>
            logger.warn(
              {
                message: "[wallets] bulk deposit approval notif failed",
                error: e instanceof Error ? e.message : String(e),
                code: "WALLET_NOTIF_BULK_APPROVAL_FAILED",
                correlationId: null,
                timestamp: new Date().toISOString(),
              },
              "[wallets] bulk deposit approval notif failed"
            )
          );
      }

      sendSuccess(res, { approved: preChecked.length });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ── POST /admin/deposit-requests/bulk-reject — Bulk reject customer pending deposits (all-or-nothing atomic) ─── */
router.post(
  "/deposit-requests/bulk-reject",
  requirePermission("finance.deposits.review"),
  async (req, res) => {
    try {
      const { ids, reason } = req.body as { ids: string[]; reason: string };
      if (!Array.isArray(ids) || ids.length === 0) {
        sendValidationError(res, "ids array is required");
        return;
      }
      if (!reason?.trim()) {
        sendValidationError(res, "reason is required");
        return;
      }
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length > 50) {
        sendValidationError(res, "Maximum 50 deposits per bulk action");
        return;
      }

      const rejReason = reason.trim();

      const preChecked: {
        tx: typeof walletTransactionsTable.$inferSelect;
        rejRef: string;
      }[] = [];
      for (const txId of uniqueIds) {
        const [tx] = await db
          .select()
          .from(walletTransactionsTable)
          .where(eq(walletTransactionsTable.id, txId))
          .limit(1);
        if (!tx) {
          sendValidationError(res, `Deposit ${txId} not found`);
          return;
        }
        if (tx.type !== "deposit") {
          sendValidationError(res, `${txId} is not a deposit record`);
          return;
        }
        const ref = tx.reference ?? "pending";
        const isPending = ref === "pending" || ref.startsWith("pending:");
        if (!isPending) {
          sendError(res, `Deposit ${txId} already processed (${ref})`, 409);
          return;
        }
        const [user] = await db
          .select({ roles: usersTable.roles })
          .from(usersTable)
          .where(eq(usersTable.id, tx.userId))
          .limit(1);
        if (!user) {
          sendValidationError(res, `User not found for deposit ${txId}`);
          return;
        }
        if (!(user.roles ?? "customer").includes("customer")) {
          sendValidationError(
            res,
            `Deposit ${txId} belongs to a ${user.roles}, not a customer. Bulk actions are for customer deposits only.`
          );
          return;
        }
        const txidSuffix =
          tx.reference && tx.reference.includes("txid:")
            ? `:${tx.reference.split("txid:").pop()}`
            : "";
        preChecked.push({ tx, rejRef: `rejected:${rejReason}${txidSuffix}` });
      }

      try {
        await db.transaction(async (trx) => {
          for (const { tx, rejRef } of preChecked) {
            const [marked] = await trx
              .update(walletTransactionsTable)
              .set({ reference: rejRef })
              .where(
                and(
                  eq(walletTransactionsTable.id, tx.id),
                  sql`(${walletTransactionsTable.reference} = 'pending' OR ${walletTransactionsTable.reference} LIKE 'pending:%')`
                )
              )
              .returning({ id: walletTransactionsTable.id });
            if (!marked) throw new Error(`Deposit ${tx.id} was already processed (race condition)`);
          }
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendError(res, msg, 409);
        return;
      }

      for (const { tx } of preChecked) {
        const amt = parseFloat(String(tx.amount));
        const bulkRejLang = await getUserLanguage(tx.userId);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId: tx.userId,
            title: t("notifDepositRejected", bulkRejLang),
            body: t("notifDepositRejectedBody", bulkRejLang)
              .replace("{amount}", amt.toFixed(0))
              .replace("{reason}", rejReason),
            type: "wallet",
            icon: "close-circle-outline",
          })
          .catch((e: unknown) =>
            logger.warn(
              {
                message: "[wallets] bulk deposit rejection notif failed",
                error: e instanceof Error ? e.message : String(e),
                code: "WALLET_NOTIF_BULK_REJECTION_FAILED",
                correlationId: null,
                timestamp: new Date().toISOString(),
              },
              "[wallets] bulk deposit rejection notif failed"
            )
          );
      }

      sendSuccess(res, { rejected: preChecked.length });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ── POST /admin/riders/:id/credit ─────────── */
router.post("/riders/:id/credit", requirePermission("finance.wallet.adjust"), async (req, res) => {
  try {
    const { amount, description, type } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      sendValidationError(res, "Valid amount required");
      return;
    }
    const [rider] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.params["id"] as string))
      .limit(1);
    if (!rider) {
      sendNotFound(res, "Rider not found");
      return;
    }
    const roles = (rider.roles || "").split(",").map((r: string) => r.trim());
    if (!roles.includes("rider")) {
      sendValidationError(res, "User is not a rider");
      return;
    }
    const amt = Number(amount);
    const txType = type === "bonus" ? "bonus" : "credit";

    const creditSettings = await getCachedSettings();
    const maxBalance = parseFloat(creditSettings["wallet_max_balance"] ?? "50000");

    let updated: typeof usersTable.$inferSelect | undefined;
    try {
      await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, rider.id))
          .limit(1)
          .for("update");
        if (!locked) throw new Error("NOT_FOUND");
        const currentBal = parseFloat(locked.walletBalance ?? "0");
        if (currentBal + amt > maxBalance) throw new Error("BALANCE_CAP");
        const [txUpdated] = await tx
          .update(usersTable)
          .set({
            walletBalance: sql`wallet_balance + ${amt}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(usersTable.id, rider.id),
              sql`CAST(wallet_balance AS numeric) + ${amt} <= ${maxBalance}`
            )
          )
          .returning();
        if (!txUpdated) throw new Error("BALANCE_CAP");
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId: rider.id,
          type: txType,
          amount: String(amt),
          description: description || `Admin credit: Rs. ${amt}`,
          reference: txType === "bonus" ? "rider_bonus" : "admin_credit",
        });
        updated = txUpdated;
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "BALANCE_CAP") {
        sendValidationError(
          res,
          `Wallet balance limit is Rs. ${maxBalance}. Credit would exceed the limit.`
        );
        return;
      }
      throw err;
    }
    await sendUserNotification(
      rider.id,
      txType === "bonus" ? "Bonus Received! 🎉" : "Wallet Credited 💰",
      `Rs. ${amt} aapke wallet mein add ho gaya. ${description || ""}`,
      "wallet",
      "wallet-outline"
    );
    sendSuccess(res, {
      amount: amt,
      newBalance: parseFloat(updated?.walletBalance ?? "0"),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});
const vendorCommissionSchema = z.object({
  commissionPct: z
    .number()
    .min(0, "Commission must be between 0 and 100")
    .max(100, "Commission must be between 0 and 100")
    .multipleOf(0.01, "Commission supports up to 2 decimal places"),
});

router.patch(
  "/vendors/:id/commission",
  requirePermission("finance.wallet.adjust"),
  validateBody(vendorCommissionSchema),
  async (req, res) => {
    try {
      const { commissionPct } = req.body as { commissionPct: number };
      const [vendor] = await db
        .update(usersTable)
        .set({
          commissionOverride: String(commissionPct),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, req.params["id"] as string))
        .returning();
      if (!vendor) {
        sendNotFound(res, "Vendor not found");
        return;
      }
      void addAuditEntry({
        action: "vendor_commission_override",
        ip: getClientIp(req),
        adminId: (req as AdminRequest).adminId,
        details: `Commission override ${commissionPct}% for vendor ${req.params["id"] as string}`,
        result: "success",
      });
      sendSuccess(res, { commissionPct });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ── POST /admin/riders/:id/override-suspension — override auto-suspension ── */
router.post("/riders/:id/override-suspension", async (req, res) => {
  try {
    const userId = req.params["id"] as string;
    const [user] = await db
      .select({
        id: usersTable.id,
        autoSuspendedAt: usersTable.autoSuspendedAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "Rider not found");
      return;
    }
    if (!user.autoSuspendedAt) {
      sendValidationError(res, "Rider was not auto-suspended");
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({
        isActive: true,
        adminOverrideSuspension: true,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .returning();

    await db
      .insert(notificationsTable)
      .values({
        id: generateId(),
        userId,
        title: "Suspension Overridden",
        body: "An admin has reviewed and overridden your account suspension. You are now active again.",
        type: "system",
        icon: "shield-checkmark-outline",
      })
      .catch((err: unknown) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), userId },
          "[wallets] rider override-suspension notification insert failed"
        );
      });

    sendSuccess(res, { user: stripUser(updated!) });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ── POST /admin/vendors/:id/override-suspension — override auto-suspension ─ */
router.post(
  "/vendors/:id/override-suspension",
  requirePermission("vendors.edit"),
  async (req, res) => {
    try {
      const userId = req.params["id"] as string;
      const [user] = await db
        .select({
          id: usersTable.id,
          autoSuspendedAt: usersTable.autoSuspendedAt,
        })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) {
        sendNotFound(res, "Vendor not found");
        return;
      }
      if (!user.autoSuspendedAt) {
        sendValidationError(res, "Vendor was not auto-suspended");
        return;
      }

      const [updated] = await db
        .update(usersTable)
        .set({
          isActive: true,
          adminOverrideSuspension: true,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId))
        .returning();

      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId,
          title: "Suspension Overridden",
          body: "An admin has reviewed and overridden your store suspension. You are now active again.",
          type: "system",
          icon: "shield-checkmark-outline",
        })
        .catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), userId },
            "[wallets] vendor override-suspension notification insert failed"
          );
        });

      sendSuccess(res, { user: stripUser(updated!) });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
