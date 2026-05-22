import { db } from "@workspace/db";
import { dataExportLogsTable, refreshTokensTable, usersTable } from "@workspace/db/schema";
import { and, asc, count, desc, eq, isNotNull } from "drizzle-orm";
import { Router } from "express";
import { logger } from "../../lib/logger.js";
import { sendError, sendSuccess } from "../../lib/response.js";
import {
  revokeAllUserRefreshTokens,
  setUserRevocationTimestamp,
} from "../../middleware/security.js";
import {
  addAuditEntry,
  addSecurityEvent,
  adminAuth,
  getClientIp,
  type AdminRequest,
} from "../admin-shared.js";

const router = Router();

/* Shared classifier used by both token-audit and token-timeline */
type EventType = "rotation" | "breach" | "reuse" | "security" | "expired" | "active" | "other";
function classifyReason(r: string | null): EventType {
  if (!r) return "other";
  if (r === "ROTATED") return "rotation";
  if (r === "FAMILY_BREACH_DETECTED") return "breach";
  if (r === "SUSPICIOUS_FAMILY_REUSE" || r === "REUSE_DETECTED") return "reuse";
  if (r === "EXPIRED") return "expired";
  if (
    r === "AUTH_METHOD_DISABLED" ||
    r === "UNKNOWN_METHOD" ||
    r === "USER_UNAVAILABLE" ||
    r === "ALL_SESSIONS_REVOKED"
  )
    return "security";
  return "other";
}

/* ══════════════════════════════════════════════════════════════════
   GET /admin/security/data-exports
   Returns a paginated list of data export audit records.
   Requires admin auth (mounted via admin.ts → adminAuth).
══════════════════════════════════════════════════════════════════ */
router.get("/security/data-exports", adminAuth, async (req, res) => {
  const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10), 200);
  const offset = Math.max(0, parseInt(String(req.query["offset"] ?? "0"), 10));

  try {
    const [rows, [totRow]] = await Promise.all([
      db
        .select()
        .from(dataExportLogsTable)
        .orderBy(desc(dataExportLogsTable.requestedAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(dataExportLogsTable),
    ]);

    sendSuccess(res, {
      exports: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        maskedPhone: r.maskedPhone,
        ip: r.ip,
        userAgent: r.userAgent,
        requestedAt: r.requestedAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
        success: r.success,
      })),
      total: totRow?.total ?? 0,
      limit,
      offset,
    });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message }, "[security/data-exports] DB query failed");
    sendError(res, "Failed to load data export logs", 500);
  }
});

/* ══════════════════════════════════════════════════════════════════
   GET /admin/security/token-audit
   Paginated log of refresh token rotation events: rotations,
   family invalidations, reuse attempts, and other revocations.

   Query params:
     limit    (default 50, max 200)
     offset   (default 0)
     userId   (optional — filter to a specific user)
     reason   (optional — e.g. "ROTATED", "SUSPICIOUS_FAMILY_REUSE")
══════════════════════════════════════════════════════════════════ */
router.get("/security/token-audit", adminAuth, async (req, res) => {
  const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10), 200);
  const offset = Math.max(0, parseInt(String(req.query["offset"] ?? "0"), 10));
  const userId = req.query["userId"] ? String(req.query["userId"]).trim() : null;
  const reason = req.query["reason"] ? String(req.query["reason"]).trim() : null;

  try {
    /* Build where clause — only rows that have been revoked */
    const conditions = [
      eq(refreshTokensTable.revoked, true),
      isNotNull(refreshTokensTable.revokedAt),
    ];
    if (userId) conditions.push(eq(refreshTokensTable.userId, userId));
    if (reason) conditions.push(eq(refreshTokensTable.revokedReason, reason));

    const where = and(...conditions);

    const [rows, [totRow]] = await Promise.all([
      db
        .select({
          id: refreshTokensTable.id,
          userId: refreshTokensTable.userId,
          authMethod: refreshTokensTable.authMethod,
          tokenFamilyId: refreshTokensTable.tokenFamilyId,
          revokedReason: refreshTokensTable.revokedReason,
          revokedAt: refreshTokensTable.revokedAt,
          createdAt: refreshTokensTable.createdAt,
          userPhone: usersTable.phone,
          userName: usersTable.name,
        })
        .from(refreshTokensTable)
        .leftJoin(usersTable, eq(refreshTokensTable.userId, usersTable.id))
        .where(where)
        .orderBy(desc(refreshTokensTable.revokedAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(refreshTokensTable).where(where),
    ]);

    /* Classify events by reason for the frontend */
    const classify = classifyReason;

    sendSuccess(res, {
      events: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userPhone: r.userPhone ?? null,
        userName: r.userName ?? null,
        authMethod: r.authMethod ?? null,
        tokenFamilyId: r.tokenFamilyId ?? null,
        revokedReason: r.revokedReason ?? null,
        eventType: classify(r.revokedReason),
        revokedAt: r.revokedAt?.toISOString() ?? null,
        issuedAt: r.createdAt.toISOString(),
      })),
      total: totRow?.total ?? 0,
      limit,
      offset,
    });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message }, "[security/token-audit] DB query failed");
    sendError(res, "Failed to load token audit log", 500);
  }
});

/* ══════════════════════════════════════════════════════════════════
   GET /admin/security/token-timeline/:userId
   Returns ALL refresh tokens for a single user, grouped by token
   family, ordered oldest-first within each family so the login →
   rotation → revocation chain is easy to read.

   Response shape:
     { userId, userPhone, userName,
       totalTokens, activeCount, breachCount, familyCount,
       families: [{ familyId, startedAt, tokens: [...] }] }
══════════════════════════════════════════════════════════════════ */
router.get("/security/token-timeline/:userId", adminAuth, async (req, res) => {
  const { userId } = req.params as Record<string, string>;
  if (!userId?.trim()) {
    sendError(res, "userId is required", 400);
    return;
  }

  try {
    const [userRows, tokenRows] = await Promise.all([
      db
        .select({ phone: usersTable.phone, name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1),
      db
        .select({
          id: refreshTokensTable.id,
          tokenFamilyId: refreshTokensTable.tokenFamilyId,
          authMethod: refreshTokensTable.authMethod,
          revoked: refreshTokensTable.revoked,
          revokedReason: refreshTokensTable.revokedReason,
          usedAt: refreshTokensTable.usedAt,
          expiresAt: refreshTokensTable.expiresAt,
          revokedAt: refreshTokensTable.revokedAt,
          createdAt: refreshTokensTable.createdAt,
        })
        .from(refreshTokensTable)
        .where(eq(refreshTokensTable.userId, userId))
        .orderBy(asc(refreshTokensTable.createdAt)),
    ]);

    const user = userRows[0] ?? null;

    /* Group into families */
    const familyMap = new Map<string, typeof tokenRows>();
    const noFamilyBucket: typeof tokenRows = [];

    for (const t of tokenRows) {
      const fid = t.tokenFamilyId ?? "__no_family__";
      if (fid === "__no_family__") {
        noFamilyBucket.push(t);
      } else {
        if (!familyMap.has(fid)) familyMap.set(fid, []);
        familyMap.get(fid)!.push(t);
      }
    }

    /* Determine status for each token */
    const tokenStatus = (t: (typeof tokenRows)[0]): EventType => {
      if (!t.revoked && new Date() < t.expiresAt) return "active";
      if (t.revoked && t.revokedReason) return classifyReason(t.revokedReason);
      if (!t.revoked && new Date() >= t.expiresAt) return "expired";
      return "other";
    };

    const mapToken = (t: (typeof tokenRows)[0]) => ({
      id: t.id,
      authMethod: t.authMethod ?? null,
      revoked: t.revoked,
      revokedReason: t.revokedReason ?? null,
      status: tokenStatus(t),
      usedAt: t.usedAt?.toISOString() ?? null,
      expiresAt: t.expiresAt.toISOString(),
      revokedAt: t.revokedAt?.toISOString() ?? null,
      issuedAt: t.createdAt.toISOString(),
    });

    /* Build sorted families — newest login first */
    const families = [
      ...[...familyMap.entries()]
        .map(([fid, tokens]) => ({
          familyId: fid,
          startedAt: tokens[0]!.createdAt.toISOString(),
          tokens: tokens.map(mapToken),
        }))
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      ...(noFamilyBucket.length > 0
        ? [
            {
              familyId: null,
              startedAt: noFamilyBucket[0]!.createdAt.toISOString(),
              tokens: noFamilyBucket.map(mapToken),
            },
          ]
        : []),
    ];

    const allTokens = tokenRows;
    const activeCount = allTokens.filter((t) => !t.revoked && new Date() < t.expiresAt).length;
    const breachCount = allTokens.filter(
      (t) =>
        t.revokedReason === "FAMILY_BREACH_DETECTED" ||
        t.revokedReason === "SUSPICIOUS_FAMILY_REUSE" ||
        t.revokedReason === "REUSE_DETECTED"
    ).length;

    sendSuccess(res, {
      userId,
      userPhone: user?.phone ?? null,
      userName: user?.name ?? null,
      totalTokens: allTokens.length,
      activeCount,
      breachCount,
      familyCount: familyMap.size,
      families,
    });
  } catch (err: unknown) {
    logger.error(
      { err: (err as Error).message, userId },
      "[security/token-timeline] DB query failed"
    );
    sendError(res, "Failed to load token timeline", 500);
  }
});

/* ══════════════════════════════════════════════════════════════════
   GET /admin/security/token-export/:userId
   Downloads a CSV of every refresh-token event for the given user.
   Columns: tokenId, familyId, authMethod, status, issuedAt,
            usedAt, expiresAt, revokedAt, revokedReason, revoked
   Intended for breach forensics and compliance review.
   Writes an admin audit entry (action="token_history_export").
   Requires admin auth.
══════════════════════════════════════════════════════════════════ */
router.get("/security/token-export/:userId", adminAuth, async (req, res) => {
  const { userId } = req.params as Record<string, string>;
  if (!userId?.trim()) {
    sendError(res, "userId is required", 400);
    return;
  }

  try {
    const [userRows, tokenRows] = await Promise.all([
      db
        .select({ phone: usersTable.phone, name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1),
      db
        .select({
          id: refreshTokensTable.id,
          tokenFamilyId: refreshTokensTable.tokenFamilyId,
          authMethod: refreshTokensTable.authMethod,
          revoked: refreshTokensTable.revoked,
          revokedReason: refreshTokensTable.revokedReason,
          usedAt: refreshTokensTable.usedAt,
          expiresAt: refreshTokensTable.expiresAt,
          revokedAt: refreshTokensTable.revokedAt,
          createdAt: refreshTokensTable.createdAt,
        })
        .from(refreshTokensTable)
        .where(eq(refreshTokensTable.userId, userId))
        .orderBy(asc(refreshTokensTable.createdAt)),
    ]);

    const user = userRows[0] ?? null;
    const userDisplay = user?.phone ?? user?.name ?? userId;
    const now = new Date();

    /* Classify each token's status (mirrors token-timeline logic) */
    const tokenStatus = (t: (typeof tokenRows)[0]): string => {
      if (!t.revoked && now < t.expiresAt) return "active";
      if (t.revoked && t.revokedReason) return classifyReason(t.revokedReason);
      if (!t.revoked && now >= t.expiresAt) return "expired";
      return "other";
    };

    /* CSV escape — wrap field in quotes and double-up any internal quotes */
    const esc = (v: string | null | undefined): string => {
      if (v == null) return "";
      return `"${String(v).replace(/"/g, '""')}"`;
    };

    const isoOrEmpty = (d: Date | null | undefined): string => (d ? d.toISOString() : "");

    /* Build CSV */
    const header = [
      "tokenId",
      "familyId",
      "authMethod",
      "status",
      "issuedAt",
      "usedAt",
      "expiresAt",
      "revokedAt",
      "revokedReason",
      "revoked",
    ].join(",");

    const rows = tokenRows.map((t) =>
      [
        esc(t.id),
        esc(t.tokenFamilyId),
        esc(t.authMethod),
        esc(tokenStatus(t)),
        esc(isoOrEmpty(t.createdAt)),
        esc(isoOrEmpty(t.usedAt)),
        esc(isoOrEmpty(t.expiresAt)),
        esc(isoOrEmpty(t.revokedAt)),
        esc(t.revokedReason),
        esc(String(t.revoked)),
      ].join(",")
    );

    const csv = [header, ...rows].join("\r\n");
    const dateStr = now.toISOString().slice(0, 10);
    const filename = `session-history-${userId.slice(0, 8)}-${dateStr}.csv`;

    /* Audit log — treat the export itself as a sensitive action */
    const adminReq = req as AdminRequest;
    void addAuditEntry({
      action: "token_history_export",
      adminId: adminReq.adminId,
      ip: getClientIp(req),
      details: `Exported ${tokenRows.length} token record(s) for user ${userDisplay} (${userId})`,
      result: "success",
      affectedUserId: userId,
    });

    logger.info(
      { adminId: adminReq.adminId, userId, tokenCount: tokenRows.length },
      "[AUDIT:EXPORT] Admin exported token history"
    );

    res
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
      .setHeader("Cache-Control", "no-store")
      .status(200)
      .send(csv);
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message, userId }, "[security/token-export] Failed");
    sendError(res, "Failed to export token history", 500);
  }
});

/* ══════════════════════════════════════════════════════════════════
   POST /admin/security/revoke-family/:userId/:familyId
   Surgically revokes all active tokens within a single token family
   for a user — without touching their other live sessions.
   Useful for targeted incident response (e.g. one stolen device).
   Creates an admin audit entry and a security event.
   Requires admin auth.
══════════════════════════════════════════════════════════════════ */
router.post("/security/revoke-family/:userId/:familyId", adminAuth, async (req, res) => {
  const { userId, familyId } = req.params as Record<string, string>;
  if (!userId?.trim() || !familyId?.trim()) {
    sendError(res, "userId and familyId are required", 400);
    return;
  }

  try {
    /* Count active tokens in this specific family */
    const [{ activeCount }] = await db
      .select({ activeCount: count() })
      .from(refreshTokensTable)
      .where(
        and(
          eq(refreshTokensTable.userId, userId),
          eq(refreshTokensTable.tokenFamilyId, familyId),
          eq(refreshTokensTable.revoked, false)
        )
      );

    if (activeCount === 0) {
      sendSuccess(res, {
        userId,
        familyId,
        revokedCount: 0,
        message: "No active tokens in this family.",
      });
      return;
    }

    /* Fetch user display info for the audit entry */
    const [userRow] = await db
      .select({ phone: usersTable.phone, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    /* Revoke only the tokens in this family */
    await db
      .update(refreshTokensTable)
      .set({ revoked: true, revokedAt: new Date(), revokedReason: "ADMIN_REVOKE_FAMILY" })
      .where(
        and(eq(refreshTokensTable.userId, userId), eq(refreshTokensTable.tokenFamilyId, familyId))
      );

    /* Write a Redis revocation fence — any access token issued before this
       moment for this user is immediately rejected by all auth middlewares.
       TTL = access_token_ttl_sec so the key auto-expires with the tokens. */
    await setUserRevocationTimestamp(userId);

    const adminReq = req as AdminRequest;
    const ip = getClientIp(req);
    const userDisplay = userRow?.phone ?? userRow?.name ?? userId;

    void addAuditEntry({
      action: "revoke_family",
      adminId: adminReq.adminId,
      ip,
      details: `Revoked ${activeCount} token(s) in family ${familyId.slice(0, 8)}… for user ${userDisplay} (${userId})`,
      result: "success",
      affectedUserId: userId,
    });

    addSecurityEvent({
      type: "admin_revoke_family",
      ip,
      userId,
      details: `Admin (${adminReq.adminId ?? "unknown"}) surgically revoked family ${familyId.slice(0, 8)}… — ${activeCount} token(s)`,
      severity: "medium",
    });

    logger.warn(
      { adminId: adminReq.adminId, userId, familyId, revokedCount: activeCount, ip },
      "[AUDIT:AUTH] Admin revoked single token family"
    );

    sendSuccess(res, {
      userId,
      familyId,
      revokedCount: activeCount,
      message: `${activeCount} token(s) in this session family revoked.`,
    });
  } catch (err: unknown) {
    logger.error(
      { err: (err as Error).message, userId, familyId },
      "[security/revoke-family] Failed"
    );
    sendError(res, "Failed to revoke token family", 500);
  }
});

/* ══════════════════════════════════════════════════════════════════
   POST /admin/security/force-logout/:userId
   Immediately revokes every active refresh token for a user,
   forcing them to re-authenticate on every device.
   Creates a structured audit log entry and a security event.
   Requires admin auth.
══════════════════════════════════════════════════════════════════ */
router.post("/security/force-logout/:userId", adminAuth, async (req, res) => {
  const { userId } = req.params as Record<string, string>;
  if (!userId?.trim()) {
    sendError(res, "userId is required", 400);
    return;
  }

  try {
    /* Count active (non-revoked, non-expired) tokens so we can report back */
    const [{ activeCount }] = await db
      .select({ activeCount: count() })
      .from(refreshTokensTable)
      .where(and(eq(refreshTokensTable.userId, userId), eq(refreshTokensTable.revoked, false)));

    if (activeCount === 0) {
      sendSuccess(res, { userId, revokedCount: 0, message: "No active sessions to revoke." });
      return;
    }

    /* Lookup user display info for audit entry */
    const [userRow] = await db
      .select({ phone: usersTable.phone, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    /* Revoke every token for this user */
    await revokeAllUserRefreshTokens(userId, "ADMIN_FORCE_LOGOUT");

    const adminReq = req as AdminRequest;
    const ip = getClientIp(req);
    const userDisplay = userRow?.phone ?? userRow?.name ?? userId;

    /* Admin audit log */
    void addAuditEntry({
      action: "force_logout",
      adminId: adminReq.adminId,
      ip,
      details: `Force-logged out ${activeCount} session(s) for user ${userDisplay} (${userId})`,
      result: "success",
      affectedUserId: userId,
    });

    /* In-memory security event */
    addSecurityEvent({
      type: "admin_force_logout",
      ip,
      userId,
      details: `Admin (${adminReq.adminId ?? "unknown"}) force-revoked ${activeCount} token(s) for user ${userDisplay}`,
      severity: "high",
    });

    logger.warn(
      { adminId: adminReq.adminId, userId, revokedCount: activeCount, ip },
      "[AUDIT:AUTH] Admin force-logout executed"
    );

    sendSuccess(res, {
      userId,
      revokedCount: activeCount,
      message: `${activeCount} active session(s) revoked. The user will need to log in again on all devices.`,
    });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message, userId }, "[security/force-logout] Failed");
    sendError(res, "Failed to force logout user", 500);
  }
});

export default router;
