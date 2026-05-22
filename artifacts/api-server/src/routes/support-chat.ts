import { db } from "@workspace/db";
import { supportMessagesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendCreated, sendError, sendSuccess } from "../lib/response.js";
import { getIO } from "../lib/socketio.js";
import { getCachedSettings, requireRole } from "../middleware/security.js";
import { validateBody } from "../middleware/validate.js";

const router: IRouter = Router();

/* Admin toggle: feature_chat. When OFF, the customer support chat
   endpoints return 403 so a disabled admin switch is enforced
   server-side and not just hidden in the UI. */
async function requireChatEnabled(_req: Request, res: Response, next: NextFunction) {
  const s = await getCachedSettings();
  if ((s["feature_chat"] ?? "off") !== "on") {
    res
      .status(403)
      .json({ error: "Customer support chat is currently disabled by the administrator." });
    return;
  }
  next();
}
router.use(requireChatEnabled);

const messageSchema = z.object({
  message: z.string().min(1).max(2000),
});

router.get("/messages", requireRole("customer"), async (req, res) => {
  try {
    const userId = req.customerId!;
    try {
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
      return sendSuccess(res, { messages: [] });
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

router.post("/messages", requireRole("customer"), validateBody(messageSchema), async (req, res) => {
  try {
    const userId = req.customerId!;
    const { message } = req.body as z.infer<typeof messageSchema>;
    const io = getIO();

    try {
      const [msg] = await db
        .insert(supportMessagesTable)
        .values({
          id: generateId(),
          userId,
          message,
          isFromSupport: false,
          createdAt: new Date(),
        })
        .returning();

      if (msg) {
        const msgPayload = {
          id: msg.id,
          userId: msg.userId,
          message: msg.message,
          isFromSupport: msg.isFromSupport,
          createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
        };
        io?.to(`user:${userId}`).emit("support_message", msgPayload);

        const autoReplyMsg = {
          id: generateId(),
          userId,
          message:
            "Thank you for contacting support! Our team will get back to you shortly. For urgent matters, please call our helpline.",
          isFromSupport: true,
          createdAt: new Date(Date.now() + 1000),
        };
        await db.insert(supportMessagesTable).values(autoReplyMsg);
        const autoPayload = {
          ...autoReplyMsg,
          createdAt: autoReplyMsg.createdAt.toISOString(),
        };
        // Emit synchronously after DB insert so the auto-reply is never lost
        // even if the socket layer is temporarily unavailable after a restart.
        io?.to(`user:${userId}`).emit("support_message", autoPayload);

        return sendCreated(res, { message: msgPayload });
      }
    } catch (err) {
      logger.error("support-chat insert failed", err);
      return sendError(res, "Failed to save message", 500);
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
