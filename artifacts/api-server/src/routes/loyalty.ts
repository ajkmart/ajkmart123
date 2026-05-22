import { db } from "@workspace/db";
import { ordersTable, usersTable, walletTransactionsTable } from "@workspace/db/schema";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../lib/response.js";
import { redeemLimiter } from "../middleware/rate-limit.js";
import { customerAuth } from "../middleware/security.js";
import { getCachedSettings } from "./admin-shared.js";

const router: IRouter = Router();

type LoyaltyTxnRow = {
  amount: string;
  type: string;
  reference: string | null;
  description: string;
  createdAt: Date;
};

function computeLoyaltyBalance(rows: LoyaltyTxnRow[]): number {
  let earned = 0;
  let redeemed = 0;
  for (const r of rows) {
    const amt = parseFloat(r.amount ?? "0");
    if (r.type === "loyalty" && r.reference !== "admin_loyalty_debit") {
      earned += amt;
    } else if (r.type === "loyalty" && r.reference === "admin_loyalty_debit") {
      redeemed += amt;
    } else if (r.type === "credit" && r.reference?.startsWith("loyalty_redeem_")) {
      redeemed += amt;
    } else if (r.type === "debit" && r.reference?.startsWith("loyalty_redeem_")) {
      redeemed += amt;
    }
  }
  return Math.max(0, Math.floor(earned) - Math.floor(redeemed));
}

/* GET /loyalty/balance — loyalty points summary (alternate to GET /users/loyalty/balance) */
router.get("/balance", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;

    const txns = await db
      .select({
        id: walletTransactionsTable.id,
        type: walletTransactionsTable.type,
        amount: walletTransactionsTable.amount,
        description: walletTransactionsTable.description,
        reference: walletTransactionsTable.reference,
        createdAt: walletTransactionsTable.createdAt,
      })
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, userId),
          or(
            eq(walletTransactionsTable.type, "loyalty"),
            sql`${walletTransactionsTable.reference} LIKE 'loyalty_redeem_%'`
          )!
        )
      )
      .orderBy(desc(walletTransactionsTable.createdAt));

    const balance = computeLoyaltyBalance(txns);

    sendSuccess(res, {
      pointsBalance: balance,
      transactions: txns.map((t) => ({
        id: t.id,
        type: t.type,
        amount: parseFloat(t.amount ?? "0"),
        description: t.description,
        reference: t.reference ?? null,
        createdAt: t.createdAt.toISOString(),
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

/* POST /loyalty/redeem — redeem points against a pending order */
router.post("/redeem", customerAuth, redeemLimiter, async (req, res) => {
  try {
    const userId = req.customerId!;
    const { points, orderId } = req.body as { points?: number; orderId?: string };

    if (!points || !Number.isInteger(Number(points)) || Number(points) <= 0) {
      sendValidationError(res, "A positive integer points value is required");
      return;
    }
    if (!orderId || typeof orderId !== "string") {
      sendValidationError(res, "orderId is required");
      return;
    }

    const s = await getCachedSettings();
    const pointsRate = parseFloat(s["loyalty_points_rate"] ?? "1");
    const redeemAmount = Number(points) * pointsRate;

    try {
      const result = await db.transaction(async (tx) => {
        const [order] = await tx
          .select({
            id: ordersTable.id,
            userId: ordersTable.userId,
            total: ordersTable.total,
            status: ordersTable.status,
          })
          .from(ordersTable)
          .where(eq(ordersTable.id, orderId))
          .limit(1);
        if (!order) throw Object.assign(new Error("Order not found"), { code: 404 });
        if (order.userId !== userId) throw Object.assign(new Error("Access denied"), { code: 403 });
        if (order.status !== "pending")
          throw Object.assign(new Error("Points can only be redeemed on pending orders"), {
            code: 400,
          });

        const allTxns = await tx
          .select({
            amount: walletTransactionsTable.amount,
            type: walletTransactionsTable.type,
            reference: walletTransactionsTable.reference,
            description: walletTransactionsTable.description,
            createdAt: walletTransactionsTable.createdAt,
          })
          .from(walletTransactionsTable)
          .where(
            and(
              eq(walletTransactionsTable.userId, userId),
              or(
                eq(walletTransactionsTable.type, "loyalty"),
                sql`${walletTransactionsTable.reference} LIKE 'loyalty_redeem_%'`
              )!
            )
          );

        const balance = computeLoyaltyBalance(allTxns);
        if (Number(points) > balance) {
          throw Object.assign(
            new Error(`Insufficient loyalty points. Available: ${balance}, Requested: ${points}`),
            { code: 400 }
          );
        }

        const orderTotal = parseFloat(String(order.total));
        if (redeemAmount > orderTotal) {
          throw Object.assign(
            new Error(
              `Points value Rs. ${redeemAmount.toFixed(0)} exceeds order total Rs. ${orderTotal.toFixed(0)}`
            ),
            { code: 400 }
          );
        }

        /* Idempotency / one-redemption-per-order guard.
         Check whether this exact orderId has already been redeemed in this
         session. We look for the canonical `loyalty_redeem_${orderId}` debit
         reference; if it exists the request is a duplicate and is rejected. */
        const ref = `loyalty_redeem_${orderId}`;
        const [prior] = await tx
          .select({ id: walletTransactionsTable.id })
          .from(walletTransactionsTable)
          .where(
            and(
              eq(walletTransactionsTable.userId, userId),
              eq(walletTransactionsTable.reference, ref)
            )
          )
          .limit(1);
        if (prior) {
          throw Object.assign(
            new Error("Loyalty points have already been redeemed for this order"),
            { code: 409 }
          );
        }
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId,
          type: "debit",
          amount: String(Number(points)), // ← points consumed (unit: pts)
          description: `Loyalty points redeemed for order #${orderId.slice(-6).toUpperCase()} (${points} pts → Rs. ${redeemAmount.toFixed(0)})`,
          reference: ref,
        });

        /* Credit the wallet with the Rs equivalent so the discount is tangible. */
        await tx
          .update(usersTable)
          .set({
            walletBalance: sql`wallet_balance + ${redeemAmount.toFixed(2)}`,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, userId));

        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId,
          type: "credit",
          amount: redeemAmount.toFixed(2), // ← Rs credited to wallet
          description: `Loyalty discount applied to order #${orderId.slice(-6).toUpperCase()} (Rs. ${redeemAmount.toFixed(0)})`,
          reference: `loyalty_wallet_credit_${orderId}`,
        });

        return { redeemAmount, balance: balance - Number(points) };
      });

      sendSuccess(
        res,
        {
          success: true,
          pointsRedeemed: Number(points),
          cashValue: result.redeemAmount,
          remainingPoints: result.balance,
        },
        `${points} loyalty points redeemed (Rs. ${result.redeemAmount.toFixed(0)} discount)`
      );
    } catch (err: unknown) {
      const code = (err as { code?: number }).code;
      const msg = (err as Error).message;
      if (code === 404) {
        sendNotFound(res, msg);
        return;
      }
      if (code === 403) {
        sendError(res, msg, 403);
        return;
      }
      if (code === 400) {
        sendValidationError(res, msg);
        return;
      }
      if (code === 409) {
        sendError(res, msg, 409);
        return;
      }
      logger.error({ err, userId, orderId }, "[loyalty/redeem] transaction failed");
      sendError(res, "Failed to redeem loyalty points. Please try again.", 500);
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
