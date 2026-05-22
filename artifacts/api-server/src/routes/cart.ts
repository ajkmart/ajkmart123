import { db } from "@workspace/db";
import { cartSnapshotsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { customerAuth } from "../middleware/security.js";

const router: IRouter = Router();

/* ── GET /api/cart/snapshot — fetch the user's saved cart snapshot ── */
router.get("/snapshot", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    try {
      const [row] = await db
        .select()
        .from(cartSnapshotsTable)
        .where(eq(cartSnapshotsTable.userId, userId))
        .limit(1);

      sendSuccess(res, { items: row?.items ?? [] });
    } catch (err) {
      logger.warn({ err: (err as Error).message, userId }, "[cart] failed to fetch snapshot");
      sendError(res, "Failed to fetch cart snapshot", 500);
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

/* ── PUT /api/cart/snapshot — upsert the user's cart snapshot ── */
router.put("/snapshot", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      sendError(res, "items must be an array", 400);
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || typeof item !== "object") {
        sendError(res, `items[${i}]: each item must be an object`, 400);
        return;
      }
      if (!item.productId || typeof item.productId !== "string" || !item.productId.trim()) {
        sendError(res, `items[${i}]: productId must be a non-empty string`, 400);
        return;
      }
      /* Accept either `quantity` (CartItem field name in the mobile app) or
       the legacy `qty` alias — normalise to `qty` for downstream storage. */
      const rawQty = typeof item.quantity !== "undefined" ? item.quantity : item.qty;
      if (typeof rawQty !== "number" || !Number.isInteger(rawQty) || rawQty < 1) {
        sendError(res, `items[${i}]: quantity must be a positive integer`, 400);
        return;
      }
      item.qty = rawQty;
    }

    try {
      await db
        .insert(cartSnapshotsTable)
        .values({ userId, items, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: cartSnapshotsTable.userId,
          set: {
            items,
            updatedAt: sql`NOW()`,
          },
        });

      sendSuccess(res, { saved: true });
    } catch (err) {
      logger.warn({ err: (err as Error).message, userId }, "[cart] failed to save snapshot");
      sendError(res, "Failed to save cart snapshot", 500);
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

/* ── DELETE /api/cart/snapshot — clear the user's cart snapshot ── */
router.delete("/snapshot", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    try {
      await db.delete(cartSnapshotsTable).where(eq(cartSnapshotsTable.userId, userId));

      sendSuccess(res, { cleared: true });
    } catch (err) {
      logger.warn({ err: (err as Error).message, userId }, "[cart] failed to clear snapshot");
      sendError(res, "Failed to clear cart snapshot", 500);
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
