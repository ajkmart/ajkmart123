/**
 * /admin/admin-accounts/* — Admin account management.
 * All write operations require system.roles.manage permission.
 */
import { db } from "@workspace/db";
import { adminAccountsTable } from "@workspace/db/schema";
import { desc, eq, ilike, or } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../../lib/response.js";
import { requirePermission } from "../../middleware/require-permission.js";
import {
  addAuditEntry,
  logger,
  revokeAllUserSessions,
  type AdminRequest,
} from "../admin-shared.js";

const router = Router();

/** Strip secrets before sending to frontend */
function safeAccount(a: typeof adminAccountsTable.$inferSelect) {
  return {
    id: a.id,
    name: a.name,
    username: a.username,
    email: a.email,
    role: a.role,
    isActive: a.isActive,
    lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
    defaultCredentials: a.defaultCredentials,
    createdAt: a.createdAt.toISOString(),
  };
}

/* ── GET /admin-accounts ─────────────────────────────────────────── */
router.get("/admin-accounts", requirePermission("system.roles.manage"), async (req, res) => {
  try {
    const search = String(req.query["search"] ?? "").trim();
    const rows = await db
      .select()
      .from(adminAccountsTable)
      .where(
        search
          ? or(
              ilike(adminAccountsTable.name, `%${search}%`),
              ilike(adminAccountsTable.username, `%${search}%`),
              ilike(adminAccountsTable.email, `%${search}%`)
            )
          : undefined
      )
      .orderBy(desc(adminAccountsTable.createdAt));
    sendSuccess(res, { accounts: rows.map(safeAccount) });
  } catch (err) {
    logger.error({ err }, "[admin-accounts] list failed");
    sendError(res, "Failed to list admin accounts", 500);
  }
});

/* ── PATCH /admin-accounts/:id ──────────────────────────────────── */
const patchSchema = z.object({
  role: z.string().min(1).max(64).optional(),
  isActive: z.boolean().optional(),
});

router.patch("/admin-accounts/:id", requirePermission("system.roles.manage"), async (req, res) => {
  const aReq = req as AdminRequest;
  const id = req.params["id"] as string;
  try {
    const body = patchSchema.parse(req.body);
    const [admin] = await db
      .select()
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, id))
      .limit(1);
    if (!admin) return sendNotFound(res, "Admin account not found");

    if (body.isActive === false && id === aReq.adminId) {
      return sendError(res, "You cannot deactivate your own account", 400);
    }

    const updates: Partial<typeof adminAccountsTable.$inferInsert> = {};
    if (body.role !== undefined) updates.role = body.role;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const [updated] = await db
      .update(adminAccountsTable)
      .set(updates)
      .where(eq(adminAccountsTable.id, id))
      .returning();

    if (body.isActive === false) {
      await revokeAllUserSessions(id).catch((err: unknown) => {
        logger.warn({ err, id }, "[admin-accounts] session revoke on deactivate failed");
      });
    }

    void addAuditEntry({
      action: "admin_account_update",
      adminId: aReq.adminId,
      ip: aReq.adminIp || "unknown",
      details: `targetAdminId=${id} role=${body.role ?? "unchanged"} isActive=${body.isActive ?? "unchanged"}`,
      result: "success",
    });

    sendSuccess(res, { account: safeAccount(updated!) });
  } catch (err) {
    if (err instanceof z.ZodError) return sendValidationError(res, err.message);
    logger.error({ err }, "[admin-accounts] patch failed");
    sendError(res, "Failed to update admin account", 500);
  }
});

/* ── POST /admin-accounts/:id/revoke-sessions ───────────────────── */
router.post(
  "/admin-accounts/:id/revoke-sessions",
  requirePermission("system.roles.manage"),
  async (req, res) => {
    const aReq = req as AdminRequest;
    const id = req.params["id"] as string;
    try {
      const [admin] = await db
        .select({ id: adminAccountsTable.id, name: adminAccountsTable.name })
        .from(adminAccountsTable)
        .where(eq(adminAccountsTable.id, id))
        .limit(1);
      if (!admin) return sendNotFound(res, "Admin account not found");

      await revokeAllUserSessions(id);

      void addAuditEntry({
        action: "admin_account_revoke_sessions",
        adminId: aReq.adminId,
        ip: aReq.adminIp || "unknown",
        details: `targetAdminId=${id} name=${admin.name}`,
        result: "success",
      });

      sendSuccess(res, { success: true });
    } catch (err) {
      logger.error({ err }, "[admin-accounts] revoke-sessions failed");
      sendError(res, "Failed to revoke sessions", 500);
    }
  }
);

/* ── DELETE /admin-accounts/:id ─────────────────────────────────── */
router.delete("/admin-accounts/:id", requirePermission("system.roles.manage"), async (req, res) => {
  const aReq = req as AdminRequest;
  const id = req.params["id"] as string;
  try {
    if (id === aReq.adminId) {
      return sendError(res, "You cannot delete your own account", 400);
    }
    const [admin] = await db
      .select()
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, id))
      .limit(1);
    if (!admin) return sendNotFound(res, "Admin account not found");

    await revokeAllUserSessions(id).catch((err: unknown) => {
      logger.warn({ err, id }, "[admin-accounts] session revoke before delete failed");
    });
    await db.delete(adminAccountsTable).where(eq(adminAccountsTable.id, id));

    void addAuditEntry({
      action: "admin_account_delete",
      adminId: aReq.adminId,
      ip: aReq.adminIp || "unknown",
      details: `deletedAdminId=${id} name=${admin.name} username=${admin.username ?? ""}`,
      result: "success",
    });

    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error({ err }, "[admin-accounts] delete failed");
    sendError(res, "Failed to delete admin account", 500);
  }
});

export default router;
