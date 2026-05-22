import { db } from "@workspace/db";
import {
  deliveryAccessRequestsTable,
  deliveryWhitelistTable,
  notificationsTable,
  platformSettingsTable,
  systemAuditLogTable,
  usersTable,
  vendorProfilesTable,
} from "@workspace/db/schema";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { Router } from "express";
import { addAuditLog, invalidateDeliveryAccessCache } from "../../lib/delivery-access.js";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import {
  sendCreated,
  sendError,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../../lib/response.js";
import {
  type AdminRequest,
  getCachedSettings,
  invalidatePlatformSettingsCache,
} from "../admin-shared.js";

const router = Router();

const VALID_MODES = ["all", "stores", "users", "both"];
const VALID_TYPES = ["vendor", "user"];
const VALID_SERVICE_TYPES = ["mart", "food", "pharmacy", "parcel", "all"];

router.get("/delivery-access", async (req, res) => {
  try {
    const s = await getCachedSettings();
    const mode = s["delivery_access_mode"] ?? "all";
    const page = Math.max(1, parseInt(String(req.query["page"] || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] || "50"), 10)));
    const offset = (page - 1) * limit;
    const typeFilter = req.query["type"] as string | undefined;
    const search = req.query["search"] as string | undefined;
    const statusFilter = req.query["status"] as string | undefined;

    const conditions: SQL<unknown>[] = [];
    if (typeFilter && VALID_TYPES.includes(typeFilter)) {
      conditions.push(eq(deliveryWhitelistTable.type, typeFilter));
    }
    if (statusFilter) {
      conditions.push(eq(deliveryWhitelistTable.status, statusFilter));
    }
    if (search) {
      conditions.push(
        or(
          ilike(usersTable.name, `%${search}%`),
          ilike(usersTable.phone, `%${search}%`),
          ilike(vendorProfilesTable.storeName, `%${search}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ total: count() })
      .from(deliveryWhitelistTable)
      .leftJoin(usersTable, eq(deliveryWhitelistTable.targetId, usersTable.id))
      .where(whereClause);
    const total = countRow?.total ?? 0;

    const rows = await db
      .select({
        id: deliveryWhitelistTable.id,
        type: deliveryWhitelistTable.type,
        targetId: deliveryWhitelistTable.targetId,
        serviceType: deliveryWhitelistTable.serviceType,
        status: deliveryWhitelistTable.status,
        validUntil: deliveryWhitelistTable.validUntil,
        deliveryLabel: deliveryWhitelistTable.deliveryLabel,
        notes: deliveryWhitelistTable.notes,
        createdBy: deliveryWhitelistTable.createdBy,
        createdAt: deliveryWhitelistTable.createdAt,
        updatedAt: deliveryWhitelistTable.updatedAt,
        userName: usersTable.name,
        userPhone: usersTable.phone,
        userRoles: usersTable.roles,
        storeName: vendorProfilesTable.storeName,
      })
      .from(deliveryWhitelistTable)
      .leftJoin(usersTable, eq(deliveryWhitelistTable.targetId, usersTable.id))
      .leftJoin(
        vendorProfilesTable,
        eq(deliveryWhitelistTable.targetId, vendorProfilesTable.userId)
      )
      .where(whereClause)
      .orderBy(desc(deliveryWhitelistTable.createdAt))
      .limit(limit)
      .offset(offset);

    sendSuccess(res, { mode, whitelist: rows, total, page, limit });
  } catch (e: unknown) {
    sendError(res, e instanceof Error ? e.message : "Failed to fetch delivery access data", 500);
  }
});

router.put("/delivery-access/mode", async (req, res) => {
  try {
    const { mode } = req.body;
    if (!mode || !VALID_MODES.includes(mode)) {
      sendValidationError(res, `Invalid mode. Must be one of: ${VALID_MODES.join(", ")}`);
      return;
    }

    const s = await getCachedSettings();
    const oldMode = s["delivery_access_mode"] ?? "all";

    await db
      .insert(platformSettingsTable)
      .values({
        key: "delivery_access_mode",
        value: mode,
        label: "Delivery Access Mode",
        category: "delivery",
      })
      .onConflictDoUpdate({
        target: platformSettingsTable.key,
        set: { value: mode, updatedAt: new Date() },
      });

    invalidatePlatformSettingsCache();
    invalidateDeliveryAccessCache();

    const adminReq = req as AdminRequest;
    await addAuditLog({
      adminId: adminReq.adminId,
      adminName: adminReq.adminName,
      action: "delivery_mode_change",
      targetType: "system",
      oldValue: oldMode,
      newValue: mode,
    });

    sendSuccess(res, { mode });
  } catch (e: unknown) {
    sendError(res, e instanceof Error ? e.message : "Failed to update mode", 500);
  }
});

router.get("/delivery-access/whitelist", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query["page"] || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] || "50"), 10)));
    const offset = (page - 1) * limit;
    const typeFilter = req.query["type"] as string | undefined;
    const statusFilter = req.query["status"] as string | undefined;
    const search = req.query["search"] as string | undefined;

    const conditions: SQL<unknown>[] = [];
    if (typeFilter && VALID_TYPES.includes(typeFilter))
      conditions.push(eq(deliveryWhitelistTable.type, typeFilter));
    if (statusFilter) conditions.push(eq(deliveryWhitelistTable.status, statusFilter));
    if (search) {
      conditions.push(
        or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.phone, `%${search}%`))!
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countRow] = await db
      .select({ total: count() })
      .from(deliveryWhitelistTable)
      .leftJoin(usersTable, eq(deliveryWhitelistTable.targetId, usersTable.id))
      .where(where);
    const rows = await db
      .select({
        id: deliveryWhitelistTable.id,
        type: deliveryWhitelistTable.type,
        targetId: deliveryWhitelistTable.targetId,
        serviceType: deliveryWhitelistTable.serviceType,
        status: deliveryWhitelistTable.status,
        validUntil: deliveryWhitelistTable.validUntil,
        notes: deliveryWhitelistTable.notes,
        createdAt: deliveryWhitelistTable.createdAt,
        userName: usersTable.name,
        userPhone: usersTable.phone,
      })
      .from(deliveryWhitelistTable)
      .leftJoin(usersTable, eq(deliveryWhitelistTable.targetId, usersTable.id))
      .where(where)
      .orderBy(desc(deliveryWhitelistTable.createdAt))
      .limit(limit)
      .offset(offset);
    sendSuccess(res, {
      whitelist: rows,
      total: countRow?.total ?? 0,
      page,
      limit,
      pages: Math.ceil((countRow?.total ?? 0) / limit),
    });
  } catch (e) {
    logger.error({ err: e }, "[delivery-access] whitelist GET error");
    sendError(res, "Failed to load whitelist", 500);
  }
});

router.post("/delivery-access/whitelist", async (req, res) => {
  try {
    const { type, targetId, serviceType, validUntil, deliveryLabel, notes } = req.body;

    if (!type || !VALID_TYPES.includes(type)) {
      sendValidationError(res, "type must be 'vendor' or 'user'");
      return;
    }
    if (!targetId) {
      sendValidationError(res, "targetId is required");
      return;
    }
    if (serviceType && !VALID_SERVICE_TYPES.includes(serviceType)) {
      sendValidationError(res, `serviceType must be one of: ${VALID_SERVICE_TYPES.join(", ")}`);
      return;
    }

    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, targetId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "Target user/vendor not found");
      return;
    }

    const adminReq = req as AdminRequest;
    const id = generateId();

    await db.insert(deliveryWhitelistTable).values({
      id,
      type,
      targetId,
      serviceType: serviceType || "all",
      status: "active",
      validUntil: validUntil ? new Date(validUntil) : null,
      deliveryLabel: type === "vendor" ? deliveryLabel || null : null,
      notes: notes || null,
      createdBy: adminReq.adminId ?? adminReq.adminName ?? "admin",
    });

    invalidateDeliveryAccessCache();

    await addAuditLog({
      adminId: adminReq.adminId,
      adminName: adminReq.adminName,
      action: "whitelist_add",
      targetType: type,
      targetId,
      newValue: JSON.stringify({
        serviceType: serviceType || "all",
        deliveryLabel,
      }),
    });

    sendCreated(res, { id, type, targetId, serviceType: serviceType || "all" });
  } catch (e: unknown) {
    sendError(res, e instanceof Error ? e.message : "Failed to add whitelist entry", 500);
  }
});

router.post("/delivery-access/whitelist/bulk", async (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      sendValidationError(res, "entries array is required");
      return;
    }

    const adminReq = req as AdminRequest;
    const results: { id: string; targetId: string; status: string }[] = [];

    for (const entry of entries) {
      const { type, targetId, serviceType, validUntil, deliveryLabel, notes } = entry;
      if (!type || !VALID_TYPES.includes(type) || !targetId) continue;

      const [user] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, targetId))
        .limit(1);
      if (!user) {
        results.push({ id: "", targetId, status: "not_found" });
        continue;
      }

      const id = generateId();
      await db.insert(deliveryWhitelistTable).values({
        id,
        type,
        targetId,
        serviceType: serviceType || "all",
        status: "active",
        validUntil: validUntil ? new Date(validUntil) : null,
        deliveryLabel: type === "vendor" ? deliveryLabel || null : null,
        notes: notes || null,
        createdBy: adminReq.adminId ?? "admin",
      });
      results.push({ id, targetId, status: "added" });
    }

    invalidateDeliveryAccessCache();

    await addAuditLog({
      adminId: adminReq.adminId,
      adminName: adminReq.adminName,
      action: "whitelist_bulk_add",
      targetType: "bulk",
      newValue: `${results.filter((r) => r.status === "added").length} entries added`,
    });

    sendSuccess(res, { results });
  } catch (e: unknown) {
    sendError(res, e instanceof Error ? e.message : "Bulk import failed", 500);
  }
});

router.patch("/delivery-access/whitelist/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { deliveryLabel, notes, validUntil, status } = req.body;

    const [existing] = await db
      .select()
      .from(deliveryWhitelistTable)
      .where(eq(deliveryWhitelistTable.id, id!))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Whitelist entry not found");
      return;
    }

    const updates: Partial<typeof deliveryWhitelistTable.$inferInsert> = { updatedAt: new Date() };
    if (deliveryLabel !== undefined) updates.deliveryLabel = deliveryLabel || null;
    if (notes !== undefined) updates.notes = notes || null;
    if (validUntil !== undefined) updates.validUntil = validUntil ? new Date(validUntil) : null;
    if (status && ["active", "expired"].includes(status)) updates.status = status;

    await db.update(deliveryWhitelistTable).set(updates).where(eq(deliveryWhitelistTable.id, id!));
    invalidateDeliveryAccessCache();

    const adminReq = req as AdminRequest;
    await addAuditLog({
      adminId: adminReq.adminId,
      adminName: adminReq.adminName,
      action: "whitelist_update",
      targetType: existing.type,
      targetId: existing.targetId,
      oldValue: JSON.stringify({
        deliveryLabel: existing.deliveryLabel,
        notes: existing.notes,
        status: existing.status,
      }),
      newValue: JSON.stringify(updates),
    });

    sendSuccess(res, { id, updated: true });
  } catch (e: unknown) {
    sendError(res, e instanceof Error ? e.message : "Failed to update", 500);
  }
});

router.delete("/delivery-access/whitelist/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [existing] = await db
      .select()
      .from(deliveryWhitelistTable)
      .where(eq(deliveryWhitelistTable.id, id!))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Whitelist entry not found");
      return;
    }

    await db.delete(deliveryWhitelistTable).where(eq(deliveryWhitelistTable.id, id!));
    invalidateDeliveryAccessCache();

    const adminReq = req as AdminRequest;
    await addAuditLog({
      adminId: adminReq.adminId,
      adminName: adminReq.adminName,
      action: "whitelist_remove",
      targetType: existing.type,
      targetId: existing.targetId,
      oldValue: JSON.stringify({
        serviceType: existing.serviceType,
        deliveryLabel: existing.deliveryLabel,
      }),
    });

    sendSuccess(res, { deleted: true });
  } catch (e: unknown) {
    sendError(res, e instanceof Error ? e.message : "Failed to delete", 500);
  }
});

router.get("/delivery-access/requests", async (req, res) => {
  try {
    const statusFilter = req.query["status"] as string | undefined;
    const conditions: SQL<unknown>[] = [];
    if (statusFilter) conditions.push(eq(deliveryAccessRequestsTable.status, statusFilter));

    const rows = await db
      .select({
        id: deliveryAccessRequestsTable.id,
        vendorId: deliveryAccessRequestsTable.vendorId,
        serviceType: deliveryAccessRequestsTable.serviceType,
        status: deliveryAccessRequestsTable.status,
        requestedAt: deliveryAccessRequestsTable.requestedAt,
        resolvedAt: deliveryAccessRequestsTable.resolvedAt,
        resolvedBy: deliveryAccessRequestsTable.resolvedBy,
        notes: deliveryAccessRequestsTable.notes,
        vendorName: usersTable.name,
        vendorPhone: usersTable.phone,
        storeName: vendorProfilesTable.storeName,
      })
      .from(deliveryAccessRequestsTable)
      .leftJoin(usersTable, eq(deliveryAccessRequestsTable.vendorId, usersTable.id))
      .leftJoin(
        vendorProfilesTable,
        eq(deliveryAccessRequestsTable.vendorId, vendorProfilesTable.userId)
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(deliveryAccessRequestsTable.requestedAt));

    sendSuccess(res, { requests: rows });
  } catch (e: unknown) {
    sendError(res, e instanceof Error ? e.message : "Failed to fetch requests", 500);
  }
});

router.patch("/delivery-access/requests/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { status, notes } = req.body;

    if (!status || !["approved", "rejected"].includes(status)) {
      sendValidationError(res, "status must be 'approved' or 'rejected'");
      return;
    }

    const [request] = await db
      .select()
      .from(deliveryAccessRequestsTable)
      .where(eq(deliveryAccessRequestsTable.id, id!))
      .limit(1);
    if (!request) {
      sendNotFound(res, "Request not found");
      return;
    }

    const adminReq = req as AdminRequest;
    const now = new Date();

    await db
      .update(deliveryAccessRequestsTable)
      .set({
        status,
        resolvedAt: now,
        resolvedBy: adminReq.adminId ?? adminReq.adminName ?? "admin",
        notes: notes || request.notes,
      })
      .where(eq(deliveryAccessRequestsTable.id, id!));

    if (status === "approved") {
      const whitelistId = generateId();
      await db.insert(deliveryWhitelistTable).values({
        id: whitelistId,
        type: "vendor",
        targetId: request.vendorId,
        serviceType: request.serviceType,
        status: "active",
        createdBy: adminReq.adminId ?? "admin",
      });
      invalidateDeliveryAccessCache();
    } else if (status === "rejected") {
      const matchConditions = [
        eq(deliveryWhitelistTable.type, "vendor"),
        eq(deliveryWhitelistTable.targetId, request.vendorId),
        eq(deliveryWhitelistTable.status, "active"),
      ];
      if (request.serviceType !== "all") {
        matchConditions.push(eq(deliveryWhitelistTable.serviceType, request.serviceType));
      }
      await db
        .update(deliveryWhitelistTable)
        .set({ status: "revoked", updatedAt: now })
        .where(and(...matchConditions));
      invalidateDeliveryAccessCache();
    }

    try {
      await db.insert(notificationsTable).values({
        id: generateId(),
        userId: request.vendorId,
        title:
          status === "approved" ? "Delivery Access Approved" : "Delivery Access Request Rejected",
        body:
          status === "approved"
            ? `Your delivery access request for ${request.serviceType} has been approved.`
            : `Your delivery access request for ${request.serviceType} has been rejected.${notes ? ` Reason: ${notes}` : ""}`,
        type: "system",
      });
    } catch (err) {
      logger.warn(
        {
          vendorId: request.vendorId,
          status,
          err: err instanceof Error ? err.message : String(err),
        },
        "[admin:delivery-access] Failed to send delivery access notification"
      );
    }

    await addAuditLog({
      adminId: adminReq.adminId,
      adminName: adminReq.adminName,
      action: `delivery_request_${status}`,
      targetType: "vendor",
      targetId: request.vendorId,
      newValue: JSON.stringify({ serviceType: request.serviceType, status }),
    });

    sendSuccess(res, { id: id!, status });
  } catch (e: unknown) {
    sendError(res, e instanceof Error ? e.message : "Failed to resolve request", 500);
  }
});

router.get("/delivery-access/audit", async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] || "50"), 10)));
    const rows = await db
      .select()
      .from(systemAuditLogTable)
      .where(
        or(
          eq(systemAuditLogTable.action, "delivery_mode_change"),
          eq(systemAuditLogTable.action, "whitelist_add"),
          eq(systemAuditLogTable.action, "whitelist_remove"),
          eq(systemAuditLogTable.action, "whitelist_update"),
          eq(systemAuditLogTable.action, "whitelist_bulk_add"),
          eq(systemAuditLogTable.action, "delivery_request_approved"),
          eq(systemAuditLogTable.action, "delivery_request_rejected")
        )
      )
      .orderBy(desc(systemAuditLogTable.createdAt))
      .limit(limit);

    sendSuccess(res, { logs: rows });
  } catch (e: unknown) {
    sendError(res, e instanceof Error ? e.message : "Failed to fetch audit log", 500);
  }
});

export default router;
