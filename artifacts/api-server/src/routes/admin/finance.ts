import { db } from "@workspace/db";
import {
  notificationsTable,
  ordersTable,
  rideRatingsTable,
  riderPenaltiesTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { and, count, desc, eq, ilike, or, sql, sum } from "drizzle-orm";
import { Router } from "express";
import { requirePermission } from "../../middleware/require-permission.js";
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
  type TranslationKey,
} from "../admin-shared.js";

const router = Router();
router.get("/transactions", requirePermission("finance.transactions.view"), async (req, res) => {
  const rawLimit = parseInt(String(req.query["limit"] ?? "50"), 10);
  const pageLimit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50), 200);
  const rawPage = parseInt(String(req.query["page"] ?? "1"), 10);
  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  const offset = (page - 1) * pageLimit;
  const search = String(req.query["search"] ?? "").trim();
  const typeFilter = req.query["type"] as string | undefined;

  const whereClause = and(
    typeFilter ? eq(walletTransactionsTable.type, typeFilter) : undefined,
    search
      ? or(
          ilike(walletTransactionsTable.description, `%${search}%`),
          ilike(walletTransactionsTable.reference, `%${search}%`)
        )
      : undefined
  );

  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(walletTransactionsTable)
      .where(whereClause)
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(pageLimit)
      .offset(offset),
    db.select({ count: count() }).from(walletTransactionsTable).where(whereClause),
  ]);

  const totalCount = Number(countRow?.count ?? 0);
  const totalCredit = rows
    .filter((t) => t.type === "credit")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const totalDebit = rows
    .filter((t) => t.type === "debit")
    .reduce((s, t) => s + parseFloat(t.amount), 0);

  res.json({
    transactions: rows.map((t) => ({
      ...t,
      amount: parseFloat(t.amount),
      createdAt: t.createdAt.toISOString(),
    })),
    total: totalCount,
    page,
    pageSize: pageLimit,
    totalPages: Math.ceil(totalCount / pageLimit),
    totalCredit,
    totalDebit,
  });
});

/* ── Transactions CSV Export (streamed, up to 10 000 rows) ── */
router.get(
  "/transactions/export",
  requirePermission("finance.transactions.view"),
  async (req, res) => {
    try {
      const search = String(req.query["search"] ?? "").trim();
      const typeFilter = req.query["type"] as string | undefined;
      const dateFrom = req.query["dateFrom"] as string | undefined;
      const dateTo = req.query["dateTo"] as string | undefined;

      const where = and(
        typeFilter ? eq(walletTransactionsTable.type, typeFilter) : undefined,
        search
          ? or(
              ilike(walletTransactionsTable.description, `%${search}%`),
              ilike(walletTransactionsTable.reference, `%${search}%`)
            )
          : undefined,
        dateFrom ? sql`${walletTransactionsTable.createdAt} >= ${new Date(dateFrom)}` : undefined,
        dateTo
          ? sql`${walletTransactionsTable.createdAt} <= ${new Date(dateTo + "T23:59:59")}`
          : undefined
      );

      const rows = await db
        .select({
          id: walletTransactionsTable.id,
          userId: walletTransactionsTable.userId,
          type: walletTransactionsTable.type,
          amount: walletTransactionsTable.amount,
          reference: walletTransactionsTable.reference,
          description: walletTransactionsTable.description,
          createdAt: walletTransactionsTable.createdAt,
        })
        .from(walletTransactionsTable)
        .where(where)
        .orderBy(desc(walletTransactionsTable.createdAt))
        .limit(10_000);

      /* Enrich with user name */
      const userIds = [...new Set(rows.map((r) => r.userId))];
      const users =
        userIds.length > 0
          ? await db
              .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
              .from(usersTable)
              .where(
                sql`${usersTable.id} = ANY(ARRAY[${sql.raw(userIds.map((id) => `'${id}'`).join(","))}]::text[])`
              )
          : [];
      const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

      const header = "id,date,userId,userName,userPhone,type,amount,status,reference,description";
      const escape = (v: unknown) => {
        let s = String(v ?? "");
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        if (s.includes(",") || s.includes('"') || s.includes("\n"))
          s = `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const csvRows = rows.map((t) =>
        [
          escape(t.id),
          escape(t.createdAt.toISOString().slice(0, 10)),
          escape(t.userId),
          escape(userMap[t.userId]?.name ?? ""),
          escape(userMap[t.userId]?.phone ?? ""),
          escape(t.type),
          escape(parseFloat(t.amount).toFixed(2)),
          "",
          escape(t.reference ?? ""),
          escape(t.description ?? ""),
        ].join(",")
      );

      const csv = [header, ...csvRows].join("\n");
      const filename = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err) {
      logger.error({ err }, "[transactions/export] failed");
      res.status(500).send("Export failed");
    }
  }
);

/* ── Transactions Enriched (server-side paginated) ── */
router.get(
  "/transactions-enriched",
  requirePermission("finance.transactions.view"),
  async (req, res) => {
    const rawLimit = parseInt(String(req.query["limit"] ?? "50"), 10);
    const pageLimit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50), 200);
    const rawPage = parseInt(String(req.query["page"] ?? "1"), 10);
    const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
    const offset = (page - 1) * pageLimit;
    const search = String(req.query["search"] ?? "").trim();
    const typeFilter = req.query["type"] as string | undefined;

    const whereClause = and(
      typeFilter ? eq(walletTransactionsTable.type, typeFilter) : undefined,
      search
        ? or(
            ilike(walletTransactionsTable.description, `%${search}%`),
            ilike(walletTransactionsTable.reference, `%${search}%`)
          )
        : undefined
    );

    const [rows, [countRow]] = await Promise.all([
      db
        .select()
        .from(walletTransactionsTable)
        .where(whereClause)
        .orderBy(desc(walletTransactionsTable.createdAt))
        .limit(pageLimit)
        .offset(offset),
      db.select({ count: count() }).from(walletTransactionsTable).where(whereClause),
    ]);

    const userIds = [...new Set(rows.map((t) => t.userId))];
    const users =
      userIds.length > 0
        ? await db
            .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
            .from(usersTable)
            .where(
              sql`${usersTable.id} = ANY(${sql.raw(`ARRAY[${userIds.map((id) => `'${id}'`).join(",")}]`)})`
            )
        : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const enriched = rows.map((t) => ({
      ...t,
      amount: parseFloat(t.amount),
      createdAt: t.createdAt.toISOString(),
      userName: userMap[t.userId]?.name ?? null,
      userPhone: userMap[t.userId]?.phone ?? null,
    }));

    const totalCount = Number(countRow?.count ?? 0);
    const totalCredit = enriched
      .filter((t) => t.type === "credit")
      .reduce((s, t) => s + t.amount, 0);
    const totalDebit = enriched.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);

    res.json({
      transactions: enriched,
      total: totalCount,
      page,
      pageSize: pageLimit,
      totalPages: Math.ceil(totalCount / pageLimit),
      totalCredit,
      totalDebit,
    });
  }
);

/* ── Vendor Management ── */
router.get("/vendors", requirePermission("vendors.view"), async (_req, res) => {
  const vendors = await db
    .select()
    .from(usersTable)
    .where(or(ilike(usersTable.roles, "%vendor%"), eq(usersTable.roles, "vendor")))
    .orderBy(desc(usersTable.createdAt));

  const vendorIds = vendors.map((v) => v.id);
  let orderStats: Array<{
    vendorId: string | null;
    totalOrders: number;
    totalRevenue: string | null;
    pendingOrders: number;
  }> = [];
  if (vendorIds.length > 0) {
    orderStats = await db
      .select({
        vendorId: ordersTable.vendorId,
        totalOrders: count(),
        totalRevenue: sum(ordersTable.total),
        pendingOrders: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} = 'pending')`,
      })
      .from(ordersTable)
      .where(
        sql`${ordersTable.vendorId} = ANY(${sql.raw(`ARRAY[${vendorIds.map((id) => `'${id}'`).join(",")}]`)})`
      )
      .groupBy(ordersTable.vendorId)
      .catch(() => []);
  }

  const statsMap = Object.fromEntries(orderStats.map((s) => [s.vendorId, s]));

  res.json({
    vendors: vendors.map((v) => {
      const stats = statsMap[v.id] || {};
      return {
        id: v.id,
        phone: v.phone,
        name: v.name,
        email: v.email,
        storeName: (v as unknown as Record<string, unknown>)["storeName"] ?? null,
        storeCategory: (v as unknown as Record<string, unknown>)["storeCategory"] ?? null,
        storeIsOpen: (v as unknown as Record<string, unknown>)["storeIsOpen"] ?? false,
        storeDescription: (v as unknown as Record<string, unknown>)["storeDescription"] ?? null,
        walletBalance: parseFloat(v.walletBalance ?? "0"),
        isActive: v.isActive,
        isBanned: v.isBanned,
        approvalStatus: v.approvalStatus,
        approvalNote: v.approvalNote,
        roles: v.roles,
        role: v.roles,
        createdAt: v.createdAt.toISOString(),
        lastLoginAt: v.lastLoginAt ? v.lastLoginAt.toISOString() : null,
        totalOrders: Number(stats.totalOrders ?? 0),
        totalRevenue: parseFloat(String(stats.totalRevenue ?? "0")),
        pendingOrders: Number(stats.pendingOrders ?? 0),
      };
    }),
    total: vendors.length,
  });
});

router.patch("/vendors/:id/status", requirePermission("vendors.edit"), async (req, res) => {
  const { isActive, isBanned, banReason, securityNote, approvalStatus, approvalNote } = req.body;
  const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (isActive !== undefined) updates.isActive = isActive;
  if (isBanned !== undefined) updates.isBanned = isBanned;
  if (banReason !== undefined) updates.banReason = banReason || null;
  if (securityNote !== undefined) updates.securityNote = securityNote || null;
  if (approvalStatus !== undefined) updates.approvalStatus = approvalStatus;
  if (approvalNote !== undefined) updates.approvalNote = approvalNote || null;
  const vendorId = req.params["id"] as string;
  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, vendorId))
    .returning();
  if (!user) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  if (isBanned || isActive === false) {
    revokeAllUserSessions(vendorId).catch((e: Error) => {
      logger.warn(
        { err: e.message, userId: vendorId },
        "[admin] session revocation failed after vendor ban/deactivation"
      );
    });
    if (isBanned) {
      await sendUserNotification(
        vendorId,
        "Store Account Suspended ⚠️",
        banReason || "Your vendor account has been suspended. Contact support.",
        "warning",
        "warning-outline"
      );
    }
  }
  if (approvalStatus === "approved") {
    await sendUserNotification(
      vendorId,
      "Store Approved! 🎉",
      "Congratulations! Your vendor account has been approved. Start adding products and manage your store.",
      "system",
      "checkmark-circle-outline"
    );
  }
  if (approvalStatus === "rejected") {
    const reason = approvalNote || banReason || "Your application did not meet our requirements.";
    await sendUserNotification(
      vendorId,
      "Application Not Approved ❌",
      `Your vendor application was not approved. Reason: ${reason}`,
      "warning",
      "close-circle-outline"
    );
  }
  res.json({ ...stripUser(user), walletBalance: parseFloat(String(user.walletBalance ?? "0")) });
});

router.post(
  "/vendors/:id/payout",
  requirePermission("finance.payouts.release"),
  async (req, res) => {
    const { amount, description } = req.body;
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
    /* Atomic deduction: WHERE wallet_balance >= amt prevents race condition where two concurrent
     payout requests both read the same balance and double-deduct. */
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

router.post(
  "/vendors/:id/credit",
  requirePermission("finance.payouts.release"),
  async (req, res) => {
    const { amount, description } = req.body;
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
    /* Atomic credit: sql`wallet_balance + ${amt}` avoids read-modify-write race condition */
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
  }
);

/* ══════════════════════════════════════
   RIDER MANAGEMENT
══════════════════════════════════════ */
router.get("/riders", requirePermission("fleet.rides.view"), async (_req, res) => {
  const riders = await db
    .select()
    .from(usersTable)
    .where(or(ilike(usersTable.roles, "%rider%"), eq(usersTable.roles, "rider")))
    .orderBy(desc(usersTable.createdAt));

  const riderIds = riders.map((r) => r.id);
  const [penaltyRows, ratingRows] = await Promise.all([
    riderIds.length > 0
      ? db
          .select({ riderId: riderPenaltiesTable.riderId, total: sum(riderPenaltiesTable.amount) })
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
    (penaltyRows as Array<{ riderId: string; total: string | null }>).map((r) => [
      r.riderId,
      parseFloat(String(r.total ?? "0")),
    ])
  );
  const ratingMap = new Map(
    (ratingRows as Array<{ riderId: string; avgRating: string; ratingCount: number }>).map((r) => [
      r.riderId,
      { avg: parseFloat(String(r.avgRating ?? "0")), count: r.ratingCount as number },
    ])
  );

  res.json({
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
      role: r.roles,
      isOnline: r.isOnline ?? false,
      createdAt: r.createdAt.toISOString(),
      lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    })),
    total: riders.length,
  });
});

router.patch("/riders/:id/status", requirePermission("vendors.edit"), async (req, res) => {
  const { isActive, isBanned, banReason } = req.body;
  const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (isActive !== undefined) updates.isActive = isActive;
  if (isBanned !== undefined) updates.isBanned = isBanned;
  if (banReason !== undefined) updates.banReason = banReason || null;
  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.params["id"] as string))
    .returning();
  if (!user) {
    res.status(404).json({ error: "Rider not found" });
    return;
  }
  if (isBanned || isActive === false) {
    revokeAllUserSessions(req.params["id"] as string).catch((e: Error) => {
      logger.warn(
        { err: e.message, userId: req.params["id"] as string },
        "[admin] session revocation failed after rider ban/deactivation"
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
  res.json({ ...stripUser(user), walletBalance: parseFloat(String(user.walletBalance ?? "0")) });
});

router.post(
  "/riders/:id/payout",
  requirePermission("finance.payouts.release"),
  async (req, res) => {
    const { amount, description } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: "Valid amount required" });
      return;
    }
    const [rider] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.params["id"] as string))
      .limit(1);
    if (!rider) {
      res.status(404).json({ error: "Rider not found" });
      return;
    }
    const amt = Number(amount);
    const currentBal = parseFloat(rider.walletBalance ?? "0");
    if (currentBal < amt) {
      res.status(400).json({ error: `Insufficient wallet balance (Rs. ${currentBal.toFixed(0)})` });
      return;
    }
    /* Atomic deduction: WHERE wallet_balance >= amt prevents race condition where
     two concurrent payout requests both read the same balance and double-deduct. */
    const [updated] = await db
      .update(usersTable)
      .set({ walletBalance: sql`wallet_balance - ${amt}`, updatedAt: new Date() })
      .where(and(eq(usersTable.id, rider.id), sql`CAST(wallet_balance AS NUMERIC) >= ${amt}`))
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
      userId: rider.id,
      type: "debit",
      amount: String(amt),
      description: description || `Rider payout: Rs. ${amt}`,
      reference: "rider_payout",
    });
    await sendUserNotification(
      rider.id,
      "Earnings Paid Out 💵",
      `Rs. ${amt} has been paid out to your account.`,
      "system",
      "cash-outline"
    );
    res.json({
      success: true,
      amount: amt,
      newBalance: newBal,
      rider: { ...stripUser(updated), walletBalance: newBal },
    });
  }
);

router.post("/riders/:id/bonus", requirePermission("finance.payouts.release"), async (req, res) => {
  const { amount, description } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    res.status(400).json({ error: "Valid amount required" });
    return;
  }
  const riderId = req.params["id"] as string;
  const amt = Number(amount);
  const txId = generateId();

  let updated: typeof usersTable.$inferSelect | undefined;
  let newBal = 0;
  try {
    await db.transaction(async (tx) => {
      const [rider] = await tx.select().from(usersTable).where(eq(usersTable.id, riderId)).limit(1);
      if (!rider) throw new Error("NOT_FOUND");
      await tx
        .update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${amt}`, updatedAt: new Date() })
        .where(eq(usersTable.id, riderId));
      await tx.insert(walletTransactionsTable).values({
        id: txId,
        userId: riderId,
        type: "credit",
        amount: String(amt),
        description: description || `Admin bonus: Rs. ${amt}`,
        reference: "rider_bonus",
      });
      const [refreshed] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, riderId))
        .limit(1);
      updated = refreshed;
      newBal = parseFloat(refreshed?.walletBalance ?? "0");
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      res.status(404).json({ error: "Rider not found" });
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
  res.json({
    success: true,
    amount: amt,
    newBalance: newBal,
    rider: { ...stripUser(updated!), walletBalance: newBal },
  });
});

router.get(
  "/riders/:id/penalties",
  requirePermission("finance.payouts.release"),
  async (req, res) => {
    const riderId = req.params["id"] as string;
    const penalties = await db
      .select()
      .from(riderPenaltiesTable)
      .where(eq(riderPenaltiesTable.riderId, riderId))
      .orderBy(desc(riderPenaltiesTable.createdAt))
      .limit(100);
    res.json({ penalties: penalties.map((p) => ({ ...p, amount: parseFloat(String(p.amount)) })) });
  }
);

router.get("/riders/:id/ratings", requirePermission("fleet.rides.view"), async (req, res) => {
  const riderId = req.params["id"] as string;
  const ratings = await db
    .select()
    .from(rideRatingsTable)
    .where(eq(rideRatingsTable.riderId, riderId))
    .orderBy(desc(rideRatingsTable.createdAt))
    .limit(100);
  res.json({ ratings });
});

router.post("/riders/:id/restrict", requirePermission("vendors.edit"), async (req, res) => {
  const riderId = req.params["id"] as string;
  const [user] = await db
    .update(usersTable)
    .set({ isRestricted: true, updatedAt: new Date() })
    .where(eq(usersTable.id, riderId))
    .returning();
  if (!user) {
    res.status(404).json({ error: "Rider not found" });
    return;
  }
  await sendUserNotification(
    riderId,
    "Account Restricted ⚠️",
    "Your account has been restricted by admin. Contact support for more details.",
    "system",
    "alert-circle-outline"
  );
  res.json({ success: true, isRestricted: true });
});

router.post("/riders/:id/unrestrict", requirePermission("vendors.edit"), async (req, res) => {
  const riderId = req.params["id"] as string;
  const [user] = await db
    .update(usersTable)
    .set({ isRestricted: false, updatedAt: new Date() })
    .where(eq(usersTable.id, riderId))
    .returning();
  if (!user) {
    res.status(404).json({ error: "Rider not found" });
    return;
  }
  await sendUserNotification(
    riderId,
    "Account Unrestricted ✅",
    "Your account has been unrestricted. You can now accept rides again.",
    "system",
    "checkmark-circle-outline"
  );
  res.json({ success: true, isRestricted: false });
});

/* ── GET /admin/withdrawal-requests ─────────── */
router.get(
  "/withdrawal-requests",
  requirePermission("finance.withdrawals.view"),
  async (req, res) => {
    const statusFilter = req.query["status"] as string | undefined;
    const rawLimit = parseInt(String(req.query["limit"] ?? "50"), 10);
    const pageLimit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50), 200);
    const rawPage = parseInt(String(req.query["page"] ?? "1"), 10);
    const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
    const offset = (page - 1) * pageLimit;

    const [txns, [countRow]] = await Promise.all([
      db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.type, "withdrawal"))
        .orderBy(desc(walletTransactionsTable.createdAt))
        .limit(pageLimit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.type, "withdrawal")),
    ]);

    const userIds = [...new Set(txns.map((t) => t.userId))];
    const users =
      userIds.length > 0
        ? await db
            .select({
              id: usersTable.id,
              name: usersTable.name,
              phone: usersTable.phone,
              role: usersTable.roles,
            })
            .from(usersTable)
            .where(
              sql`${usersTable.id} = ANY(${sql.raw(`ARRAY[${userIds.map((id) => `'${id}'`).join(",")}]`)})`
            )
        : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const enriched = txns.map((t) => {
      const ref = t.reference ?? "pending";
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
        ...t,
        amount: parseFloat(String(t.amount)),
        user: userMap[t.userId] ?? null,
        status,
        refNo,
      };
    });

    const filtered = statusFilter ? enriched.filter((w) => w.status === statusFilter) : enriched;
    res.json({
      withdrawals: filtered,
      total: Number(countRow?.count ?? 0),
      page,
      pageSize: pageLimit,
    });
  }
);

/* ── PATCH /admin/withdrawal-requests/:id/approve ─── */
router.patch(
  "/withdrawal-requests/:id/approve",
  requirePermission("finance.withdrawals.view"),
  async (req, res) => {
    const { refNo, note } = req.body;
    const txId = req.params["id"] as string;
    const [tx] = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.id, txId))
      .limit(1);
    if (!tx) {
      res.status(404).json({ error: "Withdrawal not found" });
      return;
    }
    if (tx.reference && tx.reference !== "pending") {
      res.status(400).json({ error: `Already processed (${tx.reference})` });
      return;
    }
    const ref = refNo ? `paid:${refNo.trim()}` : "paid:manual";
    await db
      .update(walletTransactionsTable)
      .set({ reference: ref })
      .where(eq(walletTransactionsTable.id, txId));
    const amt = parseFloat(String(tx.amount));
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
      .catch((e: Error) => {
        logger.warn(
          { err: e.message, txId, userId: tx.userId },
          "[admin] withdrawal-approved notification insert failed"
        );
      });
    res.json({ success: true, txId, status: "paid", refNo: refNo || "manual" });
  }
);

/* ── PATCH /admin/withdrawal-requests/:id/reject ─── */
router.patch(
  "/withdrawal-requests/:id/reject",
  requirePermission("finance.withdrawals.view"),
  async (req, res) => {
    const { reason } = req.body;
    const txId = req.params["id"] as string;
    const [tx] = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.id, txId))
      .limit(1);
    if (!tx) {
      res.status(404).json({ error: "Withdrawal not found" });
      return;
    }
    if (tx.reference && tx.reference !== "pending") {
      res.status(400).json({ error: `Already processed (${tx.reference})` });
      return;
    }
    const rejReason = reason?.trim() || "Admin rejected";
    await db
      .update(walletTransactionsTable)
      .set({ reference: `rejected:${rejReason}` })
      .where(eq(walletTransactionsTable.id, txId));
    const amt = parseFloat(String(tx.amount));
    await db
      .update(usersTable)
      .set({ walletBalance: sql`wallet_balance + ${amt}`, updatedAt: new Date() })
      .where(eq(usersTable.id, tx.userId));
    await db.insert(walletTransactionsTable).values({
      id: generateId(),
      userId: tx.userId,
      type: "credit",
      amount: amt.toFixed(2),
      description: `Withdrawal Refunded — ${rejReason}`,
      reference: `refund:${txId}`,
      paymentMethod: null,
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
      .catch((e: Error) => {
        logger.warn(
          { err: e.message, txId, userId: tx.userId },
          "[admin] withdrawal-rejected notification insert failed"
        );
      });
    res.json({ success: true, txId, status: "rejected", reason: rejReason, refunded: amt });
  }
);

/* ── PATCH /admin/withdrawal-requests/batch-approve ─── */
router.patch(
  "/withdrawal-requests/batch-approve",
  requirePermission("finance.withdrawals.view"),
  async (req, res) => {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids required" });
      return;
    }

    const preChecked: { tx: typeof walletTransactionsTable.$inferSelect; refNo: string }[] = [];
    for (const txId of ids) {
      const [tx] = await db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.id, txId))
        .limit(1);
      if (!tx || (tx.reference && tx.reference !== "pending")) continue;
      preChecked.push({ tx, refNo: `BATCH-${Date.now()}` });
    }

    if (preChecked.length === 0) {
      res.json({ success: true, approved: [] });
      return;
    }

    try {
      await db.transaction(async (trx) => {
        for (const { tx, refNo } of preChecked) {
          const [marked] = await trx
            .update(walletTransactionsTable)
            .set({ reference: refNo })
            .where(
              and(
                eq(walletTransactionsTable.id, tx.id),
                eq(walletTransactionsTable.reference, "pending")
              )
            )
            .returning({ id: walletTransactionsTable.id });
          if (!marked)
            throw new Error(`Withdrawal ${tx.id} was already processed (race condition)`);
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(409).json({ error: msg });
      return;
    }

    for (const { tx, refNo } of preChecked) {
      const batchAppLang = await getUserLanguage(tx.userId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: tx.userId,
          title: t("notifWithdrawalApproved" as TranslationKey, batchAppLang),
          body: t("notifWithdrawalApprovedBody" as TranslationKey, batchAppLang)
            .replace("{amount}", parseFloat(String(tx.amount)).toFixed(0))
            .replace("{ref}", ` Ref: ${refNo}`)
            .replace("{note}", ""),
          type: "wallet",
          icon: "checkmark-circle-outline",
        })
        .catch((e: Error) => {
          logger.warn(
            { err: e.message, txId: tx.id, userId: tx.userId },
            "[admin] batch-approve notification insert failed"
          );
        });
    }
    res.json({ success: true, approved: preChecked.map((p) => p.tx.id) });
  }
);

/* ── PATCH /admin/withdrawal-requests/batch-reject ─── */
router.patch(
  "/withdrawal-requests/batch-reject",
  requirePermission("finance.withdrawals.view"),
  async (req, res) => {
    const { ids, reason } = req.body as { ids: string[]; reason: string };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids required" });
      return;
    }
    const rejReason = (reason || "Admin batch rejected").trim();

    const preChecked: { tx: typeof walletTransactionsTable.$inferSelect; amt: number }[] = [];
    for (const txId of ids) {
      const [tx] = await db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.id, txId))
        .limit(1);
      if (!tx || (tx.reference && tx.reference !== "pending")) continue;
      preChecked.push({ tx, amt: parseFloat(String(tx.amount)) });
    }

    if (preChecked.length === 0) {
      res.json({ success: true, rejected: [] });
      return;
    }

    try {
      await db.transaction(async (trx) => {
        for (const { tx, amt } of preChecked) {
          const [marked] = await trx
            .update(walletTransactionsTable)
            .set({ reference: `rejected:${rejReason}` })
            .where(
              and(
                eq(walletTransactionsTable.id, tx.id),
                eq(walletTransactionsTable.reference, "pending")
              )
            )
            .returning({ id: walletTransactionsTable.id });
          if (!marked)
            throw new Error(`Withdrawal ${tx.id} was already processed (race condition)`);
          await trx
            .update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${amt}`, updatedAt: new Date() })
            .where(eq(usersTable.id, tx.userId));
          await trx.insert(walletTransactionsTable).values({
            id: generateId(),
            userId: tx.userId,
            type: "credit",
            amount: amt.toFixed(2),
            description: `Withdrawal Refunded — ${rejReason}`,
            reference: `refund:${tx.id}`,
            paymentMethod: null,
          });
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(409).json({ error: msg });
      return;
    }

    for (const { tx, amt } of preChecked) {
      const batchRejLang = await getUserLanguage(tx.userId);
      await db
        .insert(notificationsTable)
        .values({
          id: generateId(),
          userId: tx.userId,
          title: t("notifWithdrawalRejected" as TranslationKey, batchRejLang),
          body: t("notifWithdrawalRejectedBody" as TranslationKey, batchRejLang)
            .replace("{amount}", amt.toFixed(0))
            .replace("{reason}", rejReason),
          type: "wallet",
          icon: "close-circle-outline",
        })
        .catch((e: Error) => {
          logger.warn(
            { err: e.message, txId: tx.id, userId: tx.userId },
            "[admin] batch-reject notification insert failed"
          );
        });
    }
    res.json({ success: true, rejected: preChecked.map((p) => p.tx.id) });
  }
);

/* ── GET /admin/deposit-requests — List all rider deposit requests ─── */
router.get("/deposit-requests", requirePermission("finance.deposits.review"), async (req, res) => {
  const statusFilter = req.query["status"] as string | undefined;
  const rawLimit = parseInt(String(req.query["limit"] ?? "50"), 10);
  const pageLimit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50), 200);
  const rawPage = parseInt(String(req.query["page"] ?? "1"), 10);
  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  const offset = (page - 1) * pageLimit;

  const [txns, [countRow]] = await Promise.all([
    db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.type, "deposit"))
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(pageLimit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.type, "deposit")),
  ]);

  const userIds = [...new Set(txns.map((t) => t.userId))];
  const users =
    userIds.length > 0
      ? await db
          .select({
            id: usersTable.id,
            name: usersTable.name,
            phone: usersTable.phone,
            role: usersTable.roles,
          })
          .from(usersTable)
          .where(
            sql`${usersTable.id} = ANY(${sql.raw(`ARRAY[${userIds.map((id) => `'${id}'`).join(",")}]`)})`
          )
      : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const enriched = txns.map((t) => {
    const ref = t.reference ?? "pending";
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
      ...t,
      amount: parseFloat(String(t.amount)),
      user: userMap[t.userId] ?? null,
      status,
      refNo,
    };
  });

  const filtered = statusFilter ? enriched.filter((d) => d.status === statusFilter) : enriched;
  res.json({ deposits: filtered, total: Number(countRow?.count ?? 0), page, pageSize: pageLimit });
});

/* ── PATCH /admin/deposit-requests/:id/approve — Approve a rider deposit (credits wallet, atomic) ─── */
router.patch(
  "/deposit-requests/:id/approve",
  requirePermission("finance.deposits.review"),
  async (req, res) => {
    const { refNo, note: _note } = req.body;
    const txId = req.params["id"] as string;

    const [tx] = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.id, txId))
      .limit(1);
    if (!tx) {
      res.status(404).json({ error: "Deposit not found" });
      return;
    }
    if (tx.type !== "deposit") {
      res.status(400).json({ error: "Not a deposit record" });
      return;
    }

    const amt = parseFloat(String(tx.amount));
    const txidSuffix =
      tx.reference && tx.reference.includes("txid:") ? `:${tx.reference.split("txid:").pop()}` : "";

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
        res
          .status(409)
          .json({ error: "A deposit with this Transaction ID has already been approved" });
        return;
      }
    }
    const approvedRef = refNo
      ? `approved:${refNo.trim()}${txidSuffix}`
      : `approved:manual${txidSuffix}`;

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
        await trx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance + ${amt}`, updatedAt: new Date() })
          .where(eq(usersTable.id, tx.userId));
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
        res
          .status(409)
          .json({ error: `Deposit already processed (${current?.reference ?? "unknown state"})` });
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
      .catch((e) => logger.error("deposit approval notif failed:", e));
    res.json({ success: true, txId, status: "approved", credited: amt });
  }
);

/* ── PATCH /admin/deposit-requests/:id/reject — Reject a rider deposit (atomic state transition) ─── */
router.patch(
  "/deposit-requests/:id/reject",
  requirePermission("finance.deposits.review"),
  async (req, res) => {
    const { reason } = req.body;
    const txId = req.params["id"] as string;

    /* Verify type first (cheap read) */
    const [tx] = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.id, txId))
      .limit(1);
    if (!tx) {
      res.status(404).json({ error: "Deposit not found" });
      return;
    }
    if (tx.type !== "deposit") {
      res.status(400).json({ error: "Not a deposit record" });
      return;
    }

    const rejReason = reason?.trim() || "Admin rejected";
    const txidSuffix =
      tx.reference && tx.reference.includes("txid:") ? `:${tx.reference.split("txid:").pop()}` : "";

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
      res
        .status(409)
        .json({ error: `Deposit already processed (${current?.reference ?? "unknown state"})` });
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
      .catch((e) => logger.error("deposit rejection notif failed:", e));
    res.json({ success: true, txId, status: "rejected", reason: rejReason });
  }
);

/* ── POST /admin/deposit-requests/bulk-approve — Bulk approve customer pending deposits (all-or-nothing atomic) ─── */
router.post(
  "/deposit-requests/bulk-approve",
  requirePermission("finance.deposits.review"),
  async (req, res) => {
    const { ids, refNo } = req.body as { ids: string[]; refNo?: string };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids array is required" });
      return;
    }
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length > 50) {
      res.status(400).json({ error: "Maximum 50 deposits per bulk action" });
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
        res.status(400).json({ error: `Deposit ${txId} not found` });
        return;
      }
      if (tx.type !== "deposit") {
        res.status(400).json({ error: `${txId} is not a deposit record` });
        return;
      }
      const ref = tx.reference ?? "pending";
      const isPending = ref === "pending" || ref.startsWith("pending:");
      if (!isPending) {
        res.status(409).json({ error: `Deposit ${txId} already processed (${ref})` });
        return;
      }
      const [user] = await db
        .select({ roles: usersTable.roles })
        .from(usersTable)
        .where(eq(usersTable.id, tx.userId))
        .limit(1);
      if (!user) {
        res.status(400).json({ error: `User not found for deposit ${txId}` });
        return;
      }
      if (user.roles !== "customer") {
        res.status(400).json({
          error: `Deposit ${txId} belongs to a ${user.roles}, not a customer. Bulk actions are for customer deposits only.`,
        });
        return;
      }
      const amt = parseFloat(String(tx.amount));
      if (!Number.isFinite(amt) || amt <= 0) {
        res.status(400).json({ error: `Invalid amount for deposit ${txId}` });
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
            .set({ walletBalance: sql`wallet_balance + ${amt}`, updatedAt: new Date() })
            .where(eq(usersTable.id, tx.userId))
            .returning({ id: usersTable.id });
          if (!credited) throw new Error(`User ${tx.userId} not found for deposit ${tx.id}`);
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(409).json({ error: msg });
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
        .catch((e) => logger.error("bulk deposit approval notif failed:", e));
    }

    res.json({ success: true, approved: preChecked.length });
  }
);

/* ── POST /admin/deposit-requests/bulk-reject — Bulk reject customer pending deposits (all-or-nothing atomic) ─── */
router.post(
  "/deposit-requests/bulk-reject",
  requirePermission("finance.deposits.review"),
  async (req, res) => {
    const { ids, reason } = req.body as { ids: string[]; reason: string };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids array is required" });
      return;
    }
    if (!reason?.trim()) {
      res.status(400).json({ error: "reason is required" });
      return;
    }
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length > 50) {
      res.status(400).json({ error: "Maximum 50 deposits per bulk action" });
      return;
    }

    const rejReason = reason.trim();

    const preChecked: { tx: typeof walletTransactionsTable.$inferSelect; rejRef: string }[] = [];
    for (const txId of uniqueIds) {
      const [tx] = await db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.id, txId))
        .limit(1);
      if (!tx) {
        res.status(400).json({ error: `Deposit ${txId} not found` });
        return;
      }
      if (tx.type !== "deposit") {
        res.status(400).json({ error: `${txId} is not a deposit record` });
        return;
      }
      const ref = tx.reference ?? "pending";
      const isPending = ref === "pending" || ref.startsWith("pending:");
      if (!isPending) {
        res.status(409).json({ error: `Deposit ${txId} already processed (${ref})` });
        return;
      }
      const [user] = await db
        .select({ roles: usersTable.roles })
        .from(usersTable)
        .where(eq(usersTable.id, tx.userId))
        .limit(1);
      if (!user) {
        res.status(400).json({ error: `User not found for deposit ${txId}` });
        return;
      }
      if (user.roles !== "customer") {
        res.status(400).json({
          error: `Deposit ${txId} belongs to a ${user.roles}, not a customer. Bulk actions are for customer deposits only.`,
        });
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
      res.status(409).json({ error: msg });
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
        .catch((e) => logger.error("bulk deposit rejection notif failed:", e));
    }

    res.json({ success: true, rejected: preChecked.length });
  }
);

/* ── POST /admin/riders/:id/credit ─────────── */
router.post(
  "/riders/:id/credit",
  requirePermission("finance.payouts.release"),
  async (req, res) => {
    const { amount, description, type } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: "Valid amount required" });
      return;
    }
    const [rider] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.params["id"] as string))
      .limit(1);
    if (!rider) {
      res.status(404).json({ error: "Rider not found" });
      return;
    }
    const roles = (rider.roles || "").split(",").map((r: string) => r.trim());
    if (!roles.includes("rider")) {
      res.status(400).json({ error: "User is not a rider" });
      return;
    }
    const amt = Number(amount);
    const txType = type === "bonus" ? "bonus" : "credit";
    const [updated] = await db
      .update(usersTable)
      .set({ walletBalance: sql`wallet_balance + ${amt}`, updatedAt: new Date() })
      .where(eq(usersTable.id, rider.id))
      .returning();
    await db.insert(walletTransactionsTable).values({
      id: generateId(),
      userId: rider.id,
      type: txType,
      amount: String(amt),
      description: description || `Admin credit: Rs. ${amt}`,
      reference: txType === "bonus" ? "rider_bonus" : "admin_credit",
    });
    await sendUserNotification(
      rider.id,
      txType === "bonus" ? "Bonus Received! 🎉" : "Wallet Credited 💰",
      `Rs. ${amt} aapke wallet mein add ho gaya. ${description || ""}`,
      "wallet",
      "wallet-outline"
    );
    res.json({ success: true, amount: amt, newBalance: parseFloat(updated?.walletBalance ?? "0") });
  }
);
router.patch(
  "/vendors/:id/commission",
  requirePermission("finance.payouts.release"),
  async (req, res) => {
    const { commissionPct } = req.body as { commissionPct: number };
    if (commissionPct === undefined || isNaN(Number(commissionPct))) {
      res.status(400).json({ error: "commissionPct required" });
      return;
    }
    const [vendor] = await db
      .update(usersTable)
      .set({ commissionOverride: String(commissionPct), updatedAt: new Date() })
      .where(eq(usersTable.id, req.params["id"] as string))
      .returning();
    if (!vendor) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    void addAuditEntry({
      action: "vendor_commission_override",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Commission override ${commissionPct}% for vendor ${req.params["id"] as string}`,
      result: "success",
    });
    res.json({ success: true, commissionPct });
  }
);

/* ── POST /admin/riders/:id/override-suspension ── */
router.post(
  "/riders/:id/override-suspension",
  requirePermission("vendors.edit"),
  async (req, res) => {
    const userId = req.params["id"] as string;
    const [user] = await db
      .select({ id: usersTable.id, autoSuspendedAt: usersTable.autoSuspendedAt })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Rider not found" });
      return;
    }
    if (!user.autoSuspendedAt) {
      res.status(400).json({ error: "Rider was not auto-suspended" });
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
      .catch((e: Error) => {
        logger.warn(
          { err: e.message, userId },
          "[admin] rider suspension-override notification insert failed"
        );
      });

    res.json({ success: true, user: stripUser(updated) });
  }
);

/* ── POST /admin/vendors/:id/override-suspension — override auto-suspension ─ */
router.post(
  "/vendors/:id/override-suspension",
  requirePermission("vendors.edit"),
  async (req, res) => {
    const userId = req.params["id"] as string;
    const [user] = await db
      .select({ id: usersTable.id, autoSuspendedAt: usersTable.autoSuspendedAt })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    if (!user.autoSuspendedAt) {
      res.status(400).json({ error: "Vendor was not auto-suspended" });
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
      .catch((e: Error) => {
        logger.warn(
          { err: e.message, userId },
          "[admin] vendor suspension-override notification insert failed"
        );
      });

    res.json({ success: true, user: stripUser(updated) });
  }
);

export default router;
