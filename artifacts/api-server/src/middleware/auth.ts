import { db } from "@workspace/db";
import { refreshTokensTable } from "@workspace/db/schema";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import {
  addSecurityEvent,
  getClientIp,
  isSessionHashBlacklisted,
  verifyUserJwt,
  writeAuthAuditLog,
} from "./security.js";

/** Extended JWT payload shape that includes custom claims added at sign-time. */
interface JwtPayloadExtended {
  userId: string;
  jti?: string;
  tokenFamilyId?: string;
  [key: string]: unknown;
}

/**
 * checkSessionRevocation — Express middleware that checks whether the incoming
 * access token's session has been explicitly revoked by the user.
 *
 * When a user calls POST /auth/sessions/revoke, we write session:bl:<sha256(token)>
 * to Redis. This middleware computes the same hash and rejects any request whose
 * token appears in the blacklist — providing immediate revocation even before
 * the access token expires.
 *
 * Fail-open: if Redis is unavailable, the request passes through so a Redis
 * outage never blocks legitimate users.
 */
export async function checkSessionRevocation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers["authorization"] as string | undefined;
    const tokenHeader = req.headers["x-auth-token"] as string | undefined;
    const raw = tokenHeader || authHeader?.replace(/^Bearer\s+/i, "");

    if (!raw) {
      next();
      return;
    }

    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    const revoked = await isSessionHashBlacklisted(tokenHash);

    if (revoked) {
      const payload = verifyUserJwt(raw);
      const ip = getClientIp(req);
      logger.warn(
        {
          userId: payload?.userId ?? "unknown",
          tokenHashPrefix: tokenHash.slice(0, 8),
          ip,
          url: req.url,
        },
        "[SECURITY] Revoked session access attempt blocked."
      );
      writeAuthAuditLog("revoked_session_access_attempt", {
        userId: payload?.userId ?? "unknown",
        ip,
        metadata: { tokenHashPrefix: tokenHash.slice(0, 8), url: req.url },
      }).catch((err) => {
        logger.warn({ err }, "[auth] writeAuthAuditLog failed — non-fatal");
      });

      res
        .status(401)
        .json({ success: false, error: "Session has been revoked. Please log in again." });
      return;
    }

    next();
  } catch (err) {
    logger.warn({ err }, "[checkSessionRevocation] Check failed — passing through");
    next();
  }
}

/**
 * verifyTokenFamily — Express middleware that checks whether the authenticated
 * user's token family has been revoked due to a detected breach.
 *
 * It decodes the bearer JWT (no full re-verify needed — verifyUserJwt() already
 * validated the signature upstream), extracts `jti` / `tokenFamilyId`, and checks
 * whether ANY member of that family has `revokedReason = 'FAMILY_BREACH_DETECTED'`.
 *
 * If a breach is found → HTTP 401 with a clear re-login message.
 * If the check fails (DB error, missing claims) → passes through to not
 * block legitimate users when the feature is degraded.
 */
export async function verifyTokenFamily(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers["authorization"] as string | undefined;
    const tokenHeader = req.headers["x-auth-token"] as string | undefined;
    const raw = tokenHeader || authHeader?.replace(/^Bearer\s+/i, "");

    if (!raw) {
      next();
      return;
    }

    const payload = verifyUserJwt(raw);
    if (!payload || !payload.userId) {
      next();
      return;
    }

    const tokenFamilyId = (payload as unknown as JwtPayloadExtended).tokenFamilyId;

    if (!tokenFamilyId) {
      next();
      return;
    }

    const familyMembers = await db
      .select({ id: refreshTokensTable.id, revokedReason: refreshTokensTable.revokedReason })
      .from(refreshTokensTable)
      .where(eq(refreshTokensTable.tokenFamilyId, tokenFamilyId));

    const breachedMember = familyMembers.find((m) => m.revokedReason === "FAMILY_BREACH_DETECTED");
    if (breachedMember) {
      const ip = getClientIp(req);

      logger.warn(
        { userId: payload.userId, tokenFamilyId, ip },
        "[SECURITY] Revoked-family access attempt blocked."
      );

      addSecurityEvent({
        type: "revoked_family_access_attempt",
        ip,
        userId: payload.userId,
        details: `Access attempt on revoked token family ${tokenFamilyId}`,
        severity: "critical",
      });

      writeAuthAuditLog("revoked_family_access_attempt", {
        userId: payload.userId,
        ip,
        metadata: { tokenFamilyId, url: req.url },
      }).catch((err: unknown) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), userId: payload.userId },
          "[auth] writeAuthAuditLog for revoked_family_access_attempt failed"
        );
      });

      res.status(401).json({ error: "Account compromised. Please login again." });
      return;
    }

    next();
  } catch (err) {
    logger.warn({ err }, "[verifyTokenFamily] Check failed — passing through");
    next();
  }
}
