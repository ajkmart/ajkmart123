/**
 * /admin/rbac/* — Roles & Permissions management.
 * Read access requires `system.audit.view` or super; write access
 * requires `system.roles.manage`.
 */
import { PERMISSIONS } from "@workspace/auth-utils/permissions";
import { Router } from "express";
import { z } from "zod";
import {
  sendError,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../../../lib/response.js";
import { requireAnyPermission, requirePermission } from "../../../middleware/require-permission.js";
import {
  createRole,
  deleteRole,
  getAdminRoles,
  getEffectivePermissionsForAdmin,
  getRole,
  listRoles,
  resolveAdminPermissions,
  revokeSessionsForRole,
  setAdminRoles,
  setRolePermissions,
  updateRole,
} from "../../../services/permissions.service.js";
import { addAuditEntry, adminAuth, type AdminRequest } from "../../admin-shared.js";

const router = Router();

router.use(adminAuth);

// Read-only RBAC metadata is restricted to admins who can either manage
// roles or view the audit log. The "/me" endpoint below is an exception —
// every authenticated admin needs to know their own permissions.
const canRead = requireAnyPermission(["system.roles.manage", "system.audit.view"]);

/* ── Catalog ────────────────────────────────────────────────────── */
router.get("/permissions", canRead, (_req, res) => {
  sendSuccess(res, { permissions: PERMISSIONS });
});

/* ── Roles list / detail ────────────────────────────────────────── */
router.get("/roles", canRead, async (_req, res) => {
  const roles = await listRoles();
  sendSuccess(res, { roles });
});

router.get("/roles/:id", canRead, async (req, res) => {
  const role = await getRole(req.params["id"] as string);
  if (!role) return sendNotFound(res, "Role not found");
  sendSuccess(res, { role });
});

const createRoleSchema = z.object({
  slug: z.string().min(2).max(64),
  name: z.string().min(2).max(128),
  description: z.string().max(512).optional(),
  permissions: z.array(z.string()).optional(),
});

router.post("/roles", requirePermission("system.roles.manage"), async (req, res) => {
  const aReq = req as AdminRequest;
  try {
    const body = createRoleSchema.parse(req.body);
    const role = await createRole(body);
    void addAuditEntry({
      action: "rbac_role_create",
      adminId: aReq.adminId,
      ip: aReq.adminIp || "unknown",
      details: `slug=${role.slug} name=${role.name} perms=${(body.permissions ?? []).length}`,
      result: "success",
    });
    sendSuccess(res, { role }, undefined, 201);
  } catch (err) {
    if (err instanceof z.ZodError) return sendValidationError(res, err.message);
    sendError(res, (err as Error).message, 400);
  }
});

const updateRoleSchema = z.object({
  name: z.string().min(2).max(128).optional(),
  description: z.string().max(512).optional(),
});

router.patch("/roles/:id", requirePermission("system.roles.manage"), async (req, res) => {
  const aReq = req as AdminRequest;
  try {
    const body = updateRoleSchema.parse(req.body);
    const role = await updateRole(req.params["id"] as string, body);
    if (!role) return sendNotFound(res, "Role not found");
    void addAuditEntry({
      action: "rbac_role_update",
      adminId: aReq.adminId,
      ip: aReq.adminIp || "unknown",
      details: `roleId=${role.id} name=${role.name}`,
      result: "success",
    });
    sendSuccess(res, { role });
  } catch (err) {
    if (err instanceof z.ZodError) return sendValidationError(res, err.message);
    sendError(res, (err as Error).message, 400);
  }
});

router.delete("/roles/:id", requirePermission("system.roles.manage"), async (req, res) => {
  const aReq = req as AdminRequest;
  const result = await deleteRole(req.params["id"] as string);
  if (!result.deleted) {
    if (result.reason === "built_in")
      return sendError(res, "Built-in roles cannot be deleted", 400);
    return sendNotFound(res, "Role not found");
  }
  void addAuditEntry({
    action: "rbac_role_delete",
    adminId: aReq.adminId,
    ip: aReq.adminIp || "unknown",
    details: `roleId=${req.params["id"] as string}`,
    result: "success",
  });
  sendSuccess(res, { success: true });
});

const setPermsSchema = z.object({ permissions: z.array(z.string()) });

router.put("/roles/:id/permissions", requirePermission("system.roles.manage"), async (req, res) => {
  const aReq = req as AdminRequest;
  try {
    const { permissions } = setPermsSchema.parse(req.body);
    const role = await getRole(req.params["id"] as string);
    if (!role) return sendNotFound(res, "Role not found");
    const before = role.permissions;
    const after = await setRolePermissions(role.id, permissions);
    const added = after.filter((p: string) => !before.includes(p));
    const removed = before.filter((p: string) => !after.includes(p));
    // Bumping permissions invalidates active sessions for affected admins
    const affected = await revokeSessionsForRole(role.id);
    void addAuditEntry({
      action: "rbac_role_permissions_set",
      adminId: aReq.adminId,
      ip: aReq.adminIp || "unknown",
      details: `roleId=${role.id} +[${added.join(",")}] -[${removed.join(",")}] sessionsRevoked=${affected}`,
      result: "success",
    });
    sendSuccess(res, { permissions: after, added, removed, sessionsRevoked: affected });
  } catch (err) {
    if (err instanceof z.ZodError) return sendValidationError(res, err.message);
    sendError(res, (err as Error).message, 400);
  }
});

/* ── Admin role assignments ─────────────────────────────────────── */
const setAdminRolesSchema = z.object({ roleIds: z.array(z.string()) });

router.put("/admins/:adminId/roles", requirePermission("system.roles.manage"), async (req, res) => {
  const aReq = req as AdminRequest;
  try {
    const { roleIds } = setAdminRolesSchema.parse(req.body);
    await setAdminRoles(req.params["adminId"] as string, roleIds, aReq.adminId ?? null);
    void addAuditEntry({
      action: "rbac_admin_roles_set",
      adminId: aReq.adminId,
      ip: aReq.adminIp || "unknown",
      details: `targetAdminId=${req.params["adminId"] as string} roles=[${roleIds.join(",")}]`,
      result: "success",
    });
    const roles = await getAdminRoles(req.params["adminId"] as string);
    sendSuccess(res, { roles });
  } catch (err) {
    if (err instanceof z.ZodError) return sendValidationError(res, err.message);
    sendError(res, (err as Error).message, 400);
  }
});

router.get("/admins/:adminId/roles", canRead, async (req, res) => {
  const roles = await getAdminRoles(req.params["adminId"] as string);
  sendSuccess(res, { roles });
});

router.get("/admins/:adminId/effective-permissions", canRead, async (req, res) => {
  const adminId = req.params["adminId"] as string;
  const explicit = await getEffectivePermissionsForAdmin(adminId);
  // Super admins effectively have everything; surface that to the UI
  const resolved = await resolveAdminPermissions(adminId, null);
  sendSuccess(res, { permissions: explicit.length ? explicit : resolved });
});

/* ── "Who am I" — current admin's effective permissions ─────────── */
router.get("/me", async (req, res) => {
  const aReq = req as AdminRequest;
  const perms =
    aReq.adminPermissions && aReq.adminPermissions.length
      ? aReq.adminPermissions
      : await resolveAdminPermissions(aReq.adminId ?? null, aReq.adminRole);
  sendSuccess(res, {
    adminId: aReq.adminId,
    role: aReq.adminRole,
    name: aReq.adminName,
    permissions: perms,
  });
});

/* ── Permission verification utilities ─────────────────────────── */

/**
 * GET /verify/:permission
 * Check whether the currently authenticated admin holds a specific permission.
 * Returns { allowed: boolean, permission: string }.
 */
router.get("/verify/:permission", async (req, res) => {
  const aReq = req as AdminRequest;
  const permission = req.params["permission"] as string;
  if (!permission) return sendValidationError(res, "permission param is required");
  const perms: string[] = aReq.adminPermissions?.length
    ? aReq.adminPermissions
    : await resolveAdminPermissions(aReq.adminId ?? null, aReq.adminRole);
  const allowed = perms.includes(permission) || perms.includes("*");
  sendSuccess(res, { permission, allowed });
});

/**
 * GET /verify-bulk
 * Check whether the currently authenticated admin holds all of the requested
 * permissions in one round-trip.
 * Query: ?permissions=orders.view,finance.withdrawals.view
 * Returns { results: Record<string, boolean>, all: boolean }.
 */
router.get("/verify-bulk", async (req, res) => {
  const aReq = req as AdminRequest;
  const raw = req.query["permissions"] as string | undefined;
  if (!raw) return sendValidationError(res, "permissions query param is required");
  const requested = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (requested.length === 0)
    return sendValidationError(res, "permissions must be a non-empty comma-separated list");
  if (requested.length > 50) return sendValidationError(res, "at most 50 permissions per request");
  const perms: string[] = aReq.adminPermissions?.length
    ? aReq.adminPermissions
    : await resolveAdminPermissions(aReq.adminId ?? null, aReq.adminRole);
  const superAdmin = perms.includes("*");
  const results: Record<string, boolean> = {};
  for (const p of requested) {
    results[p] = superAdmin || perms.includes(p);
  }
  sendSuccess(res, { results, all: Object.values(results).every(Boolean) });
});

/**
 * POST /simulate
 * Simulate the effective permission set for any admin.
 * Useful for previewing what an admin can do before promoting or demoting them.
 * Body: { adminId: string }
 * Returns { adminId, permissions, roleNames, isSuperAdmin }.
 */
const simulateSchema = z.object({
  adminId: z.string().uuid("adminId must be a valid UUID"),
});

router.post("/simulate", requirePermission("system.roles.manage"), async (req, res) => {
  try {
    const { adminId } = simulateSchema.parse(req.body);
    const [perms, roles] = await Promise.all([
      resolveAdminPermissions(adminId, null),
      getAdminRoles(adminId),
    ]);
    sendSuccess(res, {
      adminId,
      permissions: perms,
      roleNames: (roles as { name: string }[]).map((r) => r.name),
      isSuperAdmin: (perms as string[]).includes("*"),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return sendValidationError(res, err.message);
    sendError(res, (err as Error).message, 400);
  }
});

export default router;
