import { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { verifyCsrfToken } from "../utils/admin-csrf.js";
import { AccessTokenPayload, verifyAccessToken } from "../utils/admin-jwt.js";

/** No-op shim: forced password-change gate removed. */
export function enforceMustChangePassword(_req: Request, _res: Response, next: NextFunction) {
  return next();
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Populated by either `authenticateAdmin` (admin-auth-v2) or the legacy
       * `adminAuth` middleware. Includes a denormalised `adminId` alias so
       * legacy callsites that read `req.admin.adminId` keep working.
       */
      admin?: Partial<AccessTokenPayload> & {
        sessionId?: string;
        adminId?: string | null;
        permissions?: string[];
      };
    }
  }
}

/**
 * Authenticate admin requests using JWT bearer token
 * Extracts token from Authorization: Bearer <token> header
 */
export function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.admin = payload;
    next();
  } catch (_err) {
    res.status(401).json({
      error: "Invalid or expired token",
      code: "AUTH_EXPIRED",
    });
    return;
  }
}

/**
 * CSRF protection middleware
 * Validates CSRF tokens for state-changing requests (POST, PUT, DELETE, PATCH)
 * GET, HEAD, OPTIONS requests skip CSRF check
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const headerToken = req.headers["x-csrf-token"] as string;
  const cookieToken = req.cookies.csrf_token as string;

  if (!headerToken || !cookieToken) {
    res.status(403).json({
      error: "Missing CSRF token",
      code: "CSRF_MISSING",
    });
    return;
  }

  if (headerToken !== cookieToken) {
    res.status(403).json({
      error: "CSRF token mismatch",
      code: "CSRF_INVALID",
    });
    return;
  }

  try {
    verifyCsrfToken(cookieToken);
    next();
  } catch (_err) {
    res.status(403).json({
      error: "Invalid or expired CSRF token",
      code: "CSRF_EXPIRED",
    });
    return;
  }
}

/**
 * Optional admin check - doesn't fail, just populates req.admin if valid
 */
export function optionalAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = verifyAccessToken(token);
      req.admin = payload;
    } catch (err) {
      logger.warn(
        { err },
        "[admin-auth] optional token verification failed — continuing without auth"
      );
    }
  }

  next();
}
