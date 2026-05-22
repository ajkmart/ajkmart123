/**
 * requirePermission / requireAnyPermission — fine-grained RBAC guards.
 *
 * Reads the admin's effective permissions from req.adminPermissions
 * (populated by adminAuth from the access-token claim). Falls back to
 * a DB lookup when the token is missing the claim (legacy tokens).
 *
 * Always check on the backend — UI gating is a UX nicety, not security.
 *
 * Usage:
 *   router.post("/users/:id/delete",
 *     adminAuth, csrfProtection, requirePermission("users.delete"),
 *     handler);
 */
import { assertPermissionId } from "@workspace/auth-utils/permissions";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { resolveAdminPermissions } from "../services/permissions.service.js";

function isSuper(req: Request): boolean {
  return req.adminRole === "super";
}

async function effectivePerms(req: Request): Promise<string[]> {
  if (Array.isArray(req.adminPermissions) && req.adminPermissions.length) {
    return req.adminPermissions;
  }
  const perms = await resolveAdminPermissions(req.adminId ?? null, req.adminRole);
  req.adminPermissions = perms;
  return perms;
}

export function requirePermission(permission: string) {
  assertPermissionId(permission);
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.adminId && !req.adminRole) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    if (isSuper(req)) return next();

    try {
      const perms = await effectivePerms(req);
      if (perms.includes(permission)) return next();
    } catch (err) {
      logger.error({ err, permission }, "[requirePermission] resolve failed");
    }
    return res.status(403).json({
      success: false,
      error: "Forbidden",
      detail: `Missing permission: ${permission}`,
      code: "PERMISSION_DENIED",
      required: [permission],
    });
  };
}

export function requireAnyPermission(permissions: string[]) {
  for (const p of permissions) assertPermissionId(p);
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.adminId && !req.adminRole) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    if (isSuper(req)) return next();
    try {
      const perms = await effectivePerms(req);
      if (permissions.some((p) => perms.includes(p))) return next();
    } catch (err) {
      logger.error({ err, permissions }, "[requireAnyPermission] resolve failed");
    }
    return res.status(403).json({
      success: false,
      error: "Forbidden",
      detail: `Missing one of: ${permissions.join(", ")}`,
      code: "PERMISSION_DENIED",
      required: permissions,
    });
  };
}

export function requireAllPermissions(permissions: string[]) {
  for (const p of permissions) assertPermissionId(p);
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.adminId && !req.adminRole) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    if (isSuper(req)) return next();
    try {
      const perms = await effectivePerms(req);
      if (permissions.every((p) => perms.includes(p))) return next();
    } catch (err) {
      logger.error({ err, permissions }, "[requireAllPermissions] resolve failed");
    }
    return res.status(403).json({
      success: false,
      error: "Forbidden",
      detail: `Missing one or more required permissions`,
      code: "PERMISSION_DENIED",
      required: permissions,
    });
  };
}
