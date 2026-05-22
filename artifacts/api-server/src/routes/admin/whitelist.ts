/**
 * Admin routes for OTP Whitelist management.
 * Mounted at /api/admin/whitelist
 */
import { db } from "@workspace/db";
import { whitelistUsersTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import { sendError, sendNotFound, sendSuccess } from "../../lib/response.js";
import { adminAuth } from "../admin-shared.js";

const router = Router();
router.use(adminAuth);

/* GET /api/admin/whitelist */
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(whitelistUsersTable)
      .orderBy(desc(whitelistUsersTable.createdAt));
    res.json({ entries: rows });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* POST /api/admin/whitelist */
router.post("/", async (req, res) => {
  try {
    const { identifier, label, bypassCode, expiresAt } = req.body;

    if (!identifier) {
      sendError(res, "identifier (phone or email) is required");
      return;
    }
    if (!bypassCode) {
      sendError(res, "bypassCode is required");
      return;
    }

    const isProduction = process.env.NODE_ENV === "production";
    const insecureCodes = ["000000", "123456"];
    if (isProduction && insecureCodes.includes(bypassCode)) {
      sendError(res, `bypassCode '${bypassCode}' is not allowed in production — use a unique code`);
      return;
    }

    const id = generateId();
    try {
      const [row] = await db
        .insert(whitelistUsersTable)
        .values({
          id,
          identifier: identifier.toLowerCase().trim(),
          label: label || null,
          bypassCode,
          isActive: true,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        })
        .returning();
      sendSuccess(res, { entry: row });
    } catch (err: unknown) {
      if (err instanceof Error && err.message?.includes("unique")) {
        sendError(res, "This identifier is already in the whitelist");
        return;
      }
      throw err;
    }
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* PATCH /api/admin/whitelist/:id */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { label, bypassCode, isActive, expiresAt } = req.body;

    const [existing] = await db
      .select({ id: whitelistUsersTable.id })
      .from(whitelistUsersTable)
      .where(eq(whitelistUsersTable.id, id!))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Whitelist entry");
      return;
    }

    const updates: Partial<typeof whitelistUsersTable.$inferInsert> = { updatedAt: new Date() };
    if (label !== undefined) updates.label = label;
    if (bypassCode !== undefined) updates.bypassCode = bypassCode;
    if (isActive !== undefined) updates.isActive = isActive;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const [updated] = await db
      .update(whitelistUsersTable)
      .set(updates)
      .where(eq(whitelistUsersTable.id, id!))
      .returning();
    sendSuccess(res, { entry: updated });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* DELETE /api/admin/whitelist/:id */
router.delete("/:id", async (req, res) => {
  try {
    await db.delete(whitelistUsersTable).where(eq(whitelistUsersTable.id, req.params.id!));
    sendSuccess(res, { deleted: true });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
