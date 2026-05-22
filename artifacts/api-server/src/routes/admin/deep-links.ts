import { db } from "@workspace/db";
import { deepLinksTable } from "@workspace/db/schema";
import crypto from "crypto";
import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../../lib/response.js";
import { addAuditEntry, generateId, getClientIp, type AdminRequest } from "../admin-shared.js";

const TARGET_SCREENS = [
  "product",
  "vendor",
  "category",
  "promo",
  "ride",
  "food",
  "mart",
  "pharmacy",
  "parcel",
  "van",
];

const router = Router();

router.get("/deep-links", async (_req, res) => {
  try {
    const links = await db.select().from(deepLinksTable).orderBy(desc(deepLinksTable.createdAt));
    sendSuccess(res, { links });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/deep-links", async (req, res) => {
  try {
    const { targetScreen, params, label } = req.body;
    if (!targetScreen) {
      sendValidationError(res, "Target screen is required");
      return;
    }
    if (!TARGET_SCREENS.includes(targetScreen)) {
      sendValidationError(res, `Invalid target screen. Supported: ${TARGET_SCREENS.join(", ")}`);
      return;
    }

    const requiresId: Record<string, string> = {
      product: "productId",
      vendor: "vendorId",
    };
    const requiredParam = requiresId[targetScreen];
    if (requiredParam && (!params || !params[requiredParam])) {
      sendValidationError(
        res,
        `Target screen "${targetScreen}" requires parameter "${requiredParam}"`
      );
      return;
    }

    const id = generateId();
    const shortCode = crypto.randomBytes(4).toString("hex");

    const [created] = await db
      .insert(deepLinksTable)
      .values({
        id,
        shortCode,
        targetScreen,
        params: params || {},
        label: label || "",
      })
      .returning();

    void addAuditEntry({
      action: "deep_link_create",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Created deep link: ${shortCode} -> ${targetScreen}`,
      result: "success",
    });
    sendSuccess(res, { link: created });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.delete("/deep-links/:id", async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const [existing] = await db
      .select()
      .from(deepLinksTable)
      .where(eq(deepLinksTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Deep link not found");
      return;
    }

    await db.delete(deepLinksTable).where(eq(deepLinksTable.id, id));
    void addAuditEntry({
      action: "deep_link_delete",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Deleted deep link: ${existing.shortCode}`,
      result: "success",
    });
    sendSuccess(res, { success: true });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

export default router;
