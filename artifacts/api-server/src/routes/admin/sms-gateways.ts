/**
 * Admin routes for SMS Gateway management.
 * Mounted at /api/admin/sms-gateways
 */
import { db } from "@workspace/db";
import { smsGatewaysTable } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";
import { Router } from "express";
import { generateId } from "../../lib/id.js";
import { sendError, sendNotFound, sendSuccess } from "../../lib/response.js";
import { adminAuth } from "../admin-shared.js";

const router = Router();
router.use(adminAuth);

/* GET /api/admin/sms-gateways — list all gateways */
router.get("/", async (_req, res) => {
  try {
    const rows = await db.select().from(smsGatewaysTable).orderBy(asc(smsGatewaysTable.priority));

    res.json({
      gateways: rows.map((g) => ({
        id: g.id,
        name: g.name,
        provider: g.provider,
        priority: g.priority,
        isActive: g.isActive,
        senderId: g.senderId,
        fromNumber: g.fromNumber,
        hasCredentials: !!(g.accountSid || g.msg91Key || g.apiKey),
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      })),
    });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

/* POST /api/admin/sms-gateways — create gateway */
router.post("/", async (req, res) => {
  try {
    const {
      name,
      provider,
      priority,
      isActive,
      accountSid,
      authToken,
      fromNumber,
      msg91Key,
      senderId,
      apiKey,
      apiUrl,
    } = req.body;

    if (!name || !provider) {
      sendError(res, "name and provider are required");
      return;
    }

    const id = generateId();
    const [row] = await db
      .insert(smsGatewaysTable)
      .values({
        id,
        name,
        provider,
        priority: priority ?? 10,
        isActive: isActive ?? true,
        accountSid: accountSid || null,
        authToken: authToken || null,
        fromNumber: fromNumber || null,
        msg91Key: msg91Key || null,
        senderId: senderId || null,
        apiKey: apiKey || null,
        apiUrl: apiUrl || null,
      })
      .returning();

    sendSuccess(res, { gateway: row });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

/* PATCH /api/admin/sms-gateways/:id — update gateway */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const {
      name,
      provider,
      priority,
      isActive,
      accountSid,
      authToken,
      fromNumber,
      msg91Key,
      senderId,
      apiKey,
      apiUrl,
    } = req.body;

    const [existing] = await db
      .select({ id: smsGatewaysTable.id })
      .from(smsGatewaysTable)
      .where(eq(smsGatewaysTable.id, id!))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Gateway");
      return;
    }

    const updates: Partial<typeof smsGatewaysTable.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (provider !== undefined) updates.provider = provider;
    if (priority !== undefined) updates.priority = priority;
    if (isActive !== undefined) updates.isActive = isActive;
    if (accountSid !== undefined) updates.accountSid = accountSid || null;
    if (authToken !== undefined) updates.authToken = authToken || null;
    if (fromNumber !== undefined) updates.fromNumber = fromNumber || null;
    if (msg91Key !== undefined) updates.msg91Key = msg91Key || null;
    if (senderId !== undefined) updates.senderId = senderId || null;
    if (apiKey !== undefined) updates.apiKey = apiKey || null;
    if (apiUrl !== undefined) updates.apiUrl = apiUrl || null;

    const [updated] = await db
      .update(smsGatewaysTable)
      .set(updates)
      .where(eq(smsGatewaysTable.id, id!))
      .returning();
    sendSuccess(res, { gateway: updated });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

/* DELETE /api/admin/sms-gateways/:id — delete gateway */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    if (id === "default-console") {
      sendError(res, "Cannot delete the default console gateway");
      return;
    }
    await db.delete(smsGatewaysTable).where(eq(smsGatewaysTable.id, id!));
    sendSuccess(res, { deleted: true });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

/* PATCH /api/admin/sms-gateways/:id/toggle — quick toggle isActive */
router.patch("/:id/toggle", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [gw] = await db
      .select()
      .from(smsGatewaysTable)
      .where(eq(smsGatewaysTable.id, id!))
      .limit(1);
    if (!gw) {
      sendNotFound(res, "Gateway");
      return;
    }
    const [updated] = await db
      .update(smsGatewaysTable)
      .set({ isActive: !gw.isActive, updatedAt: new Date() })
      .where(eq(smsGatewaysTable.id, id!))
      .returning();
    sendSuccess(res, { gateway: updated });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

export default router;
