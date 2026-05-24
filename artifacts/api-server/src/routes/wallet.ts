import { db } from "@workspace/db";
import { idempotencyKeysTable, usersTable, walletTransactionsTable } from "@workspace/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { IDEMPOTENCY_TTL_MS as WALLET_IDEMPOTENCY_TTL_MS } from "../lib/cleanupIdempotencyKeys.js";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import {
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../lib/response.js";
import { getIO } from "../lib/socketio.js";
import { paymentLimiter } from "../middleware/rate-limit.js";
import { customerAuth, getCachedSettings, getClientIp } from "../middleware/security.js";
import { AuditService } from "../services/admin-audit.service.js";
import { adminAuth } from "./admin.js";

/* ── IS_PRODUCTION guard — independent of NODE_ENV for simulate-topup hardening ── */
const _IS_PRODUCTION =
  process.env["IS_PRODUCTION"] === "true" || process.env["NODE_ENV"] === "production";

/* ── DB idempotency helpers for wallet operations ───────────────────────────
   Keys are namespaced by operation prefix to prevent cross-route collisions:
     deposit:<rawKey>  |  send:<rawKey>  |  withdraw:<rawKey>
   Stored in the shared idempotency_keys table (same table used by orders.ts).

   ATOMIC ACQUISITION PATTERN (eliminates TOCTOU race):
     1. Attempt INSERT of the in-flight marker.
     2. If the INSERT succeeds (1 row returned) → we exclusively own the key;
        caller should proceed with the financial operation.
     3. If the INSERT returns 0 rows (unique-constraint conflict) → key already
        exists; SELECT it to determine state:
          responseData = "{}"  → another request is in-flight → 409
          responseData = JSON  → prior success → replay the stored response
   On failure (error or validation) the key is deleted so clients can retry. */

type AcquireResult =
  | { acquired: true }
  | { acquired: false; action: "in_flight" | "replay"; statusCode?: number; body?: unknown };

export async function acquireWalletIdempotency(
  userId: string,
  prefix: string,
  rawKey: string
): Promise<AcquireResult> {
  const idemKey = `${prefix}:${rawKey}`;
  const ttlCutoff = new Date(Date.now() - WALLET_IDEMPOTENCY_TTL_MS);

  /* Step 1: atomic INSERT — if it succeeds we exclusively own the key. */
  const inserted = await db
    .insert(idempotencyKeysTable)
    .values({ id: generateId(), userId, idempotencyKey: idemKey, responseData: "{}" })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeysTable.id });

  if (inserted.length > 0) return { acquired: true };

  /* Step 2: INSERT conflicted — SELECT WITHOUT TTL filter to see the real row. */
  const [existing] = await db
    .select()
    .from(idempotencyKeysTable)
    .where(
      and(eq(idempotencyKeysTable.userId, userId), eq(idempotencyKeysTable.idempotencyKey, idemKey))
    )
    .limit(1);

  if (!existing) {
    /* Row was deleted (by cleanup interval) between our INSERT and SELECT.
       Re-try the INSERT once — this closes the race for key-deleted-mid-flight. */
    const retry = await db
      .insert(idempotencyKeysTable)
      .values({ id: generateId(), userId, idempotencyKey: idemKey, responseData: "{}" })
      .onConflictDoNothing()
      .returning({ id: idempotencyKeysTable.id });
    return retry.length > 0 ? { acquired: true } : { acquired: false, action: "in_flight" };
  }

  /* Step 3: Key exists — is it stale (expired)? */
  if (existing.createdAt < ttlCutoff) {
    /* Delete the stale row by its exact PK so we don't race with a concurrent
       fresh insert that may have just replaced it. */
    await db
      .delete(idempotencyKeysTable)
      .where(
        and(eq(idempotencyKeysTable.id, existing.id), eq(idempotencyKeysTable.userId, userId))
      );

    /* Re-insert fresh in-flight marker. */
    const reinserted = await db
      .insert(idempotencyKeysTable)
      .values({ id: generateId(), userId, idempotencyKey: idemKey, responseData: "{}" })
      .onConflictDoNothing()
      .returning({ id: idempotencyKeysTable.id });

    if (reinserted.length > 0) return { acquired: true };

    /* Another concurrent request beat us to the re-insert after we deleted the stale key. */
    const [fresh] = await db
      .select()
      .from(idempotencyKeysTable)
      .where(
        and(
          eq(idempotencyKeysTable.userId, userId),
          eq(idempotencyKeysTable.idempotencyKey, idemKey),
          gte(idempotencyKeysTable.createdAt, ttlCutoff)
        )
      )
      .limit(1);

    if (!fresh || fresh.responseData === "{}") return { acquired: false, action: "in_flight" };
    const parsedFresh = (() => {
      try {
        return JSON.parse(fresh.responseData);
      } catch (err) {
        logger.warn(
          { err },
          "[fn] idempotency key response cache parse failed — proceeding without cache"
        );
        return null;
      }
    })();
    if (parsedFresh) {
      const { _sc, ...body } = parsedFresh as { _sc?: number; [k: string]: unknown };
      return { acquired: false, action: "replay", statusCode: _sc ?? 200, body };
    }
    return { acquired: false, action: "in_flight" };
  }

  /* Step 4: Key is valid and within TTL — determine state. */
  if (existing.responseData === "{}") {
    return { acquired: false, action: "in_flight" };
  }

  const parsed = (() => {
    try {
      return JSON.parse(existing.responseData);
    } catch (err) {
      logger.warn(
        { err },
        "[fn] idempotency key response cache parse failed — proceeding without cache"
      );
      return null;
    }
  })();
  if (parsed) {
    const { _sc, ...body } = parsed as { _sc?: number; [k: string]: unknown };
    return { acquired: false, action: "replay", statusCode: _sc ?? 200, body };
  }
  return { acquired: false, action: "in_flight" };
}

async function resolveWalletIdempotency(
  userId: string,
  prefix: string,
  rawKey: string,
  statusCode: number,
  body: unknown
): Promise<void> {
  const idemKey = `${prefix}:${rawKey}`;
  const payload = JSON.stringify({ _sc: statusCode, ...(body as object) });
  await db
    .update(idempotencyKeysTable)
    .set({ responseData: payload })
    .where(
      and(eq(idempotencyKeysTable.userId, userId), eq(idempotencyKeysTable.idempotencyKey, idemKey))
    )
    .catch((e: Error) =>
      logger.warn(
        { userId, idemKey, err: e.message },
        "[wallet] idempotency response update failed"
      )
    );
}

async function deleteWalletIdempotency(
  userId: string,
  prefix: string,
  rawKey: string
): Promise<void> {
  const idemKey = `${prefix}:${rawKey}`;
  await db
    .delete(idempotencyKeysTable)
    .where(
      and(eq(idempotencyKeysTable.userId, userId), eq(idempotencyKeysTable.idempotencyKey, idemKey))
    )
    .catch((e: Error) =>
      logger.warn({ userId, idemKey, err: e.message }, "[wallet] idempotency key delete failed")
    );
}

/* ── Amount decimal precision validator ─────────────────────────────────────
   Rejects amounts with more than 2 decimal places (e.g. 100.001 → 400).
   Uses string representation to avoid floating-point artefacts. */
function hasValidDecimalPrecision(value: number): boolean {
  const str = value.toString();
  const dotIndex = str.indexOf(".");
  if (dotIndex === -1) return true;
  return str.length - dotIndex - 1 <= 2;
}

const amountField = z
  .union([z.number().positive(), z.string().min(1)])
  .transform((v) => parseFloat(String(v)))
  .refine((v) => !isNaN(v) && isFinite(v) && v > 0, "Invalid amount")
  .refine(hasValidDecimalPrecision, "Amount must have at most 2 decimal places");

const paymentMethodField = z
  .string()
  .min(1, "paymentMethod is required")
  .regex(/^[a-z_]+$/, "paymentMethod must be a lowercase identifier");

export const depositSchema = z.object({
  amount: amountField,
  paymentMethod: paymentMethodField,
  transactionId: z.string().min(1, "transactionId required"),
  idempotencyKey: z.string().uuid("idempotencyKey must be a UUID"),
  accountNumber: z.string().optional(),
  note: z.string().max(200).optional(),
});

export const sendSchema = z
  .object({
    receiverPhone: z.string().optional(),
    ajkId: z.string().optional(),
    amount: amountField,
    note: z.string().max(200).optional(),
  })
  .refine((d) => d.receiverPhone || d.ajkId, {
    message: "receiverPhone or ajkId is required",
  });

export const withdrawSchema = z.object({
  amount: amountField,
  paymentMethod: paymentMethodField,
  accountNumber: z.string().min(1, "accountNumber required"),
  note: z.string().max(200).optional(),
});

async function getEnabledPaymentMethods(): Promise<string[]> {
  const s = await getCachedSettings();
  const methods: string[] = [];
  if ((s["jazzcash_enabled"] ?? "off") === "on") methods.push("jazzcash");
  if ((s["easypaisa_enabled"] ?? "off") === "on") methods.push("easypaisa");
  if ((s["bank_enabled"] ?? "off") === "on") methods.push("bank");
  return methods;
}

function broadcastWalletUpdate(userId: string, newBalance: number) {
  const io = getIO();
  if (!io) return;
  io.to(`user:${userId}`).emit("wallet:update", { balance: newBalance });
}

const router: IRouter = Router();

router.use(paymentLimiter);

/* ── deriveStatus — reads structured status prefix stored at the start of reference ──
   Format: "<status>:<rest>" where status is one of: approved | rejected | pending
   This is robust against admin note text that might contain the word "approved" etc. */
function deriveStatus(reference: string | null): "pending" | "approved" | "rejected" {
  const ref = (reference ?? "").split(":")[0] ?? "";
  if (ref === "approved") return "approved";
  if (ref === "rejected") return "rejected";
  return "pending";
}

function mapTx(t: typeof walletTransactionsTable.$inferSelect) {
  return {
    id: t.id,
    type: t.type,
    amount: parseFloat(t.amount),
    description: t.description,
    reference: t.reference,
    status: deriveStatus(t.reference),
    createdAt: t.createdAt.toISOString(),
  };
}

function isWalletFrozen(user: { blockedServices: string }): boolean {
  return (user.blockedServices || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes("wallet");
}

/* ── GET /wallet ─────────────────────────────────────────────────────────── */
router.get("/", customerAuth, async (req, res) => {
  const userId = req.customerId!;

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    if (isWalletFrozen(user)) {
      sendForbidden(
        res,
        "wallet_frozen",
        "Your wallet has been temporarily frozen. Contact support."
      );
      return;
    }

    const { buildCursorPage, decodeCursor } = await import("../lib/pagination/cursor.js");
    const limit = Math.min(parseInt(String(req.query["limit"] || "50")), 200);
    const after = req.query["after"] as string | undefined;
    const cursor = after ? decodeCursor(after) : null;

    const rows = await db
      .select()
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, userId),
          ...(cursor ? [sql`${walletTransactionsTable.createdAt} < ${cursor}::timestamptz`] : [])
        )
      )
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(limit + 1);

    const page = buildCursorPage({
      data: rows,
      limit,
      getCursorValue: (t: (typeof rows)[0]) => t.createdAt.toISOString(),
    });

    sendSuccess(res, {
      balance: parseFloat(user.walletBalance ?? "0"),
      transactions: page.data.map(mapTx),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      pinSetup: !!user.walletPinHash,
      walletHidden: !!user.walletHidden,
    });
  } catch (e: unknown) {
    logger.error("[wallet GET /] DB error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

/* ── POST /wallet/topup — ADMIN ONLY ────────────────────────────────────────
   Restricted to admin panel. Uses centralized adminAuth middleware.
   Body: { userId, amount, method? }
   Customers cannot self-credit — all credits must go through payment verification.
─────────────────────────────────────────────────────────────────────────── */
router.post("/topup", adminAuth, async (req, res) => {
  try {
    const { userId, amount, method } = req.body;
    if (!userId) {
      sendValidationError(res, "userId required");
      return;
    }
    if (!amount) {
      sendValidationError(res, "amount required");
      return;
    }

    const topupAmt = parseFloat(amount);
    if (isNaN(topupAmt) || !isFinite(topupAmt) || topupAmt <= 0) {
      sendValidationError(res, "Invalid amount");
      return;
    }
    if (!hasValidDecimalPrecision(topupAmt)) {
      sendValidationError(res, "Amount must have at most 2 decimal places");
      return;
    }

    const s = await getCachedSettings();
    const walletEnabled = (s["feature_wallet"] ?? "on") === "on";
    const minTopup = parseFloat(s["wallet_min_topup"] ?? "100");
    const maxTopup = parseFloat(s["wallet_max_topup"] ?? "25000");
    const maxBalance = parseFloat(s["wallet_max_balance"] ?? "50000");

    if (!walletEnabled) {
      sendError(res, "Wallet service is currently disabled", 503);
      return;
    }
    if (topupAmt < minTopup) {
      sendValidationError(res, `Minimum top-up is Rs. ${minTopup}`);
      return;
    }
    if (topupAmt > maxTopup) {
      sendValidationError(res, `Maximum single top-up is Rs. ${maxTopup}`);
      return;
    }

    try {
      const result = await db.transaction(async (tx) => {
        /* Lock the user row for update to prevent concurrent top-up races */
        const [user] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1)
          .for("update");
        if (!user) throw new Error("User not found");

        /* Atomic conditional increment: only succeeds if balance + amount <= maxBalance.
         The WHERE clause is the enforcement gate; the pre-check above is an early exit
         for a clearer error message. Both must agree to prevent overflow. */
        const currentBalance = parseFloat(user.walletBalance ?? "0");
        if (currentBalance + topupAmt > maxBalance) {
          throw new Error(
            `Wallet balance limit is Rs. ${maxBalance}. Current: Rs. ${currentBalance}`
          );
        }

        const [updated] = await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance + ${topupAmt.toFixed(2)}` })
          .where(
            and(
              eq(usersTable.id, userId),
              sql`CAST(wallet_balance AS numeric) + ${topupAmt} <= ${maxBalance}`
            )
          )
          .returning({ walletBalance: usersTable.walletBalance });
        if (!updated)
          throw new Error(
            `Wallet balance limit is Rs. ${maxBalance}. Top-up would exceed the limit.`
          );

        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId,
          type: "credit",
          amount: topupAmt.toFixed(2),
          description: method ? `Wallet top-up via ${method}` : "Wallet top-up",
        });
        return parseFloat(updated.walletBalance ?? "0");
      });

      broadcastWalletUpdate(userId, result);
      const io = getIO();
      if (io)
        io.to("admin-fleet").emit("wallet:admin-topup", {
          userId,
          amount: topupAmt,
          balance: result,
          method: method || "admin_topup",
        });
      AuditService.log({
        action: "wallet_topup",
        adminId: req.adminId,
        ip: getClientIp(req),
        details: `Admin topup Rs. ${topupAmt} via ${method || "admin_topup"} for user ${userId}`,
        result: "success",
        affectedUserId: userId,
      });
      const transactions = await db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.userId, userId));
      sendSuccess(res, { balance: result, transactions: transactions.map(mapTx) });
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "";
      /* Known business rule errors bubble up as-is; unexpected errors are sanitized */
      if (msg.startsWith("Wallet balance limit") || msg === "User not found") {
        sendValidationError(res, msg);
      } else {
        logger.error("[wallet /topup] Unexpected error:", e);
        sendError(res, "Something went wrong, please try again.", 500);
      }
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

/* ── POST /wallet/deposit ────────────────────────────────────────────────────
   Customer submits proof of a manual top-up (JazzCash / EasyPaisa / bank).
   A pending credit transaction is created; an admin later approves or rejects.
   Body: { amount, paymentMethod, transactionId, idempotencyKey, accountNumber?, note? }
─────────────────────────────────────────────────────────────────────────── */
router.post("/deposit", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;

    const parsed = depositSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }

    const { amount, paymentMethod, transactionId, idempotencyKey, accountNumber, note } =
      parsed.data;

    /* ── Idempotency: acquire lock ── */
    const idemResult = await acquireWalletIdempotency(userId, "deposit", idempotencyKey);
    if (!idemResult.acquired) {
      if (idemResult.action === "replay" && idemResult.body) {
        res.status(idemResult.statusCode ?? 200).json(idemResult.body);
      } else {
        res
          .status(409)
          .json({ success: false, error: "Request already in progress. Please wait and retry." });
      }
      return;
    }

    try {
      /* ── Frozen wallet check ── */
      const [depositor] = await db
        .select({ blockedServices: usersTable.blockedServices })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (depositor && isWalletFrozen(depositor)) {
        await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
        sendForbidden(
          res,
          "wallet_frozen",
          "Your wallet has been temporarily frozen. Contact support."
        );
        return;
      }

      const s = await getCachedSettings();
      const walletEnabled = (s["feature_wallet"] ?? "on") === "on";
      const minTopup = parseFloat(s["wallet_min_topup"] ?? "100");
      const maxTopup = parseFloat(s["wallet_max_topup"] ?? "25000");

      if (!walletEnabled) {
        await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
        sendError(res, "Wallet service is currently disabled", 503);
        return;
      }

      const enabledMethods = await getEnabledPaymentMethods();
      if (!enabledMethods.includes(paymentMethod)) {
        await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
        sendValidationError(res, `Payment method '${paymentMethod}' is not enabled`);
        return;
      }

      if (amount < minTopup) {
        await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
        sendValidationError(res, `Minimum deposit is Rs. ${minTopup}`);
        return;
      }
      if (amount > maxTopup) {
        await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
        sendValidationError(res, `Maximum single deposit is Rs. ${maxTopup}`);
        return;
      }

      /* Duplicate transactionId check — prevents the same receipt being submitted twice. */
      const [duplicate] = await db
        .select({ id: walletTransactionsTable.id })
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.reference, `pending:${transactionId}`))
        .limit(1);

      if (duplicate) {
        await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
        sendError(res, "This transaction ID has already been submitted.", 409);
        return;
      }

      const txId = generateId();
      const description = [
        `Deposit via ${paymentMethod}`,
        accountNumber ? `• Acct: ${accountNumber}` : null,
        note ? `• ${note}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      await db.insert(walletTransactionsTable).values({
        id: txId,
        userId,
        type: "credit",
        amount: amount.toFixed(2),
        description,
        reference: `pending:${transactionId}`,
        paymentMethod,
      });

      const body = {
        success: true,
        message: "Deposit request submitted. Funds will be credited after admin approval.",
        transactionId: txId,
      };
      await resolveWalletIdempotency(userId, "deposit", idempotencyKey, 200, body);
      AuditService.log({
        action: "wallet_deposit_request",
        ip: getClientIp(req),
        result: "success",
        affectedUserId: userId,
        details: `Deposit Rs. ${amount.toFixed(2)} via ${paymentMethod} — txnId: ${transactionId}`,
      });
      sendSuccess(res, body);
    } catch (e: unknown) {
      await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
      logger.error("[wallet /deposit] Unexpected error:", e);
      sendError(res, "Something went wrong, please try again.", 500);
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

/* ── POST /wallet/send ───────────────────────────────────────────────────────
   Real-time P2P transfer. Both wallets are updated atomically inside a DB
   transaction. The `X-Idempotency-Key` header (UUID) is required.
   Body: { receiverPhone? | ajkId?, amount, note? }
─────────────────────────────────────────────────────────────────────────── */
router.post("/send", customerAuth, async (req, res) => {
  const senderId = req.customerId!;

  const rawIdemKey =
    typeof req.headers["x-idempotency-key"] === "string"
      ? req.headers["x-idempotency-key"].trim()
      : null;

  if (!rawIdemKey) {
    sendValidationError(res, "X-Idempotency-Key header (UUID) is required for wallet transfers");
    return;
  }

  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.errors[0]?.message ?? "Invalid input");
    return;
  }

  const { receiverPhone, ajkId, amount, note } = parsed.data;

  /* ── Idempotency: acquire lock ── */
  const idemResult = await acquireWalletIdempotency(senderId, "send", rawIdemKey);
  if (!idemResult.acquired) {
    if (idemResult.action === "replay" && idemResult.body) {
      res.status(idemResult.statusCode ?? 200).json(idemResult.body);
    } else {
      res
        .status(409)
        .json({ success: false, error: "Request already in progress. Please wait and retry." });
    }
    return;
  }

  try {
    const s = await getCachedSettings();
    const walletEnabled = (s["feature_wallet"] ?? "on") === "on";
    const maxSend = parseFloat(s["wallet_max_send"] ?? "25000");
    const minSend = parseFloat(s["wallet_min_send"] ?? "10");
    const maxBalance = parseFloat(s["wallet_max_balance"] ?? "50000");

    if (!walletEnabled) {
      await deleteWalletIdempotency(senderId, "send", rawIdemKey);
      sendError(res, "Wallet service is currently disabled", 503);
      return;
    }
    if (amount < minSend) {
      await deleteWalletIdempotency(senderId, "send", rawIdemKey);
      sendValidationError(res, `Minimum transfer is Rs. ${minSend}`);
      return;
    }
    if (amount > maxSend) {
      await deleteWalletIdempotency(senderId, "send", rawIdemKey);
      sendValidationError(res, `Maximum single transfer is Rs. ${maxSend}`);
      return;
    }

    /* Resolve receiver */
    const [receiver] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        walletBalance: usersTable.walletBalance,
        blockedServices: usersTable.blockedServices,
      })
      .from(usersTable)
      .where(ajkId ? eq(usersTable.ajkId, ajkId) : eq(usersTable.phone, receiverPhone!))
      .limit(1);

    if (!receiver) {
      await deleteWalletIdempotency(senderId, "send", rawIdemKey);
      sendNotFound(
        res,
        ajkId ? "No user found with that AJK ID" : "No user found with that phone number"
      );
      return;
    }

    if (receiver.id === senderId) {
      await deleteWalletIdempotency(senderId, "send", rawIdemKey);
      sendValidationError(res, "You cannot send money to yourself");
      return;
    }

    if (isWalletFrozen(receiver)) {
      await deleteWalletIdempotency(senderId, "send", rawIdemKey);
      sendError(res, "Recipient wallet is currently unavailable", 422);
      return;
    }

    const txRef = `send:${generateId()}`;
    const description = note ? `Transfer${note ? ` — ${note}` : ""}` : "Wallet transfer";

    const newSenderBalance = await db.transaction(async (tx) => {
      /* Lock both sender and receiver rows (consistent ordering by ID avoids deadlocks) */
      const lockIds = [senderId, receiver.id].sort();
      const [rowA] = await tx
        .select({
          id: usersTable.id,
          name: usersTable.name,
          walletBalance: usersTable.walletBalance,
          blockedServices: usersTable.blockedServices,
        })
        .from(usersTable)
        .where(eq(usersTable.id, lockIds[0]!))
        .limit(1)
        .for("update");
      const [rowB] = await tx
        .select({
          id: usersTable.id,
          name: usersTable.name,
          walletBalance: usersTable.walletBalance,
          blockedServices: usersTable.blockedServices,
        })
        .from(usersTable)
        .where(eq(usersTable.id, lockIds[1]!))
        .limit(1)
        .for("update");

      const sender = rowA?.id === senderId ? rowA : rowB;
      const lockedRx = rowA?.id === receiver.id ? rowA : rowB;

      if (!sender) throw new Error("Sender not found");
      if (isWalletFrozen(sender))
        throw Object.assign(new Error("wallet_frozen"), { code: "FROZEN" });

      const senderBal = parseFloat(sender.walletBalance ?? "0");
      if (senderBal < amount)
        throw Object.assign(new Error("Insufficient wallet balance"), { code: "INSUFFICIENT" });

      /* Atomically enforce recipient max-balance limit with the locked row */
      const receiverBalLocked = parseFloat(lockedRx?.walletBalance ?? "0");
      if (receiverBalLocked + amount > maxBalance) {
        throw Object.assign(new Error("Recipient wallet balance limit would be exceeded"), {
          code: "RECEIVER_LIMIT",
        });
      }

      /* Deduct from sender */
      const [updatedSender] = await tx
        .update(usersTable)
        .set({ walletBalance: sql`wallet_balance - ${amount.toFixed(2)}` })
        .where(and(eq(usersTable.id, senderId), sql`CAST(wallet_balance AS numeric) >= ${amount}`))
        .returning({ walletBalance: usersTable.walletBalance });
      if (!updatedSender)
        throw Object.assign(new Error("Insufficient wallet balance"), { code: "INSUFFICIENT" });

      /* Credit receiver */
      await tx
        .update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${amount.toFixed(2)}` })
        .where(eq(usersTable.id, receiver.id));

      /* Insert debit txn for sender */
      await tx.insert(walletTransactionsTable).values({
        id: generateId(),
        userId: senderId,
        type: "debit",
        amount: amount.toFixed(2),
        description: `${description} → ${receiver.name ?? "recipient"}`,
        reference: txRef,
        paymentMethod: "wallet",
      });

      /* Insert credit txn for receiver — use sender's display name, never the internal UUID */
      const senderDisplayName = sender?.name ?? "someone";
      await tx.insert(walletTransactionsTable).values({
        id: generateId(),
        userId: receiver.id,
        type: "credit",
        amount: amount.toFixed(2),
        description: `${description} ← ${senderDisplayName}`,
        reference: txRef,
        paymentMethod: "wallet",
      });

      return parseFloat(updatedSender.walletBalance ?? "0");
    });

    broadcastWalletUpdate(senderId, newSenderBalance);
    AuditService.log({
      action: "wallet_send",
      ip: getClientIp(req),
      result: "success",
      affectedUserId: senderId,
      details: `P2P transfer Rs. ${amount.toFixed(2)} → receiver ${receiver.id} ref: ${txRef}`,
    });

    const body = {
      success: true,
      message: `Rs. ${amount.toFixed(2)} sent successfully`,
      balance: newSenderBalance,
      reference: txRef,
    };
    await resolveWalletIdempotency(senderId, "send", rawIdemKey, 200, body);
    sendSuccess(res, body);
  } catch (e: unknown) {
    await deleteWalletIdempotency(senderId, "send", rawIdemKey);
    const code = (e as Error & { code?: string }).code;
    if (code === "FROZEN") {
      sendForbidden(
        res,
        "wallet_frozen",
        "Your wallet has been temporarily frozen. Contact support."
      );
      return;
    }
    if (code === "INSUFFICIENT") {
      sendError(res, "Insufficient wallet balance", 422);
      return;
    }
    if (code === "RECEIVER_LIMIT") {
      sendValidationError(res, "Recipient wallet balance limit would be exceeded");
      return;
    }
    logger.error("[wallet /send] Unexpected error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

/* ── POST /wallet/withdraw ───────────────────────────────────────────────────
   Customer requests a withdrawal. A pending debit is recorded; admin processes
   the payout and then approves/rejects the transaction.
   Header: X-Idempotency-Key (UUID, required)
   Body: { amount, paymentMethod, accountNumber, note? }
─────────────────────────────────────────────────────────────────────────── */
router.post("/withdraw", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;

    const rawIdemKey =
      typeof req.headers["x-idempotency-key"] === "string"
        ? req.headers["x-idempotency-key"].trim()
        : null;

    if (!rawIdemKey) {
      sendValidationError(res, "X-Idempotency-Key header (UUID) is required for withdrawals");
      return;
    }

    const parsed = withdrawSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }

    const { amount, paymentMethod, accountNumber, note } = parsed.data;

    /* ── Idempotency: acquire lock ── */
    const idemResult = await acquireWalletIdempotency(userId, "withdraw", rawIdemKey);
    if (!idemResult.acquired) {
      if (idemResult.action === "replay" && idemResult.body) {
        res.status(idemResult.statusCode ?? 200).json(idemResult.body);
      } else {
        res
          .status(409)
          .json({ success: false, error: "Request already in progress. Please wait and retry." });
      }
      return;
    }

    try {
      const s = await getCachedSettings();
      const walletEnabled = (s["feature_wallet"] ?? "on") === "on";
      const minWithdraw = parseFloat(s["wallet_min_withdraw"] ?? "100");
      const maxWithdraw = parseFloat(s["wallet_max_withdraw"] ?? "25000");

      if (!walletEnabled) {
        await deleteWalletIdempotency(userId, "withdraw", rawIdemKey);
        sendError(res, "Wallet service is currently disabled", 503);
        return;
      }
      if (amount < minWithdraw) {
        await deleteWalletIdempotency(userId, "withdraw", rawIdemKey);
        sendValidationError(res, `Minimum withdrawal is Rs. ${minWithdraw}`);
        return;
      }
      if (amount > maxWithdraw) {
        await deleteWalletIdempotency(userId, "withdraw", rawIdemKey);
        sendValidationError(res, `Maximum single withdrawal is Rs. ${maxWithdraw}`);
        return;
      }

      const enabledMethods = await getEnabledPaymentMethods();
      if (!enabledMethods.includes(paymentMethod)) {
        await deleteWalletIdempotency(userId, "withdraw", rawIdemKey);
        sendValidationError(res, `Payment method '${paymentMethod}' is not enabled`);
        return;
      }

      const txRef = `pending-withdraw:${generateId()}`;
      const description = [
        `Withdrawal via ${paymentMethod} to ${accountNumber}`,
        note ? `• ${note}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      await db.transaction(async (tx) => {
        /* Lock user row for update */
        const [user] = await tx
          .select({
            walletBalance: usersTable.walletBalance,
            blockedServices: usersTable.blockedServices,
          })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1)
          .for("update");

        if (!user) throw new Error("User not found");
        if (isWalletFrozen(user))
          throw Object.assign(new Error("wallet_frozen"), { code: "FROZEN" });

        const bal = parseFloat(user.walletBalance ?? "0");
        if (bal < amount)
          throw Object.assign(new Error("Insufficient wallet balance"), { code: "INSUFFICIENT" });

        /* Immediately deduct the amount (hold) — admin either approves or refunds. */
        const [updated] = await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance - ${amount.toFixed(2)}` })
          .where(and(eq(usersTable.id, userId), sql`CAST(wallet_balance AS numeric) >= ${amount}`))
          .returning({ walletBalance: usersTable.walletBalance });
        if (!updated)
          throw Object.assign(new Error("Insufficient wallet balance"), { code: "INSUFFICIENT" });

        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId,
          type: "debit",
          amount: amount.toFixed(2),
          description,
          reference: txRef,
          paymentMethod,
        });
      });

      const body = {
        success: true,
        message: "Withdrawal request submitted. Funds will be transferred after admin approval.",
        reference: txRef,
      };
      await resolveWalletIdempotency(userId, "withdraw", rawIdemKey, 200, body);
      AuditService.log({
        action: "wallet_withdraw_request",
        ip: getClientIp(req),
        result: "success",
        affectedUserId: userId,
        details: `Withdraw Rs. ${amount.toFixed(2)} via ${paymentMethod} to ${accountNumber} ref: ${txRef}`,
      });
      sendSuccess(res, body);
    } catch (e: unknown) {
      await deleteWalletIdempotency(userId, "withdraw", rawIdemKey);
      const code = (e as Error & { code?: string }).code;
      if (code === "FROZEN") {
        sendForbidden(
          res,
          "wallet_frozen",
          "Your wallet has been temporarily frozen. Contact support."
        );
        return;
      }
      if (code === "INSUFFICIENT") {
        sendError(res, "Insufficient wallet balance", 422);
        return;
      }
      logger.error("[wallet /withdraw] Unexpected error:", e);
      sendError(res, "Something went wrong, please try again.", 500);
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
