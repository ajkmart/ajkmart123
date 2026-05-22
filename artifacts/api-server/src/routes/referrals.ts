import { db } from "@workspace/db";
import {
  referralCodesTable,
  referralUsagesTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import {
  sendCreated,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../lib/response.js";
import { customerAuth } from "../middleware/security.js";
import { getCachedSettings } from "./admin-shared.js";

const router: IRouter = Router();

function generateReferralCode(name: string): string {
  const base = (name || "USER")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4)
    .padEnd(4, "X");
  const suffix = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `${base}${suffix}`;
}

router.get("/my-code", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;

    const s = await getCachedSettings();
    if ((s["features.referral"] ?? s["feature_referral"] ?? "off") !== "on") {
      sendError(res, "Referral programme is not currently active", 503);
      return;
    }

    const [existing] = await db
      .select()
      .from(referralCodesTable)
      .where(
        and(eq(referralCodesTable.ownerUserId, userId), sql`${referralCodesTable.isActive} = 1`)
      )
      .limit(1);

    if (existing) {
      sendSuccess(res, {
        code: existing.code,
        rewardAmount: parseFloat(String(existing.rewardAmount)),
        usedCount: existing.usedCount,
      });
      return;
    }

    const [user] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    let code = generateReferralCode(user?.name ?? "");
    const [dup] = await db
      .select({ id: referralCodesTable.id })
      .from(referralCodesTable)
      .where(eq(referralCodesTable.code, code))
      .limit(1);
    if (dup) {
      code = generateReferralCode((user?.name ?? "") + Math.random().toString(36).slice(2, 5));
    }

    const rewardAmount = parseFloat(s["referral_reward_amount"] ?? "50");

    const [created] = await db
      .insert(referralCodesTable)
      .values({
        id: generateId(),
        code,
        ownerUserId: userId,
        rewardAmount: rewardAmount.toFixed(2),
        usedCount: 0,
        isActive: 1,
      })
      .returning();

    sendCreated(res, {
      code: created!.code,
      rewardAmount,
      usedCount: 0,
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

router.post("/apply", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    const { code } = req.body as { code?: string };

    if (!code || typeof code !== "string" || code.trim().length === 0) {
      sendValidationError(res, "Referral code is required");
      return;
    }

    const s = await getCachedSettings();
    if ((s["features.referral"] ?? s["feature_referral"] ?? "off") !== "on") {
      sendError(res, "Referral programme is not currently active", 503);
      return;
    }

    const upperCode = code.trim().toUpperCase();

    const [referralCode] = await db
      .select()
      .from(referralCodesTable)
      .where(and(eq(referralCodesTable.code, upperCode), sql`${referralCodesTable.isActive} = 1`))
      .limit(1);

    if (!referralCode) {
      sendNotFound(res, "Invalid or expired referral code");
      return;
    }

    if (referralCode.ownerUserId === userId) {
      sendForbidden(res, "You cannot use your own referral code");
      return;
    }

    if (referralCode.maxUses != null && referralCode.usedCount >= referralCode.maxUses) {
      sendError(res, "This referral code has reached its usage limit", 400);
      return;
    }

    const [alreadyUsed] = await db
      .select({ id: referralUsagesTable.id })
      .from(referralUsagesTable)
      .where(eq(referralUsagesTable.refereeUserId, userId))
      .limit(1);

    if (alreadyUsed) {
      sendError(res, "You have already used a referral code", 400);
      return;
    }

    const rewardAmount = parseFloat(String(referralCode.rewardAmount));

    try {
      await db.transaction(async (tx) => {
        await tx.insert(referralUsagesTable).values({
          id: generateId(),
          codeId: referralCode.id,
          refereeUserId: userId,
          referrerUserId: referralCode.ownerUserId,
          rewardAmount: rewardAmount.toFixed(2),
        });

        await tx
          .update(referralCodesTable)
          .set({ usedCount: sql`${referralCodesTable.usedCount} + 1`, updatedAt: new Date() })
          .where(eq(referralCodesTable.id, referralCode.id));

        await tx
          .update(usersTable)
          .set({
            walletBalance: sql`wallet_balance + ${rewardAmount.toFixed(2)}`,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, userId));
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId,
          type: "credit",
          amount: rewardAmount.toFixed(2),
          description: `Referral reward — used code ${upperCode}`,
          reference: `referral:${referralCode.id}`,
        });

        await tx
          .update(usersTable)
          .set({
            walletBalance: sql`wallet_balance + ${rewardAmount.toFixed(2)}`,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, referralCode.ownerUserId));
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId: referralCode.ownerUserId,
          type: "credit",
          amount: rewardAmount.toFixed(2),
          description: `Referral bonus — someone joined using your code ${upperCode}`,
          reference: `referral_bonus:${referralCode.id}`,
        });
      });

      sendSuccess(res, {
        success: true,
        rewardAmount,
        message: `Referral code applied! Rs. ${rewardAmount.toFixed(0)} has been added to your wallet.`,
      });
    } catch (err) {
      logger.error({ err, userId, code: upperCode }, "[referrals/apply] transaction failed");
      sendError(res, "Failed to apply referral code. Please try again.", 500);
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

export default router;
