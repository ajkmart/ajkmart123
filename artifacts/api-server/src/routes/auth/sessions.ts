import { db } from "@workspace/db";
import { refreshTokensTable, userSessionsTable } from "@workspace/db/schema";
import { createHash } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import { sendError, sendNotFound, sendSuccess, sendUnauthorized } from "../../lib/response.js";
import {
  blacklistJti,
  blacklistSessionHash,
  getClientIp,
  verifyUserJwt,
  writeAuthAuditLog,
} from "../../middleware/security.js";
import { AuditService } from "../../services/admin-audit.service.js";

const router: IRouter = Router();

const SessionRevokeSchema = z
  .object({
    sessionId: z.string().min(1).optional(),
    revokeAllExceptCurrent: z.boolean().optional(),
  })
  .refine((v) => v.sessionId || v.revokeAllExceptCurrent, {
    message: "sessionId or revokeAllExceptCurrent is required",
  });

router.get("/sessions", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"] as string | undefined;
    const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!rawToken) {
      sendUnauthorized(res, "Authentication required");
      return;
    }
    const auth = verifyUserJwt(rawToken);
    if (!auth) {
      sendUnauthorized(res, "Invalid or expired token");
      return;
    }
    const sessions = await db
      .select()
      .from(userSessionsTable)
      .where(and(eq(userSessionsTable.userId, auth.userId), isNull(userSessionsTable.revokedAt)))
      .orderBy(userSessionsTable.lastActiveAt);
    sendSuccess(res, {
      sessions: sessions.map((s) => ({
        id: s.id,
        deviceName: s.deviceName,
        browser: s.browser,
        os: s.os,
        ip: s.ip,
        location: s.location,
        lastActiveAt: s.lastActiveAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[sessions] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/sessions/revoke", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"] as string | undefined;
    const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!rawToken) {
      sendUnauthorized(res, "Authentication required");
      return;
    }
    const auth = verifyUserJwt(rawToken);
    if (!auth) {
      sendUnauthorized(res, "Invalid or expired token");
      return;
    }
    const parse = SessionRevokeSchema.safeParse(req.body);
    if (!parse.success) {
      sendError(res, "Invalid request body", 400);
      return;
    }
    const ip = getClientIp(req);
    const currentHash = createHash("sha256").update(rawToken).digest("hex");
    if (parse.data.revokeAllExceptCurrent) {
      const sessions = await db
        .select()
        .from(userSessionsTable)
        .where(and(eq(userSessionsTable.userId, auth.userId), isNull(userSessionsTable.revokedAt)));
      const otherSessions = sessions.filter((s) => s.tokenHash !== currentHash);
      for (const session of otherSessions) {
        await db
          .update(userSessionsTable)
          .set({ revokedAt: new Date() })
          .where(eq(userSessionsTable.id, session.id));
        if (session.refreshTokenId) {
          await db
            .update(refreshTokensTable)
            .set({ revokedAt: new Date(), revokedReason: "SESSION_REVOKED_BY_USER" })
            .where(eq(refreshTokensTable.id, session.refreshTokenId));
        }
        await blacklistSessionHash(session.tokenHash).catch(() => undefined);
      }
      void writeAuthAuditLog("sessions_revoked_except_current", {
        userId: auth.userId,
        ip,
        metadata: { revokedCount: otherSessions.length },
      });
      AuditService.log({
        action: "sessions_revoked_except_current",
        ip,
        result: "success",
        affectedUserId: auth.userId,
        details: `${otherSessions.length} session(s) revoked`,
      });
      sendSuccess(
        res,
        { revokedCount: otherSessions.length },
        `${otherSessions.length} other session(s) revoked`
      );
      return;
    }
    const sessionId = parse.data.sessionId!;
    const [session] = await db
      .select()
      .from(userSessionsTable)
      .where(and(eq(userSessionsTable.id, sessionId), eq(userSessionsTable.userId, auth.userId)))
      .limit(1);
    if (!session) {
      sendNotFound(res, "Session not found or not owned by you");
      return;
    }
    if (session.revokedAt) {
      sendSuccess(res, { revokedCount: 0 }, "Session was already revoked");
      return;
    }
    await db
      .update(userSessionsTable)
      .set({ revokedAt: new Date() })
      .where(eq(userSessionsTable.id, sessionId));
    if (session.refreshTokenId)
      await db
        .update(refreshTokensTable)
        .set({ revokedAt: new Date(), revokedReason: "SESSION_REVOKED_BY_USER" })
        .where(eq(refreshTokensTable.id, session.refreshTokenId));
    await blacklistSessionHash(session.tokenHash).catch(() => undefined);
    if (session.tokenHash === currentHash && auth.jti && auth.exp)
      await blacklistJti(auth.jti, auth.exp).catch(() => undefined);
    void writeAuthAuditLog("session_revoked", {
      userId: auth.userId,
      ip,
      metadata: { sessionId, isSelf: session.tokenHash === currentHash },
    });
    AuditService.log({
      action: "session_revoked",
      ip,
      result: "success",
      affectedUserId: auth.userId,
      details: `Session ${sessionId} revoked`,
    });
    sendSuccess(res, { revokedCount: 1 }, "Session revoked");
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[sessions] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
