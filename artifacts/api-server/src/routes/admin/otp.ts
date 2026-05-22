import { db } from "@workspace/db";
import {
  otpBypassAuditTable,
  ridesTable,
  usersTable,
  whitelistUsersTable,
} from "@workspace/db/schema";
import { randomBytes } from "crypto";
import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import { sendNotFound, sendSuccess, sendValidationError } from "../../lib/response.js";
import { writeAuthAuditLog } from "../../middleware/security.js";
import { AuditService } from "../../services/admin-audit.service.js";
import { NotificationService } from "../../services/admin-notification.service.js";
import { UserService } from "../../services/admin-user.service.js";
import { getClientIp, getPlatformSettings, type AdminRequest } from "../admin-shared.js";

const router = Router();

/* Shared regex constant — must mirror the one in the admin SPA so client/server
   accept exactly the same set of bypass codes. */
export const BYPASS_CODE_REGEX = /^[0-9]{6}$/;

/* Generic, shape-typed update payload for the whitelist PATCH endpoint. */
interface WhitelistUpdate {
  label?: string | null;
  bypassCode?: string;
  isActive?: boolean;
  expiresAt?: Date | null;
  updatedAt?: Date;
}

/**
 * Cryptographically secure 6-digit bypass code.
 *
 * `Math.random()` is a Mersenne-Twister PRNG that can be seeded/predicted by
 * an attacker who observes a few outputs. `crypto.randomBytes` is backed by
 * the OS CSPRNG, which is required for any value used as an authentication
 * secret — bypass codes log a user in without OTP, so they fall in that bucket.
 */
function generateBypassCode(): string {
  // 3 random bytes give 0..16,777,215; modulo into the 6-digit space.
  const n = randomBytes(3).readUIntBE(0, 3) % 1_000_000;
  return n.toString().padStart(6, "0");
}

/**
 * Normalise the User-Agent header to a string. Express types it as
 * `string | string[] | undefined`, so a blind `as string` cast can crash
 * downstream code (e.g. when audit columns are NOT NULL).
 */
function safeUserAgent(req: { headers: { "user-agent"?: string | string[] } }): string {
  const raw = req.headers["user-agent"];
  if (Array.isArray(raw)) return raw.join(", ") || "unknown";
  return (raw ?? "unknown") as string;
}

/**
 * Map a thrown error to a safe, generic message for the client while
 * preserving the original details in our server logs. We never want to
 * surface raw DB messages (table/column names, constraint details) to
 * the browser — they leak schema and aid attackers.
 */
function sendServerError(res: import("express").Response, error: unknown, context: string): void {
  logger.error({ err: error, context }, `[admin/otp] ${context}`);
  res.status(500).json({
    success: false,
    error: "Database operation failed. Please try again.",
  });
}

/* ─── GET /admin/otp/status ───────────────────────────────────────────────── */
router.get("/otp/status", async (_req, res) => {
  try {
    const status = await UserService.getOtpStatus();
    sendSuccess(res, status);
  } catch (error: unknown) {
    sendValidationError(res, error instanceof Error ? error.message : String(error));
  }
});

/* ─── POST /admin/otp/disable ─────────────────────────────────────────────── */
router.post("/otp/disable", async (req, res) => {
  const minutes = Number(req.body?.minutes);
  const reason: string | undefined =
    typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : undefined;
  const adminReq = req as AdminRequest;

  try {
    const _auditDetails = reason
      ? `Disabled OTP for ${minutes} minutes. Reason: ${reason}`
      : `Disabled OTP for ${minutes} minutes`;

    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_otp_global_disable",
        resourceType: "otp_config",
        resource: "global_disable",
        details: `Disabled OTP for ${minutes} minutes${reason ? ` — reason: ${reason}` : ""}`,
      },
      () => UserService.disableOtpGlobally(minutes)
    );

    void writeAuthAuditLog("admin_otp_global_disable", {
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? undefined,
      metadata: {
        adminId: adminReq.adminId,
        minutes,
        disabledUntil: result.disabledUntil,
        reason: reason ?? null,
        result: "success",
      },
    });

    /* Fire internal admin notification via NotificationService so all admins are aware */
    try {
      const s = await getPlatformSettings();
      const appName = s["app_name"] ?? "AJKMart";
      const adminName = adminReq.adminName ?? adminReq.adminId ?? "Unknown admin";
      const paragraphs: string[] = [
        `Admin ${adminName} (ID: ${adminReq.adminId}) has suspended OTP verification for all users for ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        ...(reason ? [`Reason: ${reason}`] : []),
        `OTPs will auto-resume at ${new Date(result.disabledUntil).toUTCString()}. Users can log in without OTP during this window.`,
      ];
      await NotificationService.sendSecurityAlert({
        subject: `[${appName}] Global OTP Suspension Activated`,
        headline: "⚠️ Global OTP Suspension Activated",
        paragraphs,
        settings: s,
      });
    } catch (alertErr) {
      logger.warn({ err: alertErr }, "[admin/otp] admin notification send failed (non-fatal)");
    }

    sendSuccess(res, result);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    sendValidationError(res, errMsg);
  }
});

/* ─── DELETE /admin/otp/disable ───────────────────────────────────────────── */
router.delete("/otp/disable", async (req, res) => {
  const adminReq = req as AdminRequest;

  try {
    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_otp_global_restore",
        resourceType: "otp_config",
        resource: "global_restore",
        details: "Restored global OTP (early restore)",
      },
      () => UserService.restoreOtpGlobally()
    );

    void writeAuthAuditLog("admin_otp_global_restore", {
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? undefined,
      metadata: { adminId: adminReq.adminId, result: "success" },
    });

    sendSuccess(res, result);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    sendValidationError(res, errMsg);
  }
});

/* ─── GET /admin/otp/audit ─────────────────────────────────────────────── */
router.get("/otp/audit", async (req, res) => {
  const { userId, from, to, page } = req.query as Record<string, string>;

  try {
    const result = await UserService.getOtpAuditLog({
      userId,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
    });
    sendSuccess(res, result);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes("Invalid")) {
      res.status(400).json({ error: "Failed to fetch OTP audit log", details: errMsg });
    } else {
      res.status(500).json({ error: "Failed to fetch OTP audit log", details: errMsg });
    }
  }
});

/* ─── GET /admin/otp/channels ─────────────────────────────────────────────── */
router.get("/otp/channels", async (_req, res) => {
  try {
    const result = await UserService.getOtpChannels();
    sendSuccess(res, result);
  } catch (error: unknown) {
    sendValidationError(res, error instanceof Error ? error.message : String(error));
  }
});

/* ─── PATCH /admin/otp/channels ───────────────────────────────────────────── */
router.patch("/otp/channels", async (req, res) => {
  const { channels } = req.body;
  const adminReq = req as AdminRequest;

  try {
    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_otp_channels_update",
        resourceType: "otp_config",
        resource: "channels",
        details: `Updated OTP channel priority: ${channels?.join(" → ")}`,
      },
      () => UserService.updateOtpChannels(channels)
    );

    sendSuccess(res, result);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    sendValidationError(res, errMsg);
  }
});

/* ─── POST /admin/users/:id/otp/generate ─────────────────────────────────── */
router.post("/users/:id/otp/generate", async (req, res) => {
  const userId = req.params["id"] as string;
  const adminReq = req as AdminRequest;

  try {
    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_otp_generate",
        resourceType: "user",
        resource: userId,
        details: `Generated OTP for user ${userId}`,
      },
      () => UserService.generateOtpForUser(userId)
    );

    void writeAuthAuditLog("admin_otp_generate", {
      userId,
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? undefined,
      metadata: { phone: result.phone, adminId: adminReq.adminId },
    });

    sendSuccess(res, { otp: result.otp, expiresAt: result.expiresAt });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes("not found")) {
      sendNotFound(res, "User not found");
    } else {
      sendValidationError(res, errMsg);
    }
  }
});

/* ──────────────────────────────────────────────────────────────────────────── */
/* PER-USER OTP BYPASS ENDPOINTS                                              */
/* ──────────────────────────────────────────────────────────────────────────── */

/* ─── POST /admin/users/:id/otp/bypass ────────────────────────────────────────*/
router.post("/users/:id/otp/bypass", async (req, res) => {
  const userId = req.params["id"] as string;
  const minutes = Number(req.body?.minutes || 0);
  const adminReq = req as AdminRequest;

  if (!minutes || minutes <= 0 || minutes > 1440) {
    return sendValidationError(res, "Minutes must be between 1 and 1440");
  }

  try {
    // Verify user exists and capture any existing active bypass.
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
      columns: { id: true, phone: true, email: true, name: true, otpBypassUntil: true },
    });

    if (!user) {
      return sendNotFound(res, "User not found");
    }

    /* Conflict guard: if the user already has an unexpired bypass, refuse
       to silently overwrite it. Returning 409 lets the admin SPA surface a
       confirmation prompt rather than blindly resetting the timer. */
    const now = new Date();
    if (user.otpBypassUntil && user.otpBypassUntil.getTime() > now.getTime()) {
      return res.status(409).json({
        success: false,
        error: "User already has an active OTP bypass.",
        existingBypassUntil: user.otpBypassUntil.toISOString(),
      });
    }

    const bypassUntil = new Date(Date.now() + minutes * 60 * 1000);
    const userAgent = safeUserAgent(req);
    const ip = getClientIp(req);

    /* Atomic write: the user row update and the audit log row must both
       commit, or neither. Without a transaction, an audit-table failure
       would leave the bypass active in production with no record of who
       granted it — exactly the inconsistency the auditors flagged. */
    await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
      await tx
        .update(usersTable)
        .set({ otpBypassUntil: bypassUntil, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));

      await tx.insert(otpBypassAuditTable).values({
        id: generateId(),
        eventType: "otp_bypass_granted",
        userId,
        adminId: adminReq.adminId,
        phone: user.phone,
        email: user.email,
        bypassReason: "admin_grant",
        expiresAt: bypassUntil,
        ipAddress: ip,
        userAgent,
        metadata: { minutes },
      });
    });

    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: ip,
        action: "admin_otp_bypass_grant",
        resourceType: "user",
        resource: userId,
        details: `Granted OTP bypass to ${user.phone || user.email} for ${minutes} minutes`,
      },
      async () => ({ success: true })
    );

    sendSuccess(res, {
      bypassUntil: bypassUntil.toISOString(),
      minutesGranted: minutes,
      userPhone: user.phone,
      userName: user.name,
    });
  } catch (error) {
    sendServerError(res, error, "grant per-user bypass");
  }
});

/* ─── DELETE /admin/users/:id/otp/bypass ──────────────────────────────────────*/
router.delete("/users/:id/otp/bypass", async (req, res) => {
  const userId = req.params["id"] as string;
  const adminReq = req as AdminRequest;

  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
      columns: { id: true, phone: true, email: true, name: true, otpBypassUntil: true },
    });

    if (!user) {
      return sendNotFound(res, "User not found");
    }

    const userAgent = safeUserAgent(req);
    const ip = getClientIp(req);

    /* Same atomicity guarantee as the grant endpoint above. */
    await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
      await tx
        .update(usersTable)
        .set({ otpBypassUntil: null, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));

      await tx.insert(otpBypassAuditTable).values({
        id: generateId(),
        eventType: "otp_bypass_revoked",
        userId,
        adminId: adminReq.adminId,
        phone: user.phone,
        email: user.email,
        bypassReason: "admin_revoke",
        ipAddress: ip,
        userAgent,
      });
    });

    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: ip,
        action: "admin_otp_bypass_revoke",
        resourceType: "user",
        resource: userId,
        details: `Revoked OTP bypass for ${user.phone || user.email}`,
      },
      async () => ({ success: true })
    );

    sendSuccess(res, {
      message: `Bypass revoked for ${user.phone || user.email}`,
    });
  } catch (error) {
    sendServerError(res, error, "revoke per-user bypass");
  }
});

/* ──────────────────────────────────────────────────────────────────────────── */
/* WHITELIST CRUD ENDPOINTS                                                   */
/* ──────────────────────────────────────────────────────────────────────────── */

/* ─── GET /admin/whitelist ────────────────────────────────────────────────────*/
router.get("/whitelist", async (_req, res) => {
  try {
    const entries = await db.query.whitelistUsersTable.findMany({
      orderBy: desc(whitelistUsersTable.createdAt),
    });

    sendSuccess(res, { entries });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    sendValidationError(res, errMsg);
  }
});

/* ─── POST /admin/whitelist ───────────────────────────────────────────────────*/
router.post("/whitelist", async (req, res) => {
  const { identifier, label, bypassCode, expiresAt } = req.body;
  const adminReq = req as AdminRequest;
  const code = (bypassCode || generateBypassCode()).trim();

  if (!identifier || identifier.length < 7) {
    return sendValidationError(res, "Identifier must be at least 7 characters (phone or email)");
  }

  if (!BYPASS_CODE_REGEX.test(code)) {
    return sendValidationError(res, "Bypass code must be exactly 6 digits");
  }

  let expires: Date | null = null;
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return sendValidationError(res, "Expires At must be a valid date/time");
    }
    expires = parsed;
  }

  try {
    // Check if already exists
    const existing = await db.query.whitelistUsersTable.findFirst({
      where: eq(whitelistUsersTable.identifier, identifier),
      columns: { id: true },
    });

    if (existing) {
      return res.status(409).json({ error: "Identifier already whitelisted" });
    }

    const id = generateId();

    await db.insert(whitelistUsersTable).values({
      id,
      identifier,
      label: label || null,
      bypassCode: code,
      isActive: true,
      expiresAt: expires,
      createdBy: adminReq.adminId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_whitelist_entry_add",
        resourceType: "whitelist",
        resource: id,
        details: `Added whitelist entry: ${identifier}${label ? ` (${label})` : ""}`,
      },
      async () => ({ success: true })
    );

    sendSuccess(res, {
      entry: {
        id,
        identifier,
        label: label || null,
        bypassCode: code,
        isActive: true,
        expiresAt: expires ? expires.toISOString() : null,
      },
    });
  } catch (error) {
    sendServerError(res, error, "create whitelist entry");
  }
});

/* ─── PATCH /admin/whitelist/:id ──────────────────────────────────────────────*/
router.patch("/whitelist/:id", async (req, res) => {
  const id = req.params["id"] as string;
  const updates = (req.body ?? {}) as Partial<WhitelistUpdate> & {
    expiresAt?: string | Date | null;
  };
  const adminReq = req as AdminRequest;

  try {
    const existing = await db.query.whitelistUsersTable.findFirst({
      where: eq(whitelistUsersTable.id, id),
    });

    if (!existing) {
      return sendNotFound(res, "Whitelist entry not found");
    }

    /* Build a strongly-typed update payload — `Record<string, any>` was
       hiding typos and accepting fields that the schema doesn't know about. */
    const updateData: Partial<WhitelistUpdate> = { updatedAt: new Date() };

    if (updates.label !== undefined) {
      updateData.label = updates.label;
    }

    if (updates.bypassCode) {
      if (!BYPASS_CODE_REGEX.test(updates.bypassCode)) {
        return sendValidationError(res, "Bypass code must be exactly 6 digits");
      }
      updateData.bypassCode = updates.bypassCode;
    }

    if (updates.isActive !== undefined) {
      updateData.isActive = updates.isActive;
    }

    if (updates.expiresAt !== undefined) {
      updateData.expiresAt = updates.expiresAt
        ? updates.expiresAt instanceof Date
          ? updates.expiresAt
          : new Date(updates.expiresAt)
        : null;
    }

    await db.update(whitelistUsersTable).set(updateData).where(eq(whitelistUsersTable.id, id));

    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_whitelist_entry_update",
        resourceType: "whitelist",
        resource: id,
        details: `Updated whitelist entry: ${existing.identifier}`,
      },
      async () => ({ success: true })
    );

    sendSuccess(res, { message: "Whitelist entry updated" });
  } catch (error) {
    sendServerError(res, error, "update whitelist entry");
  }
});

/* ─── DELETE /admin/whitelist/:id ─────────────────────────────────────────────*/
router.delete("/whitelist/:id", async (req, res) => {
  const id = req.params["id"] as string;
  const adminReq = req as AdminRequest;

  try {
    const existing = await db.query.whitelistUsersTable.findFirst({
      where: eq(whitelistUsersTable.id, id),
      columns: { id: true, identifier: true },
    });

    if (!existing) {
      return sendNotFound(res, "Whitelist entry not found");
    }

    await db.delete(whitelistUsersTable).where(eq(whitelistUsersTable.id, id));

    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_whitelist_entry_delete",
        resourceType: "whitelist",
        resource: id,
        details: `Deleted whitelist entry: ${existing.identifier}`,
      },
      async () => ({ success: true })
    );

    sendSuccess(res, { message: "Whitelist entry deleted" });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    sendValidationError(res, errMsg);
  }
});

/* ─── GET /admin/otp/delivery-otp/:rideId ─────────────────────────────────── */
router.get("/otp/delivery-otp/:rideId", async (req, res) => {
  const rideId = req.params["rideId"] as string;

  try {
    const ride = await db.query.ridesTable.findFirst({
      where: eq(ridesTable.id, rideId),
      columns: {
        id: true,
        tripOtp: true,
        otpVerified: true,
        status: true,
        createdAt: true,
      },
    });

    if (!ride) {
      return sendNotFound(res, "Ride not found");
    }

    /* Derive display status */
    const TERMINAL_CANCELLED_STATUSES = ["cancelled", "refunded"];
    const OTP_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

    let otpStatus: "Used" | "Expired" | "Pending";
    if (ride.otpVerified) {
      otpStatus = "Used";
    } else if (
      TERMINAL_CANCELLED_STATUSES.includes(ride.status) ||
      Date.now() - new Date(ride.createdAt).getTime() > OTP_EXPIRY_MS
    ) {
      otpStatus = "Expired";
    } else {
      otpStatus = "Pending";
    }

    sendSuccess(res, {
      rideId: ride.id,
      otp: ride.tripOtp ?? null,
      otpStatus,
      createdAt: ride.createdAt.toISOString(),
      rideStatus: ride.status,
    });
  } catch (error) {
    sendServerError(res, error, "fetch delivery OTP");
  }
});
export default router;
