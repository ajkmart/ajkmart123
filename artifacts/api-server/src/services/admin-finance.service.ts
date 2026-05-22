/**
 * FinanceService - Admin Finance & Wallet Management
 *
 * Centralized business logic for:
 * - Wallet transactions
 * - Topups & deposits
 * - Refunds & withdrawals
 * - Balance calculations
 * - Transaction history
 * - Payment reconciliation
 */

import { db } from "@workspace/db";
import { ordersTable, ridesTable, usersTable, walletTransactionsTable } from "@workspace/db/schema";
import { and, desc, eq, sql, sum } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { getPlatformSettings } from "../routes/admin-shared.js";

export interface WalletTopupInput {
  userId: string;
  amount: number;
  paymentMethod: string;
  reference?: string;
}

export interface WalletTransactionInput {
  userId: string;
  amount: number;
  type: "credit" | "debit";
  reason: string;
  reference?: string;
  relatedOrderId?: string;
  relatedRideId?: string;
}

export interface RefundInput {
  orderId?: string;
  rideId?: string;
  userId: string;
  amount: number;
  reason: string;
}

export class FinanceService {
  /**
   * Get user wallet balance
   */
  static async getUserBalance(userId: string): Promise<number> {
    const [user] = await db
      .select({ walletBalance: usersTable.walletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    // Ensure 2 decimal places
    return parseFloat(user.walletBalance || "0");
  }

  /**
   * Process wallet topup (admin)
   */
  static async processTopup(input: WalletTopupInput) {
    if (input.amount <= 0) {
      throw new Error("Topup amount must be positive");
    }

    const settings = await getPlatformSettings();
    const maxBalance = parseFloat(settings["wallet_max_balance"] ?? "50000");

    const transactionId = generateId();
    const amtFixed = input.amount.toFixed(2);

    const newBalance = await db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, input.userId))
        .limit(1)
        .for("update");

      if (!user) {
        throw new Error("User not found");
      }

      const currentBalance = parseFloat(user.walletBalance || "0");
      if (currentBalance + input.amount > maxBalance) {
        throw new Error(
          `Wallet balance limit is Rs. ${maxBalance}. Current: Rs. ${currentBalance}`
        );
      }

      const [updated] = await tx
        .update(usersTable)
        .set({
          walletBalance: sql`wallet_balance + ${amtFixed}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(usersTable.id, input.userId),
            sql`CAST(wallet_balance AS numeric) + ${input.amount} <= ${maxBalance}`
          )
        )
        .returning({ walletBalance: usersTable.walletBalance });

      if (!updated) {
        throw new Error(
          `Wallet balance limit is Rs. ${maxBalance}. Top-up would exceed the limit.`
        );
      }

      await tx.insert(walletTransactionsTable).values({
        id: transactionId,
        userId: input.userId,
        amount: amtFixed,
        type: "credit",
        description: `Topup via ${input.paymentMethod}`,
        reference: input.reference || null,
        paymentMethod: input.paymentMethod,
      });

      return parseFloat(updated.walletBalance || "0");
    });

    logger.info(
      { userId: input.userId, amount: input.amount, newBalance },
      "[FinanceService] Topup processed"
    );

    return {
      success: true,
      transactionId,
      newBalance,
    };
  }

  /**
   * Create manual wallet transaction (admin)
   */
  static async createTransaction(input: WalletTransactionInput) {
    if (input.amount <= 0) {
      throw new Error("Transaction amount must be positive");
    }

    const transactionId = generateId();
    const amtFixed = input.amount.toFixed(2);

    const newBalance = await db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, input.userId))
        .limit(1)
        .for("update");

      if (!user) {
        throw new Error("User not found");
      }

      let updated: { walletBalance: string | null } | undefined;

      if (input.type === "debit") {
        const currentBalance = parseFloat(user.walletBalance || "0");
        if (currentBalance < input.amount) {
          throw new Error("Insufficient wallet balance");
        }

        [updated] = await tx
          .update(usersTable)
          .set({
            walletBalance: sql`wallet_balance - ${amtFixed}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(usersTable.id, input.userId),
              sql`CAST(wallet_balance AS numeric) >= ${input.amount}`
            )
          )
          .returning({ walletBalance: usersTable.walletBalance });

        if (!updated) {
          throw new Error(
            "Insufficient wallet balance at time of processing (possible concurrent request)."
          );
        }
      } else {
        const settings = await getPlatformSettings();
        const maxBalance = parseFloat(settings["wallet_max_balance"] ?? "50000");

        const currentBalance = parseFloat(user.walletBalance || "0");
        if (currentBalance + input.amount > maxBalance) {
          throw new Error(
            `Wallet balance limit is Rs. ${maxBalance}. Credit would exceed the limit.`
          );
        }

        [updated] = await tx
          .update(usersTable)
          .set({
            walletBalance: sql`wallet_balance + ${amtFixed}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(usersTable.id, input.userId),
              sql`CAST(wallet_balance AS numeric) + ${input.amount} <= ${maxBalance}`
            )
          )
          .returning({ walletBalance: usersTable.walletBalance });

        if (!updated) {
          throw new Error(
            `Wallet balance limit is Rs. ${maxBalance}. Credit would exceed the limit.`
          );
        }
      }

      await tx.insert(walletTransactionsTable).values({
        id: transactionId,
        userId: input.userId,
        amount: amtFixed,
        type: input.type,
        description: input.reason,
        reference: input.reference || null,
      });

      return parseFloat(updated.walletBalance || "0");
    });

    logger.info(
      { userId: input.userId, type: input.type, amount: input.amount, newBalance },
      "[FinanceService] Transaction created"
    );

    return {
      success: true,
      transactionId,
      newBalance,
    };
  }

  /**
   * Process refund for order or ride
   */
  static async processRefund(input: RefundInput) {
    if (input.amount <= 0) {
      throw new Error("Refund amount must be positive");
    }

    // Verify order or ride exists and belongs to user — read-only lookups, outside transaction
    if (input.orderId) {
      const [order] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, input.orderId))
        .limit(1);

      if (!order || order.userId !== input.userId) {
        throw new Error("Order not found or does not belong to this user");
      }
    }

    if (input.rideId) {
      const [ride] = await db
        .select()
        .from(ridesTable)
        .where(eq(ridesTable.id, input.rideId))
        .limit(1);

      if (!ride || ride.userId !== input.userId) {
        throw new Error("Ride not found or does not belong to this user");
      }
    }

    const transactionId = generateId();
    const amtFixed = input.amount.toFixed(2);

    const newBalance = await db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, input.userId))
        .limit(1)
        .for("update");

      if (!user) {
        throw new Error("User not found");
      }

      const [updated] = await tx
        .update(usersTable)
        .set({
          walletBalance: sql`wallet_balance + ${amtFixed}`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, input.userId))
        .returning({ walletBalance: usersTable.walletBalance });

      if (!updated) {
        throw new Error("User not found");
      }

      await tx.insert(walletTransactionsTable).values({
        id: transactionId,
        userId: input.userId,
        amount: amtFixed,
        type: "credit",
        description: `Refund: ${input.reason}`,
        reference: input.orderId || input.rideId || null,
      });

      return parseFloat(updated.walletBalance || "0");
    });

    logger.info(
      { userId: input.userId, amount: input.amount, reason: input.reason },
      "[FinanceService] Refund processed"
    );

    return {
      success: true,
      transactionId,
      newBalance,
    };
  }

  /**
   * Get wallet transaction history
   */
  static async getTransactionHistory(userId: string, limit: number = 100) {
    const transactions = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.userId, userId))
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(Math.min(limit, 500));

    return transactions.map((t) => ({
      id: t.id,
      userId: t.userId,
      amount: parseFloat(t.amount),
      type: t.type,
      description: t.description,
      reference: t.reference,
      paymentMethod: t.paymentMethod,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  /**
   * Get wallet statistics for a user
   */
  static async getWalletStats(userId: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const balance = parseFloat(user.walletBalance || "0");

    // Calculate credit/debit totals
    const [credits] = await db
      .select({ total: sum(walletTransactionsTable.amount) })
      .from(walletTransactionsTable)
      .where(
        eq(walletTransactionsTable.userId, userId) && eq(walletTransactionsTable.type, "credit")
      )
      .limit(1);

    const [debits] = await db
      .select({ total: sum(walletTransactionsTable.amount) })
      .from(walletTransactionsTable)
      .where(
        eq(walletTransactionsTable.userId, userId) && eq(walletTransactionsTable.type, "debit")
      )
      .limit(1);

    const totalCredits = credits?.total ? parseFloat(credits.total.toString()) : 0;
    const totalDebits = debits?.total ? parseFloat(debits.total.toString()) : 0;

    return {
      balance,
      totalCredits,
      totalDebits,
      netFlow: totalCredits - totalDebits,
    };
  }

  /**
   * Platform transaction report
   */
  static async getPlatformTransactionReport(limit: number = 500) {
    const transactions = await db
      .select({
        id: walletTransactionsTable.id,
        userId: walletTransactionsTable.userId,
        amount: walletTransactionsTable.amount,
        type: walletTransactionsTable.type,
        description: walletTransactionsTable.description,
        createdAt: walletTransactionsTable.createdAt,
      })
      .from(walletTransactionsTable)
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(Math.min(limit, 1000));

    const totalCredits = transactions
      .filter((t) => t.type === "credit")
      .reduce((sum, t) => sum + (t.amount ? parseFloat(t.amount) : 0), 0);

    const totalDebits = transactions
      .filter((t) => t.type === "debit")
      .reduce((sum, t) => sum + (t.amount ? parseFloat(t.amount) : 0), 0);

    return {
      transactions: transactions.map((t) => ({
        ...t,
        amount: parseFloat(t.amount || "0"),
        createdAt: t.createdAt.toISOString(),
      })),
      totalCredits,
      totalDebits,
      netFlow: totalCredits - totalDebits,
      count: transactions.length,
    };
  }

  /**
   * Validate transaction amount (2 decimal places)
   */
  static validateAmount(amount: number): boolean {
    const decimalPlaces = (amount.toString().split(".")[1] || "").length;
    return decimalPlaces <= 2 && amount > 0;
  }

  /**
   * Format amount to 2 decimal places
   */
  static formatAmount(amount: number): string {
    return (Math.round(amount * 100) / 100).toFixed(2);
  }
}
