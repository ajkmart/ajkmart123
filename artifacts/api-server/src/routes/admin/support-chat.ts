import { db } from "@workspace/db";
import { supportMessagesTable } from "@workspace/db/schema";
import { and, desc, eq, max, sql } from "drizzle-orm";
import { Router } from "express";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import { sendCreated, sendError, sendSuccess } from "../../lib/response.js";
import { getIO } from "../../lib/socketio.js";

const router = Router();

router.get("/conversations", async (_req, res) => {
  try {
    const rows = await db
      .select({
        userId: supportMessagesTable.userId,
        lastMessage: sql<string>`(array_agg(${supportMessagesTable.message} ORDER BY ${supportMessagesTable.createdAt} DESC))[1]`,
        lastAt: max(supportMessagesTable.createdAt),
        totalMessages: sql<number>`count(*)::int`,
        unreadCount: sql<number>`count(*) filter (where ${supportMessagesTable.isFromSupport} = false AND ${supportMessagesTable.isReadByAdmin} = false)::int`,
        isResolved: sql<boolean>`bool_and(${supportMessagesTable.isResolved})`,
      })
      .from(supportMessagesTable)
      .groupBy(supportMessagesTable.userId)
      .orderBy(desc(max(supportMessagesTable.createdAt)));

    return sendSuccess(res, { conversations: rows });
  } catch (_e) {
    return sendError(res, "Failed to fetch conversations", 500);
  }
});

router.get("/conversations/:userId", async (req, res) => {
  try {
    const { userId } = req.params as Record<string, string>;
    try {
      await db
        .update(supportMessagesTable)
        .set({ isReadByAdmin: true })
        .where(
          and(
            eq(supportMessagesTable.userId, userId),
            eq(supportMessagesTable.isFromSupport, false)
          )
        );

      const msgs = await db
        .select()
        .from(supportMessagesTable)
        .where(eq(supportMessagesTable.userId, userId))
        .orderBy(supportMessagesTable.createdAt);

      return sendSuccess(res, {
        messages: msgs.map((m) => ({
          id: m.id,
          userId: m.userId,
          message: m.message,
          isFromSupport: m.isFromSupport,
          isReadByAdmin: m.isReadByAdmin,
          isResolved: m.isResolved,
          createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
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
      return sendError(res, "Failed to fetch messages", 500);
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

router.post("/conversations/:userId/reply", async (req, res) => {
  try {
    const { userId } = req.params as Record<string, string>;
    const { message } = req.body as { message?: string };
    if (!message || typeof message !== "string" || !message.trim()) {
      return sendError(res, "Message is required", 400);
    }
    const io = getIO();
    try {
      const [msg] = await db
        .insert(supportMessagesTable)
        .values({
          id: generateId(),
          userId,
          message: message.trim(),
          isFromSupport: true,
          isReadByAdmin: true,
          createdAt: new Date(),
        })
        .returning();

      if (msg) {
        const payload = {
          id: msg.id,
          userId: msg.userId,
          message: msg.message,
          isFromSupport: true,
          createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
        };
        io?.to(`user:${userId}`).emit("support_message", payload);
        return sendCreated(res, { message: payload });
      }
      return sendError(res, "Failed to save reply", 500);
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      return sendError(res, "Failed to send reply", 500);
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

router.patch("/conversations/:userId/resolve", async (req, res) => {
  try {
    const { userId } = req.params as Record<string, string>;
    const { resolved } = req.body as { resolved?: boolean };
    try {
      await db
        .update(supportMessagesTable)
        .set({ isResolved: resolved !== false })
        .where(eq(supportMessagesTable.userId, userId));
      return sendSuccess(res, { ok: true });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      return sendError(res, "Failed to update status", 500);
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
