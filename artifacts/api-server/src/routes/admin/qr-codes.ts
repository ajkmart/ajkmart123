import { db } from "@workspace/db";
import { qrCodesTable } from "@workspace/db/schema";
import crypto from "crypto";
import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../../lib/response.js";
import { addAuditEntry, generateId, getClientIp, type AdminRequest } from "../admin-shared.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const codes = await db.select().from(qrCodesTable).orderBy(desc(qrCodesTable.createdAt));
    sendSuccess(res, { codes });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/", async (req, res) => {
  try {
    const { label, type } = req.body;
    if (!label) {
      sendValidationError(res, "Label is required");
      return;
    }

    const qrType = type || "payment";
    const code = `AJK-${qrType.toUpperCase().slice(0, 4)}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    const id = generateId();

    const [created] = await db
      .insert(qrCodesTable)
      .values({
        id,
        code,
        type: qrType,
        label,
        isActive: true,
        createdBy: (req as AdminRequest).adminId || null,
      })
      .returning();

    void addAuditEntry({
      action: "qr_code_create",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Created QR code: ${code} (${label})`,
      result: "success",
    });
    sendSuccess(res, { qrCode: created });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.patch("/:id/activate", async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const [existing] = await db.select().from(qrCodesTable).where(eq(qrCodesTable.id, id)).limit(1);
    if (!existing) {
      sendNotFound(res, "QR code not found");
      return;
    }

    await db
      .update(qrCodesTable)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(qrCodesTable.id, id));
    void addAuditEntry({
      action: "qr_code_activate",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Activated QR code: ${existing.code}`,
      result: "success",
    });
    sendSuccess(res, { success: true });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.patch("/:id/deactivate", async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const [existing] = await db.select().from(qrCodesTable).where(eq(qrCodesTable.id, id)).limit(1);
    if (!existing) {
      sendNotFound(res, "QR code not found");
      return;
    }

    await db
      .update(qrCodesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(qrCodesTable.id, id));
    void addAuditEntry({
      action: "qr_code_deactivate",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Deactivated QR code: ${existing.code}`,
      result: "success",
    });
    sendSuccess(res, { success: true });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

export default router;
