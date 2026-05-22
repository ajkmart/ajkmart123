import { db } from "@workspace/db";
import {
  accountConditionsTable,
  accountRecoveryTokensTable,
  notificationsTable,
  ordersTable,
  otpAttemptsTable,
  otpTokensTable,
  parcelBookingsTable,
  pharmacyOrdersTable,
  refreshTokensTable,
  riderProfilesTable,
  ridesTable,
  userSessionsTable,
  usersTable,
  vendorProfilesTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import crypto from "crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { Router } from "express";
import {
  sendError,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../../../lib/response.js";
import { getIO } from "../../../lib/socketio.js";
import { requirePermission } from "../../../middleware/require-permission.js";
import { writeAuthAuditLog } from "../../../middleware/security.js";
import { AuditService } from "../../../services/admin-audit.service.js";
import { FinanceService } from "../../../services/admin-finance.service.js";
import { UserService } from "../../../services/admin-user.service.js";
import {
  addAuditEntry,
  generateId,
  getClientIp,
  getUserLanguage,
  logger,
  revokeAllUserSessions,
  sendUserNotification,
  stripUser,
  t,
  type AdminRequest,
} from "../../admin-shared.js";
import { reconcileUserFlags } from "../conditions.js";
const router = Router();

router.post("/users", requirePermission("users.create"), async (req, res) => {
  const adminReq = req as AdminRequest;
  const { phone, name, role, city, area, email, username, tempPassword } = req.body;

  try {
    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: adminReq.adminIp || getClientIp(req),
        action: "user_create",
        resourceType: "user",
        resource: phone || name || "new_user",
        details: `Role: ${role || "customer"}`,
      },
      () =>
        UserService.createUser({
          phone,
          email,
          name,
          username,
          role,
          city,
          area,
          tempPassword,
        })
    );

    // Fetch the created user by userId, falling back to email lookup
    let user: typeof usersTable.$inferSelect | undefined;
    if (result.userId) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.id, result.userId)).limit(1);
    } else if (email) {
      [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email.trim().toLowerCase()))
        .limit(1);
    }
    if (!user) {
      logger.error({ result }, "[admin/users] user created but could not be fetched");
      sendError(
        res,
        "User was created but could not be retrieved. Please refresh the user list.",
        500
      );
      return;
    }
    sendSuccess(res, { user: stripUser(user) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, "[admin/users] create user failed");
    if (message.includes("duplicate") || message.includes("already exists")) {
      sendError(res, "A user with these details already exists.", 409);
    } else if (message.includes("Invalid") || message.includes("weak")) {
      sendValidationError(res, "Password does not meet security requirements.");
    } else {
      sendError(res, "An internal error occurred", 500);
    }
  }
});

/* GET /admin/users/search?q=...&limit=20
   Lightweight server-side user search used by OTP Control and other admin tools.
   Returns users matching name or phone query (partial, case-insensitive). */
router.get("/users/search", requirePermission("users.view"), async (req, res) => {
  const q = ((req.query?.q as string) ?? "").trim();
  const limitN = Math.min(50, Math.max(1, parseInt((req.query?.limit as string) ?? "20", 10)));

  try {
    const where = and(
      isNull(usersTable.deletedAt),
      q ? or(ilike(usersTable.name, `%${q}%`), ilike(usersTable.phone, `%${q}%`)) : undefined
    );

    const rows = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        role: usersTable.roles,
        otpBypassUntil: sql<string | null>`${usersTable}.otp_bypass_until`,
      })
      .from(usersTable)
      .where(where)
      .orderBy(asc(usersTable.name))
      .limit(limitN);

    sendSuccess(res, { users: rows, total: rows.length });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] search failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* GET /admin/users/search-riders?q=...&limit=20&onlineOnly=true
   Lightweight server-side rider search used by RideDetailModal for reassignment.
   Returns only active, non-rejected riders matching the search query.
   Pass onlineOnly=true to restrict to riders currently online (matches reassign constraints). */
router.get("/users/search-riders", requirePermission("users.view"), async (req, res) => {
  const q = ((req.query?.q as string) ?? "").trim();
  const limitN = Math.min(50, Math.max(1, parseInt((req.query?.limit as string) ?? "20", 10)));
  const onlineOnly = (req.query?.onlineOnly as string) === "true";

  try {
    const conditions = [
      isNull(usersTable.deletedAt) as ReturnType<typeof eq>,
      ilike(usersTable.roles, "%rider%") as ReturnType<typeof eq>,
      eq(usersTable.isActive, true),
      ne(usersTable.approvalStatus, "rejected"),
    ];
    if (onlineOnly) {
      conditions.push(eq(usersTable.isOnline, true) as ReturnType<typeof eq>);
    }
    if (q) {
      conditions.push(
        or(ilike(usersTable.name, `%${q}%`), ilike(usersTable.phone, `%${q}%`))! as ReturnType<
          typeof eq
        >
      );
    }
    const riders = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        isOnline: usersTable.isOnline,
        approvalStatus: usersTable.approvalStatus,
      })
      .from(usersTable)
      .where(and(...conditions))
      .orderBy(asc(usersTable.name))
      .limit(limitN);
    sendSuccess(res, { riders, total: riders.length });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] search-riders failed");
    sendError(res, "An internal error occurred", 500);
  }
});

router.get("/users", requirePermission("users.view"), async (req, res) => {
  const filter = (req.query?.filter as string) ?? "";
  const conditionTier = (req.query?.conditionTier as string) ?? "";
  const search = ((req.query?.search as string) ?? "").trim();
  const role = ((req.query?.role as string) ?? "").trim().toLowerCase();
  const status = ((req.query?.status as string) ?? "").trim().toLowerCase();
  const dateFrom = ((req.query?.dateFrom as string) ?? "").trim();
  const dateTo = ((req.query?.dateTo as string) ?? "").trim();
  const rawPage = parseInt((req.query?.page as string) ?? "1", 10);
  const rawLimit = parseInt((req.query?.limit as string) ?? "50", 10);
  const pageNum = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  const pageSize = Math.min(200, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));

  const conditions: SQL[] = [isNull(usersTable.deletedAt)];

  if (filter === "2fa_enabled") {
    conditions.push(eq(usersTable.totpEnabled, true));
  }
  if (search) {
    conditions.push(
      or(
        ilike(usersTable.name, `%${search}%`),
        ilike(usersTable.email, `%${search}%`),
        ilike(usersTable.phone, `%${search}%`),
        ilike(usersTable.username, `%${search}%`)
      )!
    );
  }
  if (role) {
    conditions.push(ilike(usersTable.roles, `%${role}%`));
  }
  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    if (!isNaN(fromDate.getTime())) conditions.push(gte(usersTable.createdAt, fromDate));
  }
  if (dateTo) {
    const toDate = new Date(dateTo + "T23:59:59");
    if (!isNaN(toDate.getTime())) conditions.push(lte(usersTable.createdAt, toDate));
  }
  if (status === "active") {
    conditions.push(and(eq(usersTable.isActive, true), eq(usersTable.isBanned, false))!);
  } else if (status === "blocked") {
    conditions.push(and(eq(usersTable.isActive, false), eq(usersTable.isBanned, false))!);
  } else if (status === "banned") {
    conditions.push(eq(usersTable.isBanned, true));
  }

  // DB-level conditionTier filter: build a subquery condition so pagination happens in PostgreSQL
  if (conditionTier === "has_conditions") {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${accountConditionsTable} WHERE ${accountConditionsTable.userId} = ${usersTable.id} AND ${accountConditionsTable.isActive} = true)`
    );
  } else if (conditionTier === "clean") {
    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM ${accountConditionsTable} WHERE ${accountConditionsTable.userId} = ${usersTable.id} AND ${accountConditionsTable.isActive} = true)`
    );
  } else if (conditionTier === "warnings") {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${accountConditionsTable} ac WHERE ac.user_id = ${usersTable.id} AND ac.is_active = true GROUP BY ac.user_id HAVING MAX(CASE ac.severity::text WHEN 'ban' THEN 5 WHEN 'suspension' THEN 4 WHEN 'restriction_strict' THEN 3 WHEN 'restriction_normal' THEN 2 WHEN 'warning' THEN 1 ELSE 0 END) = 1)`
    );
  } else if (conditionTier === "restrictions") {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${accountConditionsTable} ac WHERE ac.user_id = ${usersTable.id} AND ac.is_active = true GROUP BY ac.user_id HAVING MAX(CASE ac.severity::text WHEN 'ban' THEN 5 WHEN 'suspension' THEN 4 WHEN 'restriction_strict' THEN 3 WHEN 'restriction_normal' THEN 2 WHEN 'warning' THEN 1 ELSE 0 END) IN (2, 3))`
    );
  } else if (conditionTier === "suspensions") {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${accountConditionsTable} ac WHERE ac.user_id = ${usersTable.id} AND ac.is_active = true GROUP BY ac.user_id HAVING MAX(CASE ac.severity::text WHEN 'ban' THEN 5 WHEN 'suspension' THEN 4 WHEN 'restriction_strict' THEN 3 WHEN 'restriction_normal' THEN 2 WHEN 'warning' THEN 1 ELSE 0 END) = 4)`
    );
  } else if (conditionTier === "bans") {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${accountConditionsTable} ac WHERE ac.user_id = ${usersTable.id} AND ac.is_active = true GROUP BY ac.user_id HAVING MAX(CASE ac.severity::text WHEN 'ban' THEN 5 WHEN 'suspension' THEN 4 WHEN 'restriction_strict' THEN 3 WHEN 'restriction_normal' THEN 2 WHEN 'warning' THEN 1 ELSE 0 END) = 5)`
    );
  }

  // Rebuild whereClause now that conditionTier conditions are included
  const finalWhere = conditions.length > 0 ? and(...conditions) : undefined;
  const rawSortKey = ((req.query?.sortKey as string) ?? "joined").trim();
  const rawSortDir = ((req.query?.sortDir as string) ?? "desc").trim().toLowerCase();
  const sortDir2 = rawSortDir === "asc" ? "asc" : "desc";
  const sortOrder = (() => {
    const dir = <T>(col: T) =>
      sortDir2 === "asc"
        ? asc(col as Parameters<typeof asc>[0])
        : desc(col as Parameters<typeof desc>[0]);
    if (rawSortKey === "name") return [dir(usersTable.name), dir(usersTable.createdAt)];
    if (rawSortKey === "wallet") return [dir(usersTable.walletBalance), dir(usersTable.createdAt)];
    if (rawSortKey === "status")
      return [dir(usersTable.isBanned), dir(usersTable.isActive), dir(usersTable.createdAt)];
    return [dir(usersTable.createdAt)];
  })();

  const finalBaseQuery = db
    .select({
      user: usersTable,
      vendorProfile: vendorProfilesTable,
      riderProfile: riderProfilesTable,
    })
    .from(usersTable)
    .leftJoin(vendorProfilesTable, eq(usersTable.id, vendorProfilesTable.userId))
    .leftJoin(riderProfilesTable, eq(usersTable.id, riderProfilesTable.userId))
    .where(finalWhere)
    .orderBy(...(sortOrder as [ReturnType<typeof asc>]));

  try {
    const globalStatsQuery = db
      .select({
        totalAll: count(),
        totalActive: sql<number>`COUNT(*) FILTER (WHERE ${usersTable.isActive} = true AND ${usersTable.isBanned} = false)::int`,
        totalBanned: sql<number>`COUNT(*) FILTER (WHERE ${usersTable.isBanned} = true)::int`,
        totalBlocked: sql<number>`COUNT(*) FILTER (WHERE ${usersTable.isActive} = false AND ${usersTable.isBanned} = false)::int`,
      })
      .from(usersTable)
      .where(isNull(usersTable.deletedAt));

    const condCounts = await db
      .select({
        userId: accountConditionsTable.userId,
        activeCount: count(),
        maxSeverity: sql<string>`MAX(CASE ${accountConditionsTable.severity}::text WHEN 'ban' THEN 5 WHEN 'suspension' THEN 4 WHEN 'restriction_strict' THEN 3 WHEN 'restriction_normal' THEN 2 WHEN 'warning' THEN 1 ELSE 0 END)`,
        maxSeverityLabel: sql<string>`(ARRAY['warning','warning','restriction_normal','restriction_strict','suspension','ban'])[1 + MAX(CASE ${accountConditionsTable.severity}::text WHEN 'ban' THEN 5 WHEN 'suspension' THEN 4 WHEN 'restriction_strict' THEN 3 WHEN 'restriction_normal' THEN 2 WHEN 'warning' THEN 1 ELSE 0 END)]`,
      })
      .from(accountConditionsTable)
      .where(eq(accountConditionsTable.isActive, true))
      .groupBy(accountConditionsTable.userId);

    const condMap = new Map(
      condCounts.map((c) => [
        c.userId,
        { count: Number(c.activeCount), maxSeverity: c.maxSeverityLabel },
      ])
    );

    const enrich = (rows: Awaited<typeof finalBaseQuery>) =>
      rows.map(({ user: u, vendorProfile, riderProfile }) => ({
        ...stripUser(u),
        roles: (u.roles ?? "customer")
          .split(",")
          .map((r: string) => r.trim())
          .filter(Boolean),
        walletBalance: parseFloat(u.walletBalance ?? "0"),
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        conditionCount: condMap.get(u.id)?.count || 0,
        maxConditionSeverity: condMap.get(u.id)?.maxSeverity || null,
        isMpinLocked: !!(u.walletPinLockedUntil && u.walletPinLockedUntil.getTime() > Date.now()),
        hasMpin: !!u.walletPinHash,
        vendorProfile:
          vendorProfile?.userId != null
            ? {
                storeName: vendorProfile.storeName,
                businessType: vendorProfile.businessType,
                businessName: vendorProfile.businessName,
                ntn: vendorProfile.ntn,
                storeCategory: vendorProfile.storeCategory,
                storeIsOpen: vendorProfile.storeIsOpen,
              }
            : null,
        riderProfile:
          riderProfile?.userId != null
            ? {
                vehicleType: riderProfile.vehicleType,
                vehiclePlate: riderProfile.vehiclePlate,
                drivingLicense: riderProfile.drivingLicense,
                vehicleRegNo: riderProfile.vehicleRegNo,
                documents: riderProfile.documents,
              }
            : null,
      }));

    // Pure DB pagination: COUNT query + paginated fetch + global stats run in parallel
    const [countResult, rows, [globalStats]] = await Promise.all([
      db.select({ total: count() }).from(usersTable).where(finalWhere),
      finalBaseQuery.limit(pageSize).offset((pageNum - 1) * pageSize),
      globalStatsQuery,
    ]);
    const total = Number(countResult[0]?.total ?? 0);
    const enrichedUsers = enrich(rows);
    sendSuccess(res, {
      users: enrichedUsers,
      total,
      page: pageNum,
      pageSize,
      activeCount: Number(globalStats?.totalActive ?? 0),
      bannedCount: Number(globalStats?.totalBanned ?? 0),
      blockedCount: Number(globalStats?.totalBlocked ?? 0),
      totalCount: Number(globalStats?.totalAll ?? 0),
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] list users failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── PATCH /admin/users/bulk-ban — ban/unban multiple users ── */
router.patch("/users/bulk-ban", requirePermission("users.ban"), async (req, res) => {
  const { ids, action, reason } = req.body as {
    ids: string[];
    action: "ban" | "unban";
    reason?: string;
  };
  if (!ids?.length) {
    sendValidationError(res, "ids required");
    return;
  }
  if (action !== "ban" && action !== "unban") {
    sendValidationError(res, "action must be 'ban' or 'unban'");
    return;
  }
  const adminReq = req as AdminRequest;
  let affected = 0;
  const failed: string[] = [];
  try {
    await db.transaction(async (tx) => {
      if (action === "ban") {
        const targetUsers = await tx
          .select({ id: usersTable.id, roles: usersTable.roles })
          .from(usersTable)
          .where(inArray(usersTable.id, ids));
        if (targetUsers.length === 0) return;
        const conditionValues = targetUsers.map((u) => ({
          id: generateId(),
          userId: u.id,
          userRole: u.roles?.split(",")[0]?.trim() || "customer",
          conditionType: "ban_hard" as const,
          severity: "ban" as const,
          category: "ban" as const,
          reason: reason || "Bulk banned by admin",
          appliedBy: adminReq.adminId || "admin",
        }));
        const inserted = await tx
          .insert(accountConditionsTable)
          .values(conditionValues)
          .returning({ id: accountConditionsTable.id });
        affected = inserted.length;
        // Atomically update user flags within the same transaction using tx (not global db)
        await tx
          .update(usersTable)
          .set({ isBanned: true, isActive: false, updatedAt: new Date() })
          .where(
            inArray(
              usersTable.id,
              targetUsers.map((u) => u.id)
            )
          );
      } else {
        const lifted = await tx
          .update(accountConditionsTable)
          .set({
            isActive: false,
            liftedAt: new Date(),
            liftedBy: adminReq.adminId || "admin",
            liftReason: "Bulk unbanned via admin",
            updatedAt: new Date(),
          })
          .where(
            and(
              inArray(accountConditionsTable.userId, ids),
              eq(accountConditionsTable.isActive, true),
              eq(accountConditionsTable.severity, "ban")
            )
          )
          .returning({ userId: accountConditionsTable.userId });
        const affectedIds = [...new Set(lifted.map((r) => r.userId))];
        affected = affectedIds.length;
        if (affectedIds.length > 0) {
          // For each affected user, re-check remaining active conditions before clearing ban flag
          for (const uid of affectedIds) {
            const remaining = await tx
              .select({ id: accountConditionsTable.id })
              .from(accountConditionsTable)
              .where(
                and(
                  eq(accountConditionsTable.userId, uid),
                  eq(accountConditionsTable.isActive, true),
                  eq(accountConditionsTable.severity, "ban")
                )
              )
              .limit(1);
            if (remaining.length === 0) {
              await tx
                .update(usersTable)
                .set({ isBanned: false, isActive: true, updatedAt: new Date() })
                .where(eq(usersTable.id, uid));
            }
          }
        }
      }
    });
    void addAuditEntry({
      action: `bulk_${action}`,
      ip: getClientIp(req),
      adminId: adminReq.adminId,
      details: `Bulk ${action}: ${affected} users`,
      result: "success",
    });
    sendSuccess(res, { success: true, affected, action, failed });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] bulk-ban failed");
    sendError(res, "An internal error occurred", 500);
  }
});

router.patch("/users/:id", requirePermission("users.edit"), async (req, res) => {
  const adminReq = req as AdminRequest;
  const { role, isActive, walletBalance } = req.body;
  const userId = req.params["id"] as string;
  try {
    if (role !== undefined) {
      const allowedRoles = ["customer", "rider", "vendor"];
      if (!allowedRoles.includes(String(role))) {
        sendValidationError(res, `role must be one of: ${allowedRoles.join(", ")}`);
        return;
      }
    }
    const updates: Partial<typeof usersTable.$inferInsert> & {
      tokenVersion?: ReturnType<typeof sql>;
    } = {};
    if (role !== undefined) {
      updates.roles = role;
    }
    if (isActive !== undefined) updates.isActive = isActive;

    if (role === "vendor" || role === "rider") {
      updates.isActive = true;
      updates.approvalStatus = "approved";
    }

    // Route wallet balance changes through FinanceService to preserve audit trail
    if (walletBalance !== undefined) {
      const currentUser = await db
        .select({ walletBalance: usersTable.walletBalance })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1)
        .then((r) => r[0]);
      if (!currentUser) {
        sendNotFound(res, "User not found");
        return;
      }
      const current = parseFloat(currentUser.walletBalance ?? "0");
      const desired = parseFloat(String(walletBalance));
      const diff = parseFloat((desired - current).toFixed(2));
      if (diff !== 0) {
        await FinanceService.createTransaction({
          userId,
          amount: Math.abs(diff),
          type: diff > 0 ? "credit" : "debit",
          reason: `Admin balance adjustment by ${adminReq.adminName || adminReq.adminId || "admin"}`,
        });
      }
    }

    if (Object.keys(updates).length > 0) {
      const [user] = await db
        .update(usersTable)
        .set({ ...(updates as typeof usersTable.$inferInsert), updatedAt: new Date() })
        .where(eq(usersTable.id, userId))
        .returning();

      if (!user) {
        sendNotFound(res, "User not found");
        return;
      }
      /* Revoke sessions on role or status change so user re-authenticates with new role */
      if (role !== undefined || isActive === false) {
        revokeAllUserSessions(userId).catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), userId },
            "[admin/users] revokeAllUserSessions on role/status change failed — sessions may persist"
          );
        });
      }
      // Upsert a blank profile row when role changes to vendor or rider so the
      // admin UI immediately shows a profile section without requiring the user
      // to fill it in first.
      if (role !== undefined) {
        if (String(role).includes("vendor")) {
          await db.insert(vendorProfilesTable).values({ userId }).onConflictDoNothing();
        }
        if (String(role).includes("rider")) {
          await db.insert(riderProfilesTable).values({ userId }).onConflictDoNothing();
        }
      }
      const [refreshed] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      const u = refreshed ?? user;
      sendSuccess(res, {
        ...stripUser(u),
        roles: (u.roles ?? "customer")
          .split(",")
          .map((r: string) => r.trim())
          .filter(Boolean),
        walletBalance: parseFloat(u.walletBalance ?? "0"),
      });
    } else {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) {
        sendNotFound(res, "User not found");
        return;
      }
      sendSuccess(res, {
        ...stripUser(user),
        roles: (user.roles ?? "customer")
          .split(",")
          .map((r: string) => r.trim())
          .filter(Boolean),
        walletBalance: parseFloat(user.walletBalance ?? "0"),
      });
    }
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] patch user failed");
    sendError(res, "An internal error occurred", 500);
  }
});

router.get("/users/pending", requirePermission("users.view"), async (_req, res) => {
  try {
    const rows = await db
      .select({
        user: usersTable,
        vendorProfile: vendorProfilesTable,
        riderProfile: riderProfilesTable,
      })
      .from(usersTable)
      .leftJoin(vendorProfilesTable, eq(usersTable.id, vendorProfilesTable.userId))
      .leftJoin(riderProfilesTable, eq(usersTable.id, riderProfilesTable.userId))
      .where(and(eq(usersTable.approvalStatus, "pending"), isNull(usersTable.deletedAt)))
      .orderBy(desc(usersTable.createdAt));

    sendSuccess(res, {
      users: rows.map(({ user: u, vendorProfile, riderProfile }) => ({
        ...stripUser(u),
        roles: (u.roles ?? "customer")
          .split(",")
          .map((r: string) => r.trim())
          .filter(Boolean),
        walletBalance: parseFloat(u.walletBalance ?? "0"),
        hasMpin: !!u.walletPinHash,
        isMpinLocked: !!(u.walletPinLockedUntil && u.walletPinLockedUntil.getTime() > Date.now()),
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        vendorProfile:
          vendorProfile?.userId != null
            ? {
                storeName: vendorProfile.storeName,
                businessType: vendorProfile.businessType,
                businessName: vendorProfile.businessName,
                ntn: vendorProfile.ntn,
                storeCategory: vendorProfile.storeCategory,
                storeIsOpen: vendorProfile.storeIsOpen,
              }
            : null,
        riderProfile:
          riderProfile?.userId != null
            ? {
                vehicleType: riderProfile.vehicleType,
                vehiclePlate: riderProfile.vehiclePlate,
                drivingLicense: riderProfile.drivingLicense,
                vehicleRegNo: riderProfile.vehicleRegNo,
                documents: riderProfile.documents,
              }
            : null,
      })),
      total: rows.length,
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] list pending failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── Approve User ── */
router.post("/users/:id/approve", requirePermission("users.approve"), async (req, res) => {
  const adminReq = req as AdminRequest;
  const { note, skipDocCheck } = req.body ?? {};
  const userId = req.params["id"] as string;

  try {
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!target) {
      sendNotFound(res, "User not found");
      return;
    }

    if (target.roles?.includes("rider") && !skipDocCheck) {
      const hasCnic = !!target.cnic;
      const [riderProfile] = await db
        .select({ drivingLicense: riderProfilesTable.drivingLicense })
        .from(riderProfilesTable)
        .where(eq(riderProfilesTable.userId, userId))
        .limit(1);
      const hasLicense = !!riderProfile?.drivingLicense;
      const missing: string[] = [];
      if (!hasCnic) missing.push("CNIC");
      if (!hasLicense) missing.push("Driving License");
      if (missing.length > 0) {
        sendError(
          res,
          `Missing required documents: ${missing.join(", ")}. Pass skipDocCheck=true to override.`,
          422
        );
        return;
      }
    }

    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: adminReq.adminIp || getClientIp(req),
        action: "user_approve",
        resourceType: "user",
        resource: userId,
        details: note,
      },
      () => UserService.approveUser(userId)
    );

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    sendSuccess(res, {
      success: true,
      user: {
        ...stripUser(user!),
        roles: (user!.roles ?? "customer")
          .split(",")
          .map((r: string) => r.trim())
          .filter(Boolean),
        walletBalance: parseFloat(user!.walletBalance ?? "0"),
      },
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "[admin/users] approve user failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── Reject User ── */
router.post("/users/:id/reject", requirePermission("users.approve"), async (req, res) => {
  const adminReq = req as AdminRequest;
  const { note } = req.body as { note?: string };
  const userId = req.params["id"] as string;

  try {
    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: adminReq.adminIp || getClientIp(req),
        action: "user_reject",
        resourceType: "user",
        resource: userId,
        details: note || "No reason provided",
      },
      () => UserService.rejectUser(userId, note || "Rejected by admin")
    );

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    sendSuccess(res, {
      success: true,
      user: {
        ...stripUser(user!),
        roles: (user!.roles ?? "customer")
          .split(",")
          .map((r: string) => r.trim())
          .filter(Boolean),
        walletBalance: parseFloat(user!.walletBalance ?? "0"),
      },
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "[admin/users] reject user failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── Wallet Top-up ── */
router.post("/users/:id/wallet-topup", requirePermission("users.wallet"), async (req, res) => {
  const adminReq = req as AdminRequest;
  const { amount, description } = req.body;
  const userId = req.params["id"] as string;

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    sendValidationError(res, "Valid amount is required");
    return;
  }

  try {
    const _result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: adminReq.adminIp || getClientIp(req),
        action: "wallet_topup",
        resourceType: "user",
        resource: userId,
        details: `Amount: Rs. ${amount}`,
      },
      () =>
        FinanceService.processTopup({
          userId,
          amount: Number(amount),
          paymentMethod: "admin_topup",
          reference: description,
        })
    );

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const newBalance = parseFloat(user?.walletBalance ?? "0");

    sendSuccess(res, {
      success: true,
      newBalance,
      user: {
        ...stripUser(user!),
        roles: (user!.roles ?? "customer")
          .split(",")
          .map((r: string) => r.trim())
          .filter(Boolean),
        walletBalance: newBalance,
      },
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "[admin/users] wallet topup failed");
    sendError(res, "An internal error occurred", 500);
  }
});
router.delete("/users/:id", requirePermission("users.delete"), async (req, res) => {
  const adminReq = req as AdminRequest;
  const userId = req.params["id"] as string;

  try {
    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: adminReq.adminIp || getClientIp(req),
        action: "user_delete",
        resourceType: "user",
        resource: userId,
      },
      () => UserService.deleteUser(userId)
    );

    sendSuccess(res, { success: true });
  } catch (error: unknown) {
    logger.error({ err: error }, "[admin/users] delete user failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── User Activity (orders + rides summary) ── */
router.get("/users/:id/activity", requirePermission("users.view"), async (req, res) => {
  const uid = req.params["id"] as string;
  try {
    const [orders, rides, pharmacy, parcels, txns] = await Promise.all([
      db
        .select()
        .from(ordersTable)
        .where(and(eq(ordersTable.userId, uid), isNull(ordersTable.deletedAt)))
        .orderBy(desc(ordersTable.createdAt))
        .limit(10),
      db
        .select()
        .from(ridesTable)
        .where(eq(ridesTable.userId, uid))
        .orderBy(desc(ridesTable.createdAt))
        .limit(10),
      db
        .select()
        .from(pharmacyOrdersTable)
        .where(eq(pharmacyOrdersTable.userId, uid))
        .orderBy(desc(pharmacyOrdersTable.createdAt))
        .limit(5),
      db
        .select()
        .from(parcelBookingsTable)
        .where(eq(parcelBookingsTable.userId, uid))
        .orderBy(desc(parcelBookingsTable.createdAt))
        .limit(5),
      db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.userId, uid))
        .orderBy(desc(walletTransactionsTable.createdAt))
        .limit(10),
    ]);
    sendSuccess(res, {
      orders: orders.map((o) => ({
        ...o,
        total: parseFloat(String(o.total)),
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      })),
      rides: rides.map((r) => ({
        ...r,
        fare: parseFloat(r.fare),
        distance: parseFloat(r.distance),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      pharmacy: pharmacy.map((p) => ({
        ...p,
        total: parseFloat(String(p.total)),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      parcels: parcels.map((p) => ({
        ...p,
        fare: parseFloat(p.fare),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      transactions: txns.map((t) => ({
        ...t,
        amount: parseFloat(t.amount),
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] activity fetch failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── Overview with user enrichment (orders + user info) ── */
router.patch("/users/:id/security", requirePermission("users.ban"), async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const body = req.body as Record<string, unknown>;
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.isBanned !== undefined) updates.isBanned = body.isBanned;
    if (body.banReason !== undefined) updates.banReason = (body.banReason as string) || null;

    const willBeBanned = body.isBanned === true;
    const currentUser = await db
      .select({ isBanned: usersTable.isBanned })
      .from(usersTable)
      .where(eq(usersTable.id, id!))
      .limit(1)
      .then((r) => r[0]);
    const alreadyBanned = currentUser?.isBanned ?? false;
    const canAutoApprove = !willBeBanned && !alreadyBanned;

    if (body.roles !== undefined) {
      const rolesValue = String(body.roles).trim();
      const roleList = rolesValue
        .split(",")
        .map((r: string) => r.trim())
        .filter(Boolean);
      if (!roleList.length) {
        sendValidationError(res, "At least one role must be assigned");
        return;
      }
      updates.roles = roleList.join(",");
      updates.role = roleList.includes("vendor")
        ? "vendor"
        : roleList.includes("rider")
          ? "rider"
          : roleList[0];

      if (canAutoApprove && (roleList.includes("rider") || roleList.includes("vendor"))) {
        updates.isActive = true;
        updates.approvalStatus = "approved";
      }
    }
    if (body.role !== undefined) {
      const roleValue = String(body.role).trim();
      if (roleValue) {
        updates.role = roleValue;
        if (canAutoApprove && (roleValue === "vendor" || roleValue === "rider")) {
          updates.isActive = true;
          updates.approvalStatus = "approved";
        }
      }
    }

    const prevBlockedServices =
      body.blockedServices !== undefined
        ? await db
            .select({ blockedServices: usersTable.blockedServices })
            .from(usersTable)
            .where(eq(usersTable.id, id!))
            .limit(1)
            .then((r) => r[0]?.blockedServices ?? "")
        : null;
    if (body.blockedServices !== undefined) updates.blockedServices = body.blockedServices;
    if (body.securityNote !== undefined) updates.securityNote = body.securityNote || null;
    if (body.devOtpEnabled !== undefined) updates.devOtpEnabled = body.devOtpEnabled === true;

    const adminReq = req as AdminRequest;
    if (willBeBanned && !alreadyBanned) {
      const [existingUser] = await db
        .select({ roles: usersTable.roles })
        .from(usersTable)
        .where(eq(usersTable.id, id!))
        .limit(1);
      await db.insert(accountConditionsTable).values({
        id: generateId(),
        userId: id!,
        userRole: existingUser?.roles?.split(",")[0]?.trim() || "customer",
        conditionType: "ban_hard",
        severity: "ban",
        category: "ban",
        reason: String(body.banReason || "Banned by admin via security panel"),
        appliedBy: adminReq.adminId || "admin",
        notes: body.securityNote ? String(body.securityNote) : null,
      });
      await reconcileUserFlags(id!);
    } else if (!willBeBanned && alreadyBanned && body.isBanned === false) {
      await db
        .update(accountConditionsTable)
        .set({
          isActive: false,
          liftedAt: new Date(),
          liftedBy: adminReq.adminId || "admin",
          liftReason: "Unbanned via security panel",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(accountConditionsTable.userId, id!),
            eq(accountConditionsTable.isActive, true),
            eq(accountConditionsTable.severity, "ban")
          )
        );
      await reconcileUserFlags(id!);
    }

    if (willBeBanned !== alreadyBanned) {
      delete updates["isBanned"];
      delete updates["isActive"];
      delete updates["banReason"];
    }
    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id!))
      .returning();
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    if (body.blockedServices !== undefined && prevBlockedServices != null) {
      const wasFrozen = (prevBlockedServices || "")
        .split(",")
        .map((s: string) => s.trim())
        .includes("wallet");
      const isFrozen = String(body.blockedServices || "")
        .split(",")
        .map((s: string) => s.trim())
        .includes("wallet");
      if (isFrozen !== wasFrozen) {
        const io = getIO();
        if (io) io.to(`user:${id}`).emit(isFrozen ? "wallet:frozen" : "wallet:unfrozen", {});
      }
    }

    /* Revoke all sessions if ban, unban (actual transition), deactivation, or role change occurred */
    if (
      body.isBanned ||
      (alreadyBanned && body.isBanned === false) ||
      body.isActive === false ||
      body.roles !== undefined ||
      body.role !== undefined
    ) {
      revokeAllUserSessions(id!).catch((err: unknown) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), userId: id },
          "[admin/users] revokeAllUserSessions on ban/deactivate/role-change failed — sessions may persist"
        );
      });
    }
    /* Send push notification only when user is being newly banned and notify flag is set */
    if (willBeBanned && !alreadyBanned && body.notify) {
      await sendUserNotification(
        id!,
        "Account Suspended ⚠️",
        String(body.banReason || "Your account has been suspended. Contact support."),
        "warning",
        "warning-outline"
      );
    }
    sendSuccess(res, {
      ...user,
      roles: (user.roles ?? "customer")
        .split(",")
        .map((r: string) => r.trim())
        .filter(Boolean),
      walletBalance: parseFloat(String(user.walletBalance)),
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] security patch failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── PATCH /admin/users/:id/identity — Admin update user identity (username, email, name) ── */
router.patch("/users/:id/identity", requirePermission("users.edit"), async (req, res) => {
  const userId = req.params["id"] as string;
  const body = req.body as Record<string, unknown>;
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!target) {
      sendNotFound(res, "User not found");
      return;
    }

    if (body.username !== undefined) {
      const raw = String(body.username)
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .trim();
      if (raw && raw.length < 3) {
        sendValidationError(res, "Username must be at least 3 characters");
        return;
      }
      if (raw) {
        const [existing] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(sql`lower(${usersTable.username}) = ${raw}`)
          .limit(1);
        if (existing && existing.id !== userId) {
          sendError(res, "Username already taken by another account", 409);
          return;
        }
        updates.username = raw;
      } else {
        updates.username = null;
      }
    }

    if (body.email !== undefined) {
      const raw = String(body.email).toLowerCase().trim();
      if (raw && !raw.includes("@")) {
        sendValidationError(res, "Invalid email format");
        return;
      }
      if (raw) {
        const [existing] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(sql`lower(${usersTable.email}) = ${raw}`)
          .limit(1);
        if (existing && existing.id !== userId) {
          sendError(res, "Email already linked to another account", 409);
          return;
        }
        updates.email = raw;
        updates.emailVerified = false;
      } else {
        updates.email = null;
        updates.emailVerified = false;
      }
    }

    if (body.name !== undefined) {
      const raw = String(body.name).trim();
      if (raw) updates.name = raw;
    }

    if (body.phone !== undefined) {
      const raw = String(body.phone).replace(/[\s\-()]/g, "");
      if (raw) {
        const normalized = raw.replace(/^\+?92/, "").replace(/^0/, "");
        if (!/^3\d{9}$/.test(normalized)) {
          sendValidationError(res, "Invalid phone format");
          return;
        }
        const [existing] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.phone, normalized))
          .limit(1);
        if (existing && existing.id !== userId) {
          sendError(res, "Phone already linked to another account", 409);
          return;
        }
        updates.phone = normalized;
      }
    }

    if (Object.keys(updates).length <= 1) {
      sendValidationError(res, "No valid fields to update");
      return;
    }

    const ip = getClientIp(req);
    const changedFields = Object.keys(updates).filter((k) => k !== "updatedAt");
    void addAuditEntry({
      action: "admin_identity_update",
      ip,
      details: `Admin updated identity for ${userId}: ${changedFields.join(", ")}`,
      result: "success",
    });

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, userId))
      .returning();
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    revokeAllUserSessions(userId).catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), userId },
        "[admin/users] revokeAllUserSessions on identity update failed — sessions may persist"
      );
    });

    sendSuccess(res, {
      ...stripUser(user),
      roles: (user.roles ?? "customer")
        .split(",")
        .map((r: string) => r.trim())
        .filter(Boolean),
      walletBalance: parseFloat(String(user.walletBalance)),
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] identity patch failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── GET /admin/users/:id/otp — view live OTP tokens for support troubleshooting ── */
router.get("/users/:id/otp", requirePermission("users.view"), async (req, res) => {
  const userId = req.params["id"] as string;
  try {
    const [user] = await db
      .select({ id: usersTable.id, phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    const now = new Date();
    const activeTokens = await db
      .select()
      .from(otpTokensTable)
      .where(
        and(
          eq(otpTokensTable.userId, userId),
          isNull(otpTokensTable.usedAt),
          gt(otpTokensTable.expiresAt, now)
        )
      )
      .orderBy(desc(otpTokensTable.createdAt));

    const phoneToken = activeTokens.find((t) => t.identifierType === "phone");
    const emailToken = activeTokens.find((t) => t.identifierType === "email");

    const adminReq = req as AdminRequest;
    void addAuditEntry({
      action: "admin_view_otp",
      ip: getClientIp(req),
      adminId: adminReq.adminId,
      details: `Admin viewed OTP tokens for user ${userId} (${user.phone})`,
      result: "success",
    });

    sendSuccess(res, {
      phone: {
        code: null,
        expiry: phoneToken?.expiresAt?.toISOString() ?? null,
        active: !!phoneToken,
        type: phoneToken?.otpType ?? null,
        channel: phoneToken?.channel ?? null,
      },
      email: {
        code: null,
        expiry: emailToken?.expiresAt?.toISOString() ?? null,
        active: !!emailToken,
        type: emailToken?.otpType ?? null,
        channel: emailToken?.channel ?? null,
      },
      allActiveTokens: activeTokens.map((t) => ({
        id: t.id,
        identifierType: t.identifierType,
        otpType: t.otpType,
        channel: t.channel,
        expiresAt: t.expiresAt?.toISOString(),
        createdAt: t.createdAt?.toISOString(),
      })),
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] view OTP failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── PATCH /admin/users/:id/verify-contact — manually verify phone or email ── */
router.patch("/users/:id/verify-contact", requirePermission("users.edit"), async (req, res) => {
  const userId = req.params["id"] as string;
  const { type } = req.body as { type: "phone" | "email" };

  if (!type || !["phone", "email"].includes(type)) {
    sendValidationError(res, "type must be 'phone' or 'email'");
    return;
  }

  try {
    const [user] = await db
      .select({ id: usersTable.id, phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (type === "phone") updates.phoneVerified = true;
    else updates.emailVerified = true;

    await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));

    const adminReq = req as AdminRequest;
    void addAuditEntry({
      action: "admin_verify_contact",
      ip: getClientIp(req),
      adminId: adminReq.adminId,
      details: `Admin manually verified ${type} for user ${userId} (${user.phone})`,
      result: "success",
    });

    sendSuccess(res, {
      success: true,
      type,
      message: `${type === "phone" ? "Phone" : "Email"} marked as verified`,
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] verify-contact failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── POST /admin/users/:id/force-password-reset — require password change on next login ── */
router.post(
  "/users/:id/force-password-reset",
  requirePermission("users.edit"),
  async (req, res) => {
    const userId = req.params["id"] as string;
    try {
      const [user] = await db
        .select({ id: usersTable.id, phone: usersTable.phone, name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) {
        sendNotFound(res, "User not found");
        return;
      }

      await db
        .update(usersTable)
        .set({ requirePasswordChange: true, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));

      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId,
          title: "Password Reset Required",
          body: "For your account security, you are required to change your password on next login.",
          type: "security",
          icon: "lock-closed-outline",
        })
        .catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), userId },
            "[admin/users] force-password-reset notification insert failed"
          );
        });

      const adminReq = req as AdminRequest;
      void addAuditEntry({
        action: "admin_force_password_reset",
        ip: getClientIp(req),
        adminId: adminReq.adminId,
        details: `Admin forced password reset for user ${userId} (${user.phone})`,
        result: "success",
      });

      sendSuccess(res, {
        success: true,
        message: `Password reset required for ${user.name ?? user.phone}. They will be prompted on next login.`,
      });
    } catch (err: unknown) {
      logger.error({ err }, "[admin/users] force-password-reset failed");
      sendError(res, "An internal error occurred", 500);
    }
  }
);

router.post("/users/:id/reset-otp", requirePermission("users.edit"), async (req, res) => {
  const userId = req.params["id"] as string;
  const adminReq = req as AdminRequest;
  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        phone: usersTable.phone,
        name: usersTable.name,
        roles: usersTable.roles,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }
    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_reset_otp",
        resourceType: "user",
        resource: user.phone ?? userId,
        details: `OTP cleared (including bypass) — user must re-verify on next login`,
        affectedUserId: userId,
        affectedUserName: user.name ?? user.phone ?? undefined,
        affectedUserRole: user.roles?.split(",")[0]?.trim() ?? "customer",
      },
      async () => {
        // Mark any active otp_tokens for this user as used (invalidate)
        await db
          .update(otpTokensTable)
          .set({ usedAt: new Date() })
          .where(and(eq(otpTokensTable.userId, userId), isNull(otpTokensTable.usedAt)));
        await db
          .update(usersTable)
          .set({ otpBypassUntil: null, updatedAt: new Date() })
          .where(eq(usersTable.id, userId));
      }
    );
    sendSuccess(res, {
      success: true,
      message: "OTP tokens invalidated and bypass cleared — user must re-verify on next login",
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] reset OTP failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── POST /admin/users/:id/otp/bypass — set a timed OTP bypass ── */
router.post("/users/:id/otp/bypass", requirePermission("users.edit"), async (req, res) => {
  const userId = req.params["id"] as string;
  const minutes = Number(req.body?.minutes);
  if (!minutes || minutes <= 0 || minutes > 1440 || !Number.isInteger(minutes)) {
    sendValidationError(res, "minutes must be a positive integer between 1 and 1440");
    return;
  }
  try {
    const [user] = await db
      .select({ id: usersTable.id, phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    const bypassUntil = new Date(Date.now() + minutes * 60 * 1000);

    // no user notification — admin-only action
    await db
      .update(usersTable)
      .set({ otpBypassUntil: bypassUntil, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    const ip = getClientIp(req);
    const adminReq = req as AdminRequest;
    void addAuditEntry({
      action: "admin_otp_bypass_set",
      ip,
      adminId: adminReq.adminId,
      details: `Admin set ${minutes}min OTP bypass for user ${userId} (${user.phone}), expires ${bypassUntil.toISOString()}`,
      result: "success",
    });
    void writeAuthAuditLog("admin_otp_bypass_set", {
      userId,
      ip,
      userAgent: req.headers["user-agent"] ?? undefined,
      metadata: {
        phone: user.phone,
        adminId: adminReq.adminId,
        minutes,
        bypassUntil: bypassUntil.toISOString(),
        result: "success",
      },
    });

    sendSuccess(res, { bypassUntil: bypassUntil.toISOString(), minutes });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] otp bypass set failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── POST /admin/users/:id/otp/generate — generate a fresh OTP (support tool) ── */
router.post("/users/:id/otp/generate", requirePermission("users.edit"), async (req, res) => {
  const userId = req.params["id"] as string;
  const adminReq = req as AdminRequest;
  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        phone: usersTable.phone,
        email: usersTable.email,
        name: usersTable.name,
        roles: usersTable.roles,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    const { generateOtpCode, hashOtpCode } = await import("../../../modules/otp/otp.generate.js");
    const { saveOtpToken } = await import("../../../modules/otp/otp.store.js");

    const code = generateOtpCode();
    const codeHash = hashOtpCode(code);
    const identifier = user.phone ?? user.email ?? userId;
    const identifierType = user.phone ? ("phone" as const) : ("email" as const);

    await saveOtpToken({
      identifier,
      identifierType,
      otpType: "login",
      otpHash: codeHash,
      channel: "sms",
      userId,
      ttlMs: 10 * 60 * 1000,
    });

    const ip = getClientIp(req);
    void addAuditEntry({
      action: "admin_generate_otp",
      ip,
      adminId: adminReq.adminId,
      details: `Admin generated OTP for user ${userId} (${identifier}) — code delivered in response (admin-only)`,
      result: "success",
    });
    logger.warn(
      { adminId: adminReq.adminId, userId, identifier },
      "[admin/users] admin generated OTP — code returned in response"
    );

    sendSuccess(res, { code, expiresInSeconds: 600 });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] otp generate failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── DELETE /admin/users/:id/otp/attempts — clear failed OTP attempt counter ── */
router.delete("/users/:id/otp/attempts", requirePermission("users.edit"), async (req, res) => {
  const userId = req.params["id"] as string;
  const adminReq = req as AdminRequest;
  try {
    const [user] = await db
      .select({ id: usersTable.id, phone: usersTable.phone, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    // Delete all attempt rows keyed by this user's phone and/or email
    if (user.phone) await db.delete(otpAttemptsTable).where(eq(otpAttemptsTable.key, user.phone));
    if (user.email) await db.delete(otpAttemptsTable).where(eq(otpAttemptsTable.key, user.email));

    const ip = getClientIp(req);
    void addAuditEntry({
      action: "admin_clear_otp_attempts",
      ip,
      adminId: adminReq.adminId,
      details: `Admin cleared OTP attempt counter for user ${userId} (${user.phone ?? user.email})`,
      result: "success",
    });

    sendSuccess(res, {
      success: true,
      message: "OTP attempt counter cleared — user can retry immediately.",
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] clear otp attempts failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── DELETE /admin/users/:id/otp/bypass — cancel an active OTP bypass ── */
router.delete("/users/:id/otp/bypass", requirePermission("users.edit"), async (req, res) => {
  const userId = req.params["id"] as string;
  try {
    const [user] = await db
      .select({ id: usersTable.id, phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    // no user notification — admin-only action
    await db
      .update(usersTable)
      .set({ otpBypassUntil: null, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    const ip = getClientIp(req);
    const adminReq = req as AdminRequest;
    void addAuditEntry({
      action: "admin_otp_bypass_cancel",
      ip,
      adminId: adminReq.adminId,
      details: `Admin cancelled OTP bypass for user ${userId} (${user.phone})`,
      result: "success",
    });
    void writeAuthAuditLog("admin_otp_bypass_cancel", {
      userId,
      ip,
      userAgent: req.headers["user-agent"] ?? undefined,
      metadata: { phone: user.phone, adminId: adminReq.adminId, result: "success" },
    });

    sendSuccess(res, { success: true });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] otp bypass cancel failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── Force-disable 2FA for a user (admin action) ── */
router.post("/users/:id/2fa/disable", requirePermission("users.edit"), async (req, res) => {
  const userId = req.params["id"] as string;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    if (!user.totpEnabled) {
      sendValidationError(res, "2FA is not enabled for this user");
      return;
    }

    await db
      .update(usersTable)
      .set({
        totpEnabled: false,
        totpSecret: null,
        backupCodes: null,
        trustedDevices: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    const ip = getClientIp(req);
    void addAuditEntry({
      action: "admin_2fa_disable",
      ip,
      details: `Admin force-disabled 2FA for user ${userId} (${user.phone})`,
      result: "success",
    });
    void writeAuthAuditLog("admin_2fa_disabled", {
      userId,
      ip,
      userAgent: req.headers["user-agent"] as string,
      metadata: { adminAction: true },
    });

    sendSuccess(res, {
      success: true,
      message: `2FA disabled for user ${user.name ?? user.phone}`,
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] 2fa disable failed");
    sendError(res, "An internal error occurred", 500);
  }
});

router.post("/users/:id/reset-wallet-pin", requirePermission("users.edit"), async (req, res) => {
  const userId = req.params["id"] as string;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }
    if (!user.walletPinHash) {
      sendValidationError(res, "This user has no MPIN set");
      return;
    }

    await db
      .update(usersTable)
      .set({
        walletPinHash: null,
        walletPinAttempts: 0,
        walletPinLockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    sendSuccess(res, {
      success: true,
      message: `Wallet MPIN reset for ${user.name ?? user.phone}. User will need to create a new MPIN.`,
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] reset-wallet-pin failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── Admin Accounts (Sub-Admins) ── */
router.patch(
  "/users/:id/request-correction",
  requirePermission("users.approve"),
  async (req, res) => {
    const { field, note } = req.body as { field?: string; note?: string };
    try {
      const [user] = await db
        .update(usersTable)
        .set({
          approvalStatus: "correction_needed",
          approvalNote: note || `Please re-upload: ${field || "document"}`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, req.params["id"] as string))
        .returning();
      if (!user) {
        sendNotFound(res, "User not found");
        return;
      }
      void addAuditEntry({
        action: "user_correction_requested",
        ip: getClientIp(req),
        adminId: (req as AdminRequest).adminId,
        details: `Correction requested for ${user.phone}: ${field}`,
        result: "success",
      });
      const docLang = await getUserLanguage(user.id);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: user.id,
          title: t("notifDocumentCorrection", docLang),
          body:
            note ||
            t("notifDocumentCorrectionBody", docLang).replace("{field}", field || "document"),
          type: "system",
          icon: "document-outline",
        })
        .catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), userId: user.id },
            "[admin/users] document-correction notification insert failed"
          );
        });
      sendSuccess(res, {
        success: true,
        user: {
          ...stripUser(user),
          roles: (user.roles ?? "customer")
            .split(",")
            .map((r: string) => r.trim())
            .filter(Boolean),
        },
      });
    } catch (err: unknown) {
      logger.error({ err }, "[admin/users] request-correction failed");
      sendError(res, "An internal error occurred", 500);
    }
  }
);

/* ── PATCH /admin/users/:id/waive-debt — waive rider's cancellation debt ── */
router.patch("/users/:id/waive-debt", requirePermission("users.edit"), async (req, res) => {
  const userId = req.params["id"] as string;
  const adminReq = req as AdminRequest;
  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        phone: usersTable.phone,
        name: usersTable.name,
        roles: usersTable.roles,
        cancellationDebt: usersTable.cancellationDebt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }
    const debt = parseFloat(user.cancellationDebt ?? "0");
    if (debt <= 0) {
      sendSuccess(res, { success: true, message: "No debt to waive" });
      return;
    }
    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "debt_waived",
        resourceType: "user",
        resource: user.phone ?? userId,
        details: `Waived cancellation debt of Rs.${debt.toFixed(0)} for ${user.phone ?? userId}`,
        affectedUserId: userId,
        affectedUserName: user.name ?? user.phone ?? undefined,
        affectedUserRole: user.roles?.split(",")[0]?.trim() ?? "rider",
      },
      async () => {
        await db
          .update(usersTable)
          .set({ cancellationDebt: "0", updatedAt: new Date() })
          .where(eq(usersTable.id, userId));
        const debtLang = await getUserLanguage(userId);
        await db
          .insert(notificationsTable)
          .values({
            id: generateId(),
            userId,
            title: t("notifDebtWaived", debtLang),
            body: t("notifDebtWaivedBody", debtLang).replace("{amount}", debt.toFixed(0)),
            type: "system",
            icon: "checkmark-circle-outline",
          })
          .catch((err: unknown) => {
            logger.warn(
              { err: err instanceof Error ? err.message : String(err), userId },
              "[admin/users] debt-waived notification insert failed"
            );
          });
      }
    );
    sendSuccess(res, { success: true, waived: debt });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] waive debt failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── GET /admin/users/:id/sessions — list user's active sessions ── */
router.get("/users/:id/sessions", requirePermission("users.view"), async (req, res) => {
  const { id } = req.params as Record<string, string>;
  try {
    const sessions = await db
      .select()
      .from(userSessionsTable)
      .where(and(eq(userSessionsTable.userId, id!), isNull(userSessionsTable.revokedAt)))
      .orderBy(desc(userSessionsTable.lastActiveAt));

    sendSuccess(res, {
      sessions: sessions.map((s) => ({
        id: s.id,
        deviceName: s.deviceName,
        browser: s.browser,
        os: s.os,
        ip: s.ip,
        location: s.location,
        lastActiveAt: s.lastActiveAt?.toISOString() ?? null,
        createdAt: s.createdAt?.toISOString() ?? null,
      })),
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] list sessions failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── DELETE /admin/users/:id/sessions/:sessionId — revoke one session ── */
router.delete(
  "/users/:id/sessions/:sessionId",
  requirePermission("users.edit"),
  async (req, res) => {
    const { id, sessionId } = req.params as Record<string, string>;
    const adminReq = req as AdminRequest;

    try {
      const [session] = await db
        .select()
        .from(userSessionsTable)
        .where(and(eq(userSessionsTable.id, sessionId!), eq(userSessionsTable.userId, id!)))
        .limit(1);
      if (!session) {
        sendNotFound(res, "Session");
        return;
      }

      const [affectedUser] = await db
        .select({ name: usersTable.name, phone: usersTable.phone, roles: usersTable.roles })
        .from(usersTable)
        .where(eq(usersTable.id, id!))
        .limit(1);
      await AuditService.executeWithAudit(
        {
          adminId: adminReq.adminId,
          adminName: adminReq.adminName,
          adminIp: getClientIp(req),
          action: "revoke_session",
          resourceType: "user_session",
          resource: sessionId!,
          details: `Revoked session for user ${affectedUser?.phone || id} (device: ${session.deviceName || session.browser || "unknown"})`,
          affectedUserId: id!,
          affectedUserName: affectedUser?.name ?? affectedUser?.phone ?? undefined,
          affectedUserRole: affectedUser?.roles?.split(",")[0]?.trim() ?? "customer",
        },
        async () => {
          await db
            .update(userSessionsTable)
            .set({ revokedAt: new Date() })
            .where(eq(userSessionsTable.id, sessionId!));
          if (session.refreshTokenId) {
            await db
              .update(refreshTokensTable)
              .set({ revokedAt: new Date() })
              .where(eq(refreshTokensTable.id, session.refreshTokenId));
          }
        }
      );
      void writeAuthAuditLog("admin_session_revoked", {
        userId: id!,
        ip: req.ip ?? "",
        metadata: { sessionId },
      });
      sendSuccess(res, { revoked: true });
    } catch (err: unknown) {
      logger.error({ err }, "[admin/users] revoke session failed");
      sendError(res, "An internal error occurred", 500);
    }
  }
);

/* ── DELETE /admin/users/:id/sessions — revoke ALL sessions for user ── */
router.delete("/users/:id/sessions", requirePermission("users.edit"), async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const adminReq = req as AdminRequest;
  try {
    const [affectedUser] = await db
      .select({ name: usersTable.name, phone: usersTable.phone, roles: usersTable.roles })
      .from(usersTable)
      .where(eq(usersTable.id, id!))
      .limit(1);
    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "revoke_all_sessions",
        resourceType: "user",
        resource: affectedUser?.phone ?? id!,
        details: `All sessions revoked for user ${affectedUser?.phone ?? id}`,
        affectedUserId: id!,
        affectedUserName: affectedUser?.name ?? affectedUser?.phone ?? undefined,
        affectedUserRole: affectedUser?.roles?.split(",")[0]?.trim() ?? "customer",
      },
      async () => {
        await db
          .update(userSessionsTable)
          .set({ revokedAt: new Date() })
          .where(and(eq(userSessionsTable.userId, id!), isNull(userSessionsTable.revokedAt)));
        await db
          .update(refreshTokensTable)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokensTable.userId, id!), isNull(refreshTokensTable.revokedAt)));
        /* Bump tokenVersion so all outstanding access JWTs are immediately invalid */
        await db
          .update(usersTable)
          .set({ tokenVersion: sql`token_version + 1`, updatedAt: new Date() })
          .where(eq(usersTable.id, id!));
      }
    );
    void writeAuthAuditLog("admin_all_sessions_revoked", { userId: id!, ip: req.ip ?? "" });
    sendSuccess(res, { revoked: true, message: "All sessions revoked for user" });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] revoke all sessions failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── POST /admin/users/:id/otp/reset — explicit alias for POST .../reset-otp ── */
router.post("/users/:id/otp/reset", requirePermission("users.edit"), async (req, res) => {
  const userId = req.params["id"] as string;
  const adminReq = req as AdminRequest;
  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        phone: usersTable.phone,
        name: usersTable.name,
        roles: usersTable.roles,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }
    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_reset_otp",
        resourceType: "user",
        resource: user.phone ?? userId,
        details: `OTP cleared (including bypass) — user must re-verify on next login`,
        affectedUserId: userId,
        affectedUserName: user.name ?? user.phone ?? undefined,
        affectedUserRole: user.roles?.split(",")[0]?.trim() ?? "customer",
      },
      async () => {
        // Mark any active otp_tokens for this user as used (invalidate)
        await db
          .update(otpTokensTable)
          .set({ usedAt: new Date() })
          .where(and(eq(otpTokensTable.userId, userId), isNull(otpTokensTable.usedAt)));
        await db
          .update(usersTable)
          .set({ otpBypassUntil: null, updatedAt: new Date() })
          .where(eq(usersTable.id, userId));
      }
    );
    sendSuccess(res, {
      success: true,
      message: "OTP tokens invalidated and bypass cleared — user must re-verify on next login",
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] reset OTP (bulk) failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── POST /admin/users/:id/sessions/revoke — explicit alias; optional body.sessionId ── */
router.post("/users/:id/sessions/revoke", requirePermission("users.edit"), async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const adminReq = req as AdminRequest;
  const sessionId: string | undefined = req.body?.sessionId;

  try {
    if (sessionId) {
      // Revoke a single session
      const [session] = await db
        .select()
        .from(userSessionsTable)
        .where(and(eq(userSessionsTable.id, sessionId), eq(userSessionsTable.userId, id!)))
        .limit(1);
      if (!session) {
        sendNotFound(res, "Session");
        return;
      }
      const [affectedUser] = await db
        .select({ name: usersTable.name, phone: usersTable.phone, roles: usersTable.roles })
        .from(usersTable)
        .where(eq(usersTable.id, id!))
        .limit(1);

      await AuditService.executeWithAudit(
        {
          adminId: adminReq.adminId,
          adminName: adminReq.adminName,
          adminIp: getClientIp(req),
          action: "revoke_session",
          resourceType: "user_session",
          resource: sessionId,
          details: `Revoked session for user ${affectedUser?.phone ?? id} (device: ${session.deviceName || session.browser || "unknown"})`,
          affectedUserId: id!,
          affectedUserName: affectedUser?.name ?? affectedUser?.phone ?? undefined,
          affectedUserRole: affectedUser?.roles?.split(",")[0]?.trim() ?? "customer",
        },
        async () => {
          await db
            .update(userSessionsTable)
            .set({ revokedAt: new Date() })
            .where(eq(userSessionsTable.id, sessionId));
          if (session.refreshTokenId) {
            await db
              .update(refreshTokensTable)
              .set({ revokedAt: new Date() })
              .where(eq(refreshTokensTable.id, session.refreshTokenId));
          }
        }
      );
      void writeAuthAuditLog("admin_session_revoked", {
        userId: id!,
        ip: req.ip ?? "",
        metadata: { sessionId },
      });
      sendSuccess(res, { revoked: true });
    } else {
      // Revoke all sessions
      const [affectedUser] = await db
        .select({ name: usersTable.name, phone: usersTable.phone, roles: usersTable.roles })
        .from(usersTable)
        .where(eq(usersTable.id, id!))
        .limit(1);

      await AuditService.executeWithAudit(
        {
          adminId: adminReq.adminId,
          adminName: adminReq.adminName,
          adminIp: getClientIp(req),
          action: "revoke_all_sessions",
          resourceType: "user",
          resource: affectedUser?.phone ?? id!,
          details: `All sessions revoked for user ${affectedUser?.phone ?? id}`,
          affectedUserId: id!,
          affectedUserName: affectedUser?.name ?? affectedUser?.phone ?? undefined,
          affectedUserRole: affectedUser?.roles?.split(",")[0]?.trim() ?? "customer",
        },
        async () => {
          await db
            .update(userSessionsTable)
            .set({ revokedAt: new Date() })
            .where(and(eq(userSessionsTable.userId, id!), isNull(userSessionsTable.revokedAt)));
          await db
            .update(refreshTokensTable)
            .set({ revokedAt: new Date() })
            .where(and(eq(refreshTokensTable.userId, id!), isNull(refreshTokensTable.revokedAt)));
          await db
            .update(usersTable)
            .set({ tokenVersion: sql`token_version + 1`, updatedAt: new Date() })
            .where(eq(usersTable.id, id!));
        }
      );
      void writeAuthAuditLog("admin_all_sessions_revoked", { userId: id!, ip: req.ip ?? "" });
      sendSuccess(res, { revoked: true, message: "All sessions revoked for user" });
    }
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] revoke session(s) (alias) failed");
    sendError(res, "An internal error occurred", 500);
  }
});

/* ── POST /users/export — filter-aware or selection-aware CSV export ── */
function escapeCSVField(val: string): string {
  let safe = val;
  if (/^[=+\-@\t\r]/.test(safe)) safe = "'" + safe;
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n"))
    return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

router.post("/users/export", requirePermission("users.view"), async (req, res) => {
  const adminReq = req as AdminRequest;
  const { ids, role, status, search, conditionTier, dateFrom, dateTo } = req.body as {
    ids?: string[];
    role?: string;
    status?: string;
    search?: string;
    conditionTier?: string;
    dateFrom?: string;
    dateTo?: string;
  };

  try {
    let users: (typeof usersTable.$inferSelect)[] = [];

    if (ids && ids.length > 0) {
      users = await db
        .select()
        .from(usersTable)
        .where(and(inArray(usersTable.id, ids), isNull(usersTable.deletedAt)))
        .orderBy(desc(usersTable.createdAt))
        .limit(10000);
    } else {
      const conditions: SQL[] = [isNull(usersTable.deletedAt) as SQL];

      if (role && role !== "all") {
        conditions.push(sql`${usersTable.roles} LIKE ${"%" + role + "%"}`);
      }
      if (status && status !== "all") {
        if (status === "banned") conditions.push(eq(usersTable.isBanned, true));
        else if (status === "active")
          conditions.push(
            and(eq(usersTable.isActive, true), eq(usersTable.isBanned, false)) as SQL
          );
        else if (status === "blocked")
          conditions.push(
            and(eq(usersTable.isActive, false), eq(usersTable.isBanned, false)) as SQL
          );
      }
      if (search) {
        conditions.push(
          or(
            ilike(usersTable.name, `%${search}%`),
            ilike(usersTable.phone, `%${search}%`),
            ilike(usersTable.email, `%${search}%`)
          )! as SQL
        );
      }
      if (dateFrom) conditions.push(gte(usersTable.createdAt, new Date(dateFrom)));
      if (dateTo) conditions.push(lte(usersTable.createdAt, new Date(dateTo + "T23:59:59")));

      users = await db
        .select()
        .from(usersTable)
        .where(and(...conditions))
        .orderBy(desc(usersTable.createdAt))
        .limit(10000);

      if (conditionTier && conditionTier !== "all") {
        const condCounts = await db
          .select({
            userId: accountConditionsTable.userId,
            maxSeverityLabel: sql<string>`(ARRAY['warning','warning','restriction_normal','restriction_strict','suspension','ban'])[1 + MAX(CASE ${accountConditionsTable.severity}::text WHEN 'ban' THEN 5 WHEN 'suspension' THEN 4 WHEN 'restriction_strict' THEN 3 WHEN 'restriction_normal' THEN 2 WHEN 'warning' THEN 1 ELSE 0 END)]`,
            activeCount: count(),
          })
          .from(accountConditionsTable)
          .where(eq(accountConditionsTable.isActive, true))
          .groupBy(accountConditionsTable.userId);

        const condMap = new Map(
          condCounts.map((c) => [
            c.userId,
            { count: Number(c.activeCount), maxSeverity: c.maxSeverityLabel },
          ])
        );

        users = users.filter((u) => {
          const cond = condMap.get(u.id);
          if (conditionTier === "has_conditions") return !!cond && cond.count > 0;
          if (conditionTier === "clean") return !cond || cond.count === 0;
          if (conditionTier === "warnings") return cond?.maxSeverity === "warning";
          if (conditionTier === "restrictions")
            return (
              cond?.maxSeverity === "restriction_normal" ||
              cond?.maxSeverity === "restriction_strict"
            );
          if (conditionTier === "suspensions") return cond?.maxSeverity === "suspension";
          if (conditionTier === "bans") return cond?.maxSeverity === "ban";
          return true;
        });
      }
    }

    const mode = ids?.length ? `selection (${ids.length} IDs)` : "filter";
    void addAuditEntry({
      action: "csv_export",
      ip: getClientIp(req),
      adminId: adminReq.adminId,
      details: `Exported ${users.length} users as CSV via ${mode}`,
      result: "success",
    });

    const header = "ID,Name,Phone,Email,Roles,City,Active,Banned,Wallet Balance,Created At";
    const rows = users.map((u) =>
      [
        escapeCSVField(u.id),
        escapeCSVField(u.name || ""),
        escapeCSVField(u.phone || ""),
        escapeCSVField(u.email || ""),
        escapeCSVField(u.roles || ""),
        escapeCSVField(u.city || ""),
        u.isActive ? "Yes" : "No",
        u.isBanned ? "Yes" : "No",
        String(u.walletBalance || "0"),
        escapeCSVField(u.createdAt.toISOString().slice(0, 19)),
      ].join(",")
    );

    const csv = [header, ...rows].join("\n");
    const filename = `users-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] export failed");
    sendError(res, "An internal error occurred during export", 500);
  }
});

/**
 * @openapi
 * /admin/users/{userId}/recovery:
 *   post:
 *     tags: [Admin - Users]
 *     summary: Initiate account recovery for a user
 *     description: |
 *       Admin-only. Generates a cryptographically secure one-time recovery link (1-hour TTL),
 *       stores a hashed record in account_recovery_tokens, and emails the link to the user's
 *       registered email address. The user follows the link to set a new password without needing OTP.
 *     security:
 *       - adminBearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *         description: ID of the user to recover
 *     responses:
 *       200:
 *         description: Recovery email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId: { type: string }
 *                     email: { type: string }
 *                     expiresAt: { type: string, format: date-time }
 *       400:
 *         description: User has no registered email
 *       404:
 *         description: User not found
 */

/* ════════════════════════════════════════════════════════════════
   POST /api/admin/users/:userId/recovery
   Admin-only: send a one-time account recovery link to a user's email.
   The link expires in 1 hour and lets the user set a new password without OTP.
════════════════════════════════════════════════════════════════ */

router.post("/users/:userId/recovery", requirePermission("users.edit"), async (req, res) => {
  try {
    const { userId } = req.params as Record<string, string>;
    const adminReq = req as AdminRequest;
    const ip = getClientIp(req);

    const [targetUser] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        phone: usersTable.phone,
        name: usersTable.name,
        isActive: usersTable.isActive,
        isBanned: usersTable.isBanned,
        roles: usersTable.roles,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId!))
      .limit(1);

    if (!targetUser) {
      sendNotFound(res, "User not found");
      return;
    }
    if (!targetUser.email) {
      sendError(
        res,
        "User does not have a registered email address. Recovery link cannot be sent.",
        400
      );
      return;
    }

    /* Generate a single-use cryptographically secure recovery token */
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); /* 1 hour TTL */

    /* Store hashed token in dedicated account_recovery_tokens table */
    await db.insert(accountRecoveryTokensTable).values({
      id: generateId(),
      userId: targetUser.id,
      tokenHash,
      expiresAt,
    });

    /* Build recovery URL pointing to public reset endpoint */
    const baseUrl =
      process.env["APP_BASE_URL"] ??
      (process.env["REPLIT_DEV_DOMAIN"]
        ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
        : "http://localhost:3000");
    const recoveryUrl = `${baseUrl}/recover?token=${encodeURIComponent(rawToken)}`;

    /* Send email (fire-and-forget for response speed) */
    const { sendRecoveryEmail } = await import("../../../services/email.js");
    sendRecoveryEmail(targetUser.email, recoveryUrl, targetUser.name || undefined).catch(
      (err: unknown) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[admin/users] recovery email send failed"
        );
      }
    );

    /* Audit trail */
    void addAuditEntry({
      action: "account_recovery_initiated",
      ip,
      details: `Admin ${adminReq.adminId ?? "unknown"} initiated recovery for user ${targetUser.id} (${targetUser.email}). Link expires at ${expiresAt.toISOString()}.`,
      result: "success",
    });

    sendSuccess(
      res,
      {
        userId: targetUser.id,
        email: targetUser.email,
        expiresAt: expiresAt.toISOString(),
        ...(process.env.NODE_ENV !== "production" ? { recoveryUrl } : {}),
      },
      "Recovery link generated and sent to user email"
    );
  } catch (err: unknown) {
    logger.error({ err }, "[admin/users] recovery generation failed");
    sendError(res, "Internal server error", 500);
  }
});

export default router;
