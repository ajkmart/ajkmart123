import { db } from "@workspace/db";
import {
  loyaltyCampaignsTable,
  loyaltyRewardsTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../lib/response.js";
import { adminAuth, getCachedSettings } from "./admin-shared.js";

const router = Router();

const campaignCreateSchema = z.object({
  name: z.string().min(1, "name is required").max(200),
  description: z.string().max(500).optional().nullable(),
  type: z.string().optional().default("bonus_multiplier"),
  bonusMultiplier: z.number().min(0).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.enum(["draft", "active", "paused", "expired"]).optional().default("draft"),
});

const campaignUpdateSchema = campaignCreateSchema.partial();

const rewardCreateSchema = z.object({
  name: z.string().min(1, "name is required").max(200),
  description: z.string().max(500).optional().nullable(),
  pointsCost: z.number().int().min(1, "pointsCost must be at least 1"),
  rewardType: z.string().optional().default("discount"),
  rewardValue: z.number().min(0, "rewardValue must be non-negative"),
  stock: z.number().int().min(0).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

const rewardUpdateSchema = rewardCreateSchema.partial();

router.get("/settings", async (_req, res) => {
  try {
    const s = await getCachedSettings();
    sendSuccess(res, {
      settings: {
        pointsRate: parseFloat(s["loyalty_points_rate"] ?? "1"),
        pointsPerOrder: parseFloat(s["loyalty_points_per_order"] ?? "10"),
        minRedeemPoints: parseInt(s["loyalty_min_redeem_points"] ?? "100"),
        enabled: s["loyalty_enabled"] !== "false",
        pointsLabel: s["loyalty_points_label"] ?? "Points",
        expiryDays: parseInt(s["loyalty_points_expiry_days"] ?? "0"),
      },
    });
  } catch (err) {
    logger.error({ err }, "[loyalty-full] settings error");
    sendError(res, "Failed to fetch loyalty settings", 500);
  }
});

router.get("/leaderboard", async (_req, res) => {
  try {
    const txns = await db
      .select({
        userId: walletTransactionsTable.userId,
        type: walletTransactionsTable.type,
        amount: walletTransactionsTable.amount,
        reference: walletTransactionsTable.reference,
      })
      .from(walletTransactionsTable)
      .where(
        or(
          sql`${walletTransactionsTable.type} = 'loyalty'`,
          sql`${walletTransactionsTable.reference} LIKE 'loyalty_redeem_%'`
        )!
      );

    const perUser = new Map<string, { earned: number; redeemed: number }>();
    for (const t of txns) {
      if (!perUser.has(t.userId)) perUser.set(t.userId, { earned: 0, redeemed: 0 });
      const u = perUser.get(t.userId)!;
      const amt = parseFloat(t.amount ?? "0");
      if (t.reference === "admin_loyalty_debit") {
        u.redeemed += amt;
      } else if (t.type === "loyalty") {
        u.earned += amt;
      } else if (t.type === "credit" && t.reference?.startsWith("loyalty_redeem_")) {
        u.redeemed += amt;
      }
    }

    const topEntries = Array.from(perUser.entries())
      .map(([userId, { earned, redeemed }]) => ({
        userId,
        points: Math.max(0, Math.floor(earned) - Math.floor(redeemed)),
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 20);

    if (topEntries.length === 0) {
      sendSuccess(res, { leaderboard: [] });
      return;
    }

    const top20Ids = topEntries.map((e) => e.userId);
    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        avatar: usersTable.avatar,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, top20Ids));

    const userMap = new Map(users.map((u) => [u.id, u]));

    const leaderboard = topEntries.map((entry, idx) => ({
      rank: idx + 1,
      ...entry,
      user: userMap.get(entry.userId) ?? {
        id: entry.userId,
        name: null,
        phone: null,
        avatar: null,
      },
    }));

    sendSuccess(res, { leaderboard });
  } catch (err) {
    logger.error({ err }, "[loyalty-full] leaderboard error");
    sendError(res, "Failed to fetch leaderboard", 500);
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const txns = await db
      .select({
        userId: walletTransactionsTable.userId,
        type: walletTransactionsTable.type,
        amount: walletTransactionsTable.amount,
        reference: walletTransactionsTable.reference,
      })
      .from(walletTransactionsTable)
      .where(
        or(
          sql`${walletTransactionsTable.type} = 'loyalty'`,
          sql`${walletTransactionsTable.reference} LIKE 'loyalty_redeem_%'`
        )!
      );

    let totalIssued = 0;
    let totalRedeemed = 0;
    const earnerIds = new Set<string>();

    for (const t of txns) {
      const amt = parseFloat(t.amount ?? "0");
      if (t.reference === "admin_loyalty_debit") {
        totalRedeemed += amt;
      } else if (t.type === "loyalty") {
        totalIssued += amt;
        earnerIds.add(t.userId);
      } else if (t.type === "credit" && t.reference?.startsWith("loyalty_redeem_")) {
        totalRedeemed += amt;
      }
    }

    sendSuccess(res, {
      stats: {
        totalIssued: Math.floor(totalIssued),
        totalRedeemed: Math.floor(totalRedeemed),
        outstanding: Math.max(0, Math.floor(totalIssued) - Math.floor(totalRedeemed)),
        uniqueEarners: earnerIds.size,
      },
    });
  } catch (err) {
    logger.error({ err }, "[loyalty-full] stats error");
    sendError(res, "Failed to fetch loyalty stats", 500);
  }
});

/* ── Loyalty Campaigns ───────────────────────────────────────────────────── */

router.get("/campaigns", async (_req, res) => {
  try {
    const campaigns = await db
      .select()
      .from(loyaltyCampaignsTable)
      .orderBy(desc(loyaltyCampaignsTable.createdAt));
    sendSuccess(res, { campaigns });
  } catch (err) {
    logger.error({ err }, "[loyalty-full] campaigns list error");
    sendError(res, "Failed to fetch loyalty campaigns", 500);
  }
});

router.post("/campaigns", adminAuth, async (req, res) => {
  try {
    const p = campaignCreateSchema.safeParse(req.body ?? {});
    if (!p.success) {
      sendValidationError(res, p.error.errors.map((e) => e.message).join("; "));
      return;
    }

    try {
      const { name, description, type, bonusMultiplier, startDate, endDate, status } = p.data;

      const [created] = await db
        .insert(loyaltyCampaignsTable)
        .values({
          id: generateId(),
          name,
          description: description ?? null,
          type,
          bonusMultiplier: bonusMultiplier != null ? String(bonusMultiplier) : "1.00",
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          status,
        })
        .returning();

      sendSuccess(res, { campaign: created });
    } catch (err) {
      logger.error({ err }, "[loyalty-full] campaigns create error");
      sendError(res, "Failed to create loyalty campaign", 500);
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
});

router.put("/campaigns/:id", adminAuth, async (req, res) => {
  try {
    const p = campaignUpdateSchema.safeParse(req.body ?? {});
    if (!p.success) {
      sendValidationError(res, p.error.errors.map((e) => e.message).join("; "));
      return;
    }

    try {
      const { id } = req.params as Record<string, string>;
      const [existing] = await db
        .select()
        .from(loyaltyCampaignsTable)
        .where(eq(loyaltyCampaignsTable.id, id))
        .limit(1);

      if (!existing) {
        sendNotFound(res, "Loyalty campaign not found");
        return;
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const d = p.data;
      if (d.name !== undefined) updates.name = d.name;
      if (d.description !== undefined) updates.description = d.description;
      if (d.type !== undefined) updates.type = d.type;
      if (d.bonusMultiplier !== undefined) updates.bonusMultiplier = String(d.bonusMultiplier);
      if (d.startDate !== undefined) updates.startDate = d.startDate ? new Date(d.startDate) : null;
      if (d.endDate !== undefined) updates.endDate = d.endDate ? new Date(d.endDate) : null;
      if (d.status !== undefined) updates.status = d.status;

      const [updated] = await db
        .update(loyaltyCampaignsTable)
        .set(updates)
        .where(eq(loyaltyCampaignsTable.id, id))
        .returning();

      sendSuccess(res, { campaign: updated });
    } catch (err) {
      logger.error({ err }, "[loyalty-full] campaigns update error");
      sendError(res, "Failed to update loyalty campaign", 500);
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
});

router.delete("/campaigns/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [existing] = await db
      .select()
      .from(loyaltyCampaignsTable)
      .where(eq(loyaltyCampaignsTable.id, id))
      .limit(1);

    if (!existing) {
      sendNotFound(res, "Loyalty campaign not found");
      return;
    }

    await db.delete(loyaltyCampaignsTable).where(eq(loyaltyCampaignsTable.id, id));
    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error({ err }, "[loyalty-full] campaigns delete error");
    sendError(res, "Failed to delete loyalty campaign", 500);
  }
});

/* ── Loyalty Rewards ─────────────────────────────────────────────────────── */

router.get("/rewards", async (_req, res) => {
  try {
    const rewards = await db
      .select()
      .from(loyaltyRewardsTable)
      .where(eq(loyaltyRewardsTable.isActive, true))
      .orderBy(desc(loyaltyRewardsTable.createdAt));
    sendSuccess(res, { rewards });
  } catch (err) {
    logger.error({ err }, "[loyalty-full] rewards list error");
    sendError(res, "Failed to fetch loyalty rewards", 500);
  }
});

router.post("/rewards", adminAuth, async (req, res) => {
  try {
    const p = rewardCreateSchema.safeParse(req.body ?? {});
    if (!p.success) {
      sendValidationError(res, p.error.errors.map((e) => e.message).join("; "));
      return;
    }

    try {
      const { name, description, pointsCost, rewardType, rewardValue, stock, isActive } = p.data;

      const [created] = await db
        .insert(loyaltyRewardsTable)
        .values({
          id: generateId(),
          name,
          description: description ?? null,
          pointsCost,
          rewardType,
          rewardValue: String(rewardValue),
          stock: stock ?? null,
          isActive,
        })
        .returning();

      sendSuccess(res, { reward: created });
    } catch (err) {
      logger.error({ err }, "[loyalty-full] rewards create error");
      sendError(res, "Failed to create loyalty reward", 500);
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
});

router.put("/rewards/:id", adminAuth, async (req, res) => {
  try {
    const p = rewardUpdateSchema.safeParse(req.body ?? {});
    if (!p.success) {
      sendValidationError(res, p.error.errors.map((e) => e.message).join("; "));
      return;
    }

    try {
      const { id } = req.params as Record<string, string>;
      const [existing] = await db
        .select()
        .from(loyaltyRewardsTable)
        .where(eq(loyaltyRewardsTable.id, id))
        .limit(1);

      if (!existing) {
        sendNotFound(res, "Loyalty reward not found");
        return;
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const d = p.data;
      if (d.name !== undefined) updates.name = d.name;
      if (d.description !== undefined) updates.description = d.description;
      if (d.pointsCost !== undefined) updates.pointsCost = d.pointsCost;
      if (d.rewardType !== undefined) updates.rewardType = d.rewardType;
      if (d.rewardValue !== undefined) updates.rewardValue = String(d.rewardValue);
      if (d.stock !== undefined) updates.stock = d.stock;
      if (d.isActive !== undefined) updates.isActive = d.isActive;

      const [updated] = await db
        .update(loyaltyRewardsTable)
        .set(updates)
        .where(eq(loyaltyRewardsTable.id, id))
        .returning();

      sendSuccess(res, { reward: updated });
    } catch (err) {
      logger.error({ err }, "[loyalty-full] rewards update error");
      sendError(res, "Failed to update loyalty reward", 500);
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
});

router.delete("/rewards/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [existing] = await db
      .select()
      .from(loyaltyRewardsTable)
      .where(eq(loyaltyRewardsTable.id, id))
      .limit(1);

    if (!existing) {
      sendNotFound(res, "Loyalty reward not found");
      return;
    }

    await db
      .update(loyaltyRewardsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(loyaltyRewardsTable.id, id));

    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error({ err }, "[loyalty-full] rewards delete error");
    sendError(res, "Failed to delete loyalty reward", 500);
  }
});

export default router;
