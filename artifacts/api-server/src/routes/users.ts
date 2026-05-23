import { db } from "@workspace/db";
import {
  dataExportLogsTable,
  loginHistoryTable,
  ordersTable,
  parcelBookingsTable,
  pharmacyOrdersTable,
  refreshTokensTable,
  ridesTable,
  savedAddressesTable,
  userSessionsTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { createHash, randomUUID } from "crypto";
import { and, count, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { mkdir, writeFile } from "fs/promises";
import multer from "multer";
import path from "path";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import {
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../lib/response.js";
import {
  AddRoleSchema,
  DeleteAccountSchema,
  ExportDataSchema,
  LoyaltyRedeemSchema,
  ProfileUpdateSchema,
} from "../lib/validation/schemas.js";
import { exportDataLimiter, paymentLimiter } from "../middleware/rate-limit.js";
import {
  anyUserAuth,
  customerAuth,
  getClientIp,
  writeAuthAuditLog,
} from "../middleware/security.js";
import { validateBody } from "../middleware/validate.js";
import { sendAdminAlert } from "../services/email.js";
import { getCachedSettings } from "./admin-shared.js";

const _stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

/* Magic-byte signatures used to verify the actual content of uploaded images.
   Rejects payloads where the declared Content-Type / mimeType doesn't match
   the actual bytes, preventing polyglot-file and MIME-confusion attacks. */
const AVATAR_MIME_MAGIC: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF header — WEBP
};
function detectAvatarMime(buf: Buffer): string | null {
  for (const [mime, signatures] of Object.entries(AVATAR_MIME_MAGIC)) {
    for (const sig of signatures) {
      if (sig.every((byte, i) => buf[i] === byte)) return mime;
    }
  }
  return null;
}
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AVATAR_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
  },
});

/* Simple per-user in-memory rate limiter for profile/avatar writes (10 req/min) */
const profileRateMap = new Map<string, { count: number; resetAt: number }>();
function profileRateLimit(userId: string, maxPerMin = 10): boolean {
  const now = Date.now();
  const entry = profileRateMap.get(userId);
  if (!entry || now > entry.resetAt) {
    profileRateMap.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  if (entry.count > maxPerMin) return false;
  return true;
}
const _profileRateMapCleanup = setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of profileRateMap) {
      if (entry.resetAt < now) profileRateMap.delete(key);
    }
  },
  5 * 60 * 1000
);
process.on("exit", () => clearInterval(_profileRateMapCleanup));

const router: IRouter = Router();

/* /profile and /add-role are role-agnostic — any valid authenticated user can access them.
 *
 * Optional ?appRole=rider|vendor query parameter:
 *   When present, the endpoint validates that the authenticated user holds that role.
 *   Returns 403 { code: "WRONG_ROLE" } when the check fails.
 *   Client apps can use this as a server-side gate to confirm the token belongs to
 *   the correct app before navigating to the dashboard — client-side role checks are
 *   then a secondary UX guard only. */
router.get("/profile", anyUserAuth, async (req, res, next) => {
  try {
    const userId = req.customerId!;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    /* Role gate: enforce server-side when caller supplies ?appRole= */
    const appRole = typeof req.query["appRole"] === "string" ? req.query["appRole"] : null;
    if (appRole === "rider" || appRole === "vendor") {
      const userRoles = (user.roles ?? "customer")
        .split(",")
        .map((r: string) => r.trim())
        .filter(Boolean);
      if (!userRoles.includes(appRole)) {
        res.status(403).json({
          success: false,
          code: "WRONG_ROLE",
          error: `This token does not have the '${appRole}' role. Please log in with the correct account.`,
        });
        return;
      }
    }

    sendSuccess(res, {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      username: user.username ?? null,
      role: user.roles ?? "customer",
      roles: user.roles ?? "customer",
      avatar: user.avatar,
      walletBalance: parseFloat(user.walletBalance ?? "0"),
      isActive: user.isActive,
      cnic: user.cnic ?? null,
      city: user.city ?? null,
      area: user.area ?? null,
      address: user.address ?? null,
      latitude: user.latitude ?? null,
      longitude: user.longitude ?? null,
      accountLevel: user.accountLevel ?? "bronze",
      kycStatus: user.kycStatus ?? "none",
      totpEnabled: user.totpEnabled ?? false,
      hasPassword: !!user.passwordHash,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/* POST /users/add-role
   Lets an authenticated user (any role) add "customer" to their roles field.
   Idempotent — if they already have the role, returns success immediately. */
router.post("/add-role", anyUserAuth, validateBody(AddRoleSchema), async (req, res, next) => {
  try {
    const userId = req.customerId!;
    const { role } = req.body;

    if (role !== "customer") {
      sendValidationError(res, "Only the 'customer' role can be self-assigned via this endpoint.");
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    const existingRoles = (user.roles ?? "customer")
      .split(",")
      .map((r: string) => r.trim())
      .filter(Boolean);
    if (existingRoles.includes("customer")) {
      sendSuccess(
        res,
        {
          role: user.roles,
          roles: user.roles ?? "customer",
        },
        "Customer role already active on this account."
      );
      return;
    }

    const newRoles = [...existingRoles, "customer"].join(",");
    await db
      .update(usersTable)
      .set({ roles: newRoles, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    const ip = getClientIp(req);
    void writeAuthAuditLog("role_added_customer", {
      userId,
      ip,
      userAgent: req.headers["user-agent"] as string,
      metadata: { previousRoles: user.roles, newRoles },
    });

    sendSuccess(
      res,
      {
        role: user.roles,
        roles: newRoles,
      },
      "Customer access added to your account successfully."
    );
  } catch (err) {
    next(err);
  }
});

router.use(customerAuth);

router.get("/:id/debt", async (req, res, next) => {
  try {
    const userId = req.customerId!;
    if ((req.params["id"] as string) !== userId) {
      sendForbidden(res, "Access denied");
      return;
    }
    const [user] = await db
      .select({ cancellationDebt: usersTable.cancellationDebt })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }
    sendSuccess(res, { debtBalance: parseFloat(user.cancellationDebt ?? "0") });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/export-data",
  exportDataLimiter,
  validateBody(ExportDataSchema),
  async (req, res, next) => {
    try {
      const userId = req.customerId!;
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) {
        sendNotFound(res, "User not found");
        return;
      }

      const ip = getClientIp(req);
      const userAgent = req.headers["user-agent"] as string | undefined;

      const maskedPhone = user.phone
        ? user.phone.replace(/(\+?\d{1,4})\d+(\d{2})$/, "$1****$2")
        : null;

      const logId = generateId();
      const requestedAt = new Date();

      db.insert(dataExportLogsTable)
        .values({
          id: logId,
          userId,
          ip,
          userAgent: userAgent ?? null,
          requestedAt,
          success: false,
          maskedPhone,
        })
        .catch((e: Error) =>
          logger.warn({ err: e.message }, "[data-export] Failed to insert export log")
        );

      let orders: (typeof ordersTable.$inferSelect)[];
      let rides: (typeof ridesTable.$inferSelect)[];
      let walletHistory: (typeof walletTransactionsTable.$inferSelect)[];
      let addresses: (typeof savedAddressesTable.$inferSelect)[];
      let pharmacyOrders: (typeof pharmacyOrdersTable.$inferSelect)[];
      let parcelBookings: (typeof parcelBookingsTable.$inferSelect)[];
      try {
        [orders, rides, walletHistory, addresses, pharmacyOrders, parcelBookings] =
          await Promise.all([
            db
              .select()
              .from(ordersTable)
              .where(eq(ordersTable.userId, userId))
              .orderBy(desc(ordersTable.createdAt)),
            db
              .select()
              .from(ridesTable)
              .where(eq(ridesTable.userId, userId))
              .orderBy(desc(ridesTable.createdAt)),
            db
              .select()
              .from(walletTransactionsTable)
              .where(eq(walletTransactionsTable.userId, userId))
              .orderBy(desc(walletTransactionsTable.createdAt)),
            db.select().from(savedAddressesTable).where(eq(savedAddressesTable.userId, userId)),
            db
              .select()
              .from(pharmacyOrdersTable)
              .where(eq(pharmacyOrdersTable.userId, userId))
              .orderBy(desc(pharmacyOrdersTable.createdAt)),
            db
              .select()
              .from(parcelBookingsTable)
              .where(eq(parcelBookingsTable.userId, userId))
              .orderBy(desc(parcelBookingsTable.createdAt)),
          ]);
      } catch (err) {
        next(err);
        return;
      }

      const exportData = {
        exportedAt: requestedAt.toISOString(),
        profile: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          email: user.email,
          city: user.city,
          address: user.address,
          cnic: user.cnic
            ? ((): string => {
                /* Strip hyphens/spaces so masking works for both "1234512345671"
                   and "12345-1234567-1" storage formats.  Only the first 5 and
                   last 1 digit are revealed; the middle 7 are replaced by "*". */
                const digits = (user.cnic as string).replace(/\D/g, "");
                if (digits.length !== 13) {
                  const raw = user.cnic as string;
                  return `${raw[0]}${"*".repeat(Math.max(0, raw.length - 2))}${raw[raw.length - 1]}`;
                }
                return `${digits.slice(0, 5)}${"*".repeat(7)}${digits.slice(12)}`;
              })()
            : null,
          walletBalance: parseFloat(user.walletBalance ?? "0"),
          createdAt: user.createdAt.toISOString(),
        },
        orders: orders.map((o) => ({
          id: o.id,
          type: o.type,
          status: o.status,
          total: parseFloat(o.total),
          paymentMethod: o.paymentMethod,
          deliveryAddress: o.deliveryAddress,
          items: o.items,
          createdAt: o.createdAt.toISOString(),
        })),
        rides: rides.map((r) => ({
          id: r.id,
          type: r.type,
          status: r.status,
          pickupAddress: r.pickupAddress,
          dropoffAddress: r.dropAddress,
          fare: parseFloat(r.fare),
          paymentMethod: r.paymentMethod,
          createdAt: r.createdAt.toISOString(),
        })),
        pharmacyOrders: pharmacyOrders.map((o) => ({
          id: o.id,
          status: o.status,
          total: parseFloat(o.total ?? "0"),
          items: o.items,
          prescriptionNote: o.prescriptionNote,
          createdAt: o.createdAt.toISOString(),
        })),
        parcelBookings: parcelBookings.map((b) => ({
          id: b.id,
          status: b.status,
          parcelType: b.parcelType,
          pickupAddress: b.pickupAddress,
          dropAddress: b.dropAddress,
          fare: parseFloat(b.fare ?? "0"),
          createdAt: b.createdAt.toISOString(),
        })),
        walletHistory: walletHistory.map((t) => ({
          id: t.id,
          type: t.type,
          amount: parseFloat(t.amount),
          description: t.description,
          createdAt: t.createdAt.toISOString(),
        })),
        addresses: addresses.map((a) => ({
          id: a.id,
          label: a.label,
          address: a.address,
          city: a.city,
          isDefault: a.isDefault,
        })),
      };

      const completedAt = new Date();

      void writeAuthAuditLog("data_export", { userId, ip, userAgent, metadata: { maskedPhone } });

      db.update(dataExportLogsTable)
        .set({ success: true, completedAt })
        .where(eq(dataExportLogsTable.id, logId))
        .catch((e: Error) =>
          logger.warn({ err: e.message }, "[data-export] Failed to update export log")
        );

      getCachedSettings()
        .then((settings) => {
          const appName = settings["app_name"] ?? "AJKMart";
          const adminUrl = (settings["admin_base_url"] ?? settings["app_base_url"] ?? "").replace(
            /\/$/,
            ""
          );
          const dashLink = adminUrl ? `${adminUrl}/admin/security` : "";
          const subject = `Data Export Request — User ${userId.slice(-8).toUpperCase()}`;
          const htmlBody = `
      <h3 style="color:#1e40af;margin:0 0 12px;">📦 GDPR Data Export Triggered</h3>
      <p style="color:#374151;margin:0 0 16px;">A user has exported their personal data from ${appName}.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="padding:6px 0;color:#6b7280;width:140px;">User ID</td>
            <td style="padding:6px 0;font-family:monospace;font-size:12px;">${userId}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Phone</td>
            <td style="padding:6px 0;font-family:monospace;">${maskedPhone ?? "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">IP Address</td>
            <td style="padding:6px 0;font-family:monospace;">${ip}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Timestamp</td>
            <td style="padding:6px 0;">${completedAt.toUTCString()}</td></tr>
      </table>
      ${
        dashLink
          ? `<p><a href="${dashLink}" style="background:#1e40af;color:#fff;padding:10px 18px;
         border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;">
        View Data Exports →</a></p>`
          : ""
      }
    `;
          sendAdminAlert("data_export", subject, htmlBody, settings).catch((e: Error) =>
            logger.warn({ err: e.message }, "[data-export] Email alert failed")
          );
          const slackWebhook = settings["health_alert_slack_webhook"]?.trim() ?? "";
          if (slackWebhook) {
            fetch(slackWebhook, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: `📦 ${appName} — GDPR data export by user ${userId.slice(-8).toUpperCase()} (phone: ${maskedPhone ?? "—"}, IP: ${ip})`,
              }),
            }).catch((e: Error) =>
              logger.warn({ err: e.message }, "[data-export] Slack alert failed")
            );
          }
        })
        .catch((e: Error) =>
          logger.warn({ err: e.message }, "[data-export] Settings fetch failed")
        );

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="ajkmart-data-export-${userId.slice(-8)}.json"`
      );
      res.json(exportData);
    } catch (err) {
      next(err);
    }
  }
);

async function saveAvatarBuffer(userId: string, buffer: Buffer, mime: string) {
  try {
    const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
    const uniqueName = `avatar_${userId.slice(-8)}_${randomUUID().slice(0, 8)}${ext}`;
    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(path.join(UPLOADS_DIR, uniqueName), buffer);
    const avatarUrl = `/api/uploads/${uniqueName}`;
    await db
      .update(usersTable)
      .set({ avatar: avatarUrl, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    return avatarUrl;
  } catch (err) {
    logger.warn(
      { userId, err: err instanceof Error ? err.message : String(err) },
      "[users] saveAvatarBuffer failed"
    );
    throw err;
  }
}

router.post(
  "/avatar",
  (req, res, next) => {
    (avatarUpload.single("avatar") as unknown as import("express").RequestHandler)(
      req,
      res,
      (err: unknown) => {
        if (err) {
          sendValidationError(
            res,
            err instanceof multer.MulterError
              ? err.code === "LIMIT_FILE_SIZE"
                ? `File too large. Maximum ${MAX_AVATAR_SIZE / 1024 / 1024}MB allowed`
                : err.message
              : (err as Error).message || "File upload error"
          );
          return;
        }
        next();
      }
    );
  },
  async (req, res, next) => {
    const userId = req.customerId!;

    /* Rate limit: max 10 avatar uploads per minute per user */
    if (!profileRateLimit(userId, 10)) {
      sendError(res, "Too many requests. Please wait a moment before uploading again.");
      return;
    }

    try {
      let buffer: Buffer;
      let mime: string;

      if (req.file) {
        buffer = req.file.buffer;
        mime = req.file.mimetype;
        /* Magic-byte verification for multipart uploads */
        const actualMime = detectAvatarMime(buffer);
        if (!actualMime) {
          sendValidationError(res, "File appears corrupted or is not a valid image");
          return;
        }
        if (!ALLOWED_AVATAR_TYPES.includes(actualMime)) {
          sendValidationError(res, "Only JPEG, PNG, and WebP images are allowed");
          return;
        }
        mime = actualMime;
      } else {
        const { file, mimeType } = req.body;
        if (!file) {
          sendValidationError(res, "No image data provided");
          return;
        }
        const claimedMime = (mimeType as string | undefined) || "image/jpeg";
        if (!ALLOWED_AVATAR_TYPES.includes(claimedMime)) {
          sendValidationError(res, "Only JPEG, PNG, and WebP images are allowed");
          return;
        }
        const base64Data = (file as string).replace(/^data:image\/\w+;base64,/, "");
        buffer = Buffer.from(base64Data, "base64");
        if (buffer.length > MAX_AVATAR_SIZE) {
          sendValidationError(res, "File too large. Maximum 5MB allowed");
          return;
        }
        /* Magic-byte verification — reject if actual bytes don't match declared type */
        const actualMime = detectAvatarMime(buffer);
        if (!actualMime) {
          sendValidationError(res, "File appears corrupted or is not a valid image");
          return;
        }
        if (actualMime !== claimedMime && !(actualMime === "image/jpeg" && claimedMime === "image/jpg")) {
          sendValidationError(res, "Image content does not match its declared type");
          return;
        }
        mime = claimedMime;
      }

      const avatarUrl = await saveAvatarBuffer(userId, buffer, mime);
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) {
        sendNotFound(res, "User not found");
        return;
      }
      sendSuccess(res, {
        avatarUrl,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          email: user.email,
          role: user.roles,
          avatar: user.avatar,
          walletBalance: parseFloat(user.walletBalance ?? "0"),
        },
      });
    } catch (e: unknown) {
      next(e);
    }
  }
);

router.put("/profile", validateBody(ProfileUpdateSchema), async (req, res, next) => {
  try {
    const userId = req.customerId!;

    /* Rate limit: max 10 profile updates per minute per user */
    if (!profileRateLimit(userId, 10)) {
      sendError(res, "Too many requests. Please wait before updating your profile again.");
      return;
    }

    const { name, email, cnic, city, address } = req.body;

    const [current] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!current) {
      sendNotFound(res, "User not found");
      return;
    }

    if (email && email.trim() && email.trim() !== current.email) {
      const [emailTaken] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.email, email.trim()), ne(usersTable.id, userId)))
        .limit(1);
      if (emailTaken) {
        sendValidationError(res, "This email address is already registered to another account.");
        return;
      }
    }

    const cnicClean = cnic ? cnic.replace(/[-\s]/g, "").trim() : undefined;
    if (cnicClean && cnicClean !== (current.cnic ?? "")) {
      const [cnicTaken] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.cnic, cnicClean), ne(usersTable.id, userId)))
        .limit(1);
      if (cnicTaken) {
        sendValidationError(res, "This CNIC is already registered to another account.");
        return;
      }
    }

    const fieldUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) fieldUpdates.name = name.trim();
    if (email !== undefined) fieldUpdates.email = email.trim();
    if (cnic !== undefined) fieldUpdates.cnic = cnic.replace(/[-\s]/g, "").trim();
    if (city !== undefined) fieldUpdates.city = city.trim();
    if (address !== undefined) fieldUpdates.address = address.trim();

    /* Wrap the account-level computation + write in a transaction with a
     SELECT FOR UPDATE lock so concurrent profile updates don't race on
     the accountLevel field — one request at a time holds the row lock. */
    let user: typeof current | undefined;
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .for("update")
        .limit(1);
      if (!locked) return;

      const hasName = fieldUpdates.name ?? locked.name;
      const hasEmail = fieldUpdates.email ?? locked.email;
      const hasAddress = fieldUpdates.address ?? locked.address;
      const hasCity = fieldUpdates.city ?? locked.city;
      const hasCnic = fieldUpdates.cnic ?? locked.cnic;
      const hasPassword = locked.passwordHash;
      const filledCount = [hasName, hasEmail, hasAddress, hasCity, hasCnic, hasPassword].filter(
        Boolean
      ).length;
      let newLevel = "bronze";
      if (filledCount >= 5 && hasCnic) newLevel = "gold";
      else if (filledCount >= 3) newLevel = "silver";
      fieldUpdates.accountLevel = newLevel;

      const [updated] = await tx
        .update(usersTable)
        .set(fieldUpdates)
        .where(eq(usersTable.id, userId))
        .returning();
      user = updated;
    });
    if (!user) {
      const [refetched] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      user = refetched;
    }
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }
    sendSuccess(
      res,
      {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.roles,
        avatar: user.avatar,
        walletBalance: parseFloat(user.walletBalance ?? "0"),
        cnic: user.cnic,
        city: user.city,
        area: user.area,
        address: user.address,
        accountLevel: user.accountLevel,
        kycStatus: user.kycStatus,
        createdAt: user.createdAt.toISOString(),
      },
      "پروفائل کامیابی سے اپ ڈیٹ ہو گیا۔"
    );
  } catch (err) {
    next(err);
  }
});

router.delete("/delete-account", validateBody(DeleteAccountSchema), async (req, res, _next) => {
  const userId = req.customerId!;

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      sendNotFound(res, "User not found");
      return;
    }

    const activeOrders = await db
      .select({ c: count() })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.userId, userId),
          sql`${ordersTable.status} NOT IN ('delivered', 'cancelled', 'completed')`,
          isNull(ordersTable.deletedAt)
        )
      );

    if (activeOrders[0] && activeOrders[0].c > 0) {
      sendValidationError(
        res,
        "Cannot delete account with active orders. Please wait for all orders to complete."
      );
      return;
    }

    const activeRides = await db
      .select({ c: count() })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.userId, userId),
          sql`${ridesTable.status} NOT IN ('completed', 'cancelled')`
        )
      );

    if (activeRides[0] && activeRides[0].c > 0) {
      sendValidationError(
        res,
        "Cannot delete account with active rides. Please wait for all rides to complete."
      );
      return;
    }

    const pendingWithdrawals = await db
      .select({
        c: count(),
        total: sql<string>`COALESCE(SUM(${walletTransactionsTable.amount}), 0)`,
      })
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, userId),
          eq(walletTransactionsTable.type, "withdrawal"),
          eq(walletTransactionsTable.reference, "pending")
        )
      );

    if (pendingWithdrawals[0] && pendingWithdrawals[0].c > 0) {
      const pendingTotal = parseFloat(pendingWithdrawals[0].total || "0");
      sendValidationError(
        res,
        `You have ${pendingWithdrawals[0].c} pending withdrawal(s) totalling Rs. ${pendingTotal.toLocaleString()}. These will be lost if you delete your account. Please wait for them to process or cancel them first.`
      );
      return;
    }

    const now = new Date();
    /* Scramble phone in a format that is NOT classified as banned — prefix with GDEL_
       so the original phone number is free for re-registration */
    const scrambledPhone = `GDEL_${userId.slice(-8)}_${Date.now()}`;
    await db
      .update(usersTable)
      .set({
        isActive: false,
        isBanned: false /* don't ban — the original phone is free to re-register */,
        name: "Deleted User",
        phone: scrambledPhone,
        email: null,
        username: null,
        avatar: null,
        cnic: null,
        address: null,
        area: null,
        city: null,
        latitude: null,
        longitude: null,
        totpSecret: null,
        totpEnabled: false,
        backupCodes: null,
        trustedDevices: null,
        passwordHash: null,
        tokenVersion: sql`${usersTable.tokenVersion} + 1` /* invalidate all access tokens immediately */,
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(usersTable.id, userId));

    await db
      .update(refreshTokensTable)
      .set({ revokedAt: now })
      .where(eq(refreshTokensTable.userId, userId));

    await db
      .update(userSessionsTable)
      .set({ revokedAt: now })
      .where(eq(userSessionsTable.userId, userId));

    /* Anonymise linked PII tables so the account is fully GDPR-clean */
    await db.delete(loginHistoryTable).where(eq(loginHistoryTable.userId, userId));
    await db.delete(dataExportLogsTable).where(eq(dataExportLogsTable.userId, userId));

    const ip = getClientIp(req);
    void writeAuthAuditLog("account_deleted", {
      userId,
      ip,
      userAgent: req.headers["user-agent"] as string,
    });

    sendSuccess(res, null, "اکاؤنٹ حذف ہو گیا اور تمام ڈیٹا گمنام ہو گیا۔");
  } catch (e: unknown) {
    sendError(res, (e as Error).message || "Could not delete account");
  }
});

router.get("/sessions", async (req, res, next) => {
  try {
    const userId = req.customerId!;
    const sessions = await db
      .select()
      .from(userSessionsTable)
      .where(and(eq(userSessionsTable.userId, userId), isNull(userSessionsTable.revokedAt)))
      .orderBy(desc(userSessionsTable.lastActiveAt));

    const authHeader = req.headers["authorization"] as string | undefined;
    const currentToken = authHeader?.replace(/^Bearer\s+/i, "") ?? "";
    const currentTokenHash = currentToken
      ? createHash("sha256").update(currentToken).digest("hex")
      : "";

    sendSuccess(res, {
      sessions: sessions.map((s) => ({
        id: s.id,
        deviceName: s.deviceName,
        browser: s.browser,
        os: s.os,
        ip: s.ip,
        location: s.location,
        lastActiveAt: s.lastActiveAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        isCurrent: s.tokenHash === currentTokenHash,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/sessions/all", async (req, res, next) => {
  try {
    const userId = req.customerId!;
    const authHeader = req.headers["authorization"] as string | undefined;
    const currentToken = authHeader?.replace(/^Bearer\s+/i, "") ?? "";
    const currentTokenHash = currentToken
      ? createHash("sha256").update(currentToken).digest("hex")
      : "";

    /* Revoke all other sessions except the current one (by tokenHash) */
    const revokedSessions = await db
      .update(userSessionsTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(userSessionsTable.userId, userId),
          isNull(userSessionsTable.revokedAt),
          sql`${userSessionsTable.tokenHash} != ${currentTokenHash}`
        )
      )
      .returning({ refreshTokenId: userSessionsTable.refreshTokenId });

    /* Find the refresh token id linked to the CURRENT session so we can exclude it */
    const [currentSession] = await db
      .select({ refreshTokenId: userSessionsTable.refreshTokenId })
      .from(userSessionsTable)
      .where(
        and(
          eq(userSessionsTable.userId, userId),
          sql`${userSessionsTable.tokenHash} = ${currentTokenHash}`
        )
      )
      .limit(1);

    const currentRefreshTokenId = currentSession?.refreshTokenId ?? null;

    /* Revoke refresh tokens that belong to the revoked sessions only — skip the current session's token */
    const revokedRefreshIds = revokedSessions
      .map((s) => s.refreshTokenId)
      .filter((id): id is string => id != null && id !== currentRefreshTokenId);

    if (revokedRefreshIds.length > 0) {
      await db
        .update(refreshTokensTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokensTable.userId, userId),
            isNull(refreshTokensTable.revokedAt),
            sql`${refreshTokensTable.id} = ANY(ARRAY[${sql.join(
              revokedRefreshIds.map((id) => sql`${id}`),
              sql`, `
            )}])`
          )
        );
    }

    const ip = getClientIp(req);
    void writeAuthAuditLog("sessions_revoked_all", {
      userId,
      ip,
      userAgent: req.headers["user-agent"] as string,
    });

    sendSuccess(res, null, "تمام دیگر سیشنز سے سائن آؤٹ ہو گیا۔");
  } catch (err) {
    next(err);
  }
});

router.delete("/sessions/:sessionId", async (req, res, next) => {
  try {
    const userId = req.customerId!;
    const sessionId = req.params["sessionId"] as string;

    const [session] = await db
      .select()
      .from(userSessionsTable)
      .where(and(eq(userSessionsTable.id, sessionId), eq(userSessionsTable.userId, userId)))
      .limit(1);

    if (!session) {
      sendNotFound(res, "Session not found");
      return;
    }

    if (session.revokedAt) {
      sendValidationError(res, "Session already revoked");
      return;
    }

    await db
      .update(userSessionsTable)
      .set({ revokedAt: new Date() })
      .where(eq(userSessionsTable.id, sessionId));

    if (session.refreshTokenId) {
      await db
        .update(refreshTokensTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokensTable.id, session.refreshTokenId),
            eq(refreshTokensTable.userId, userId),
            isNull(refreshTokensTable.revokedAt)
          )
        );
    }

    const ip = getClientIp(req);
    void writeAuthAuditLog("session_revoked", {
      userId,
      ip,
      userAgent: req.headers["user-agent"] as string,
      metadata: { sessionId },
    });

    sendSuccess(res, null, "سیشن منسوخ ہو گیا۔");
  } catch (err) {
    next(err);
  }
});

router.get("/login-history", async (req, res, next) => {
  try {
    const userId = req.customerId!;
    const history = await db
      .select()
      .from(loginHistoryTable)
      .where(eq(loginHistoryTable.userId, userId))
      .orderBy(desc(loginHistoryTable.createdAt))
      .limit(20);

    sendSuccess(res, {
      history: history.map((h) => ({
        id: h.id,
        ip: h.ip,
        deviceName: h.deviceName,
        browser: h.browser,
        os: h.os,
        location: h.location,
        success: h.success,
        method: h.method,
        createdAt: h.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

type DbOrTx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;
async function computeLoyaltyPoints(
  tx: DbOrTx,
  userId: string
): Promise<{ totalEarned: number; totalRedeemed: number; available: number }> {
  const rows = await tx
    .select({
      amount: walletTransactionsTable.amount,
      type: walletTransactionsTable.type,
      reference: walletTransactionsTable.reference,
    })
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, userId));

  let totalEarned = 0;
  let totalRedeemed = 0;
  for (const r of rows) {
    const amt = parseFloat(r.amount ?? "0");
    if (r.reference === "admin_loyalty_debit") {
      totalRedeemed += amt;
    } else if (r.type === "loyalty") {
      totalEarned += amt;
    } else if (
      r.type === "credit" &&
      typeof r.reference === "string" &&
      r.reference.startsWith("loyalty_redeem_")
    ) {
      totalRedeemed += amt;
    }
  }
  const available = Math.max(0, Math.floor(totalEarned) - Math.floor(totalRedeemed));
  return {
    totalEarned: Math.floor(totalEarned),
    totalRedeemed: Math.floor(totalRedeemed),
    available,
  };
}

router.get("/loyalty/balance", async (req, res, next) => {
  try {
    const userId = req.customerId!;

    const s = await getCachedSettings();
    const loyaltyEnabled = (s["customer_loyalty_enabled"] ?? "on") === "on";

    const { totalEarned, totalRedeemed, available } = await computeLoyaltyPoints(db, userId);

    const [user] = await db
      .select({ walletBalance: usersTable.walletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    sendSuccess(res, {
      loyaltyEnabled,
      totalEarned,
      totalRedeemed,
      available,
      walletBalance: parseFloat(user?.walletBalance ?? "0"),
    });
  } catch (err) {
    next(err);
  }
});

/* ── GET /users/me/loyalty — loyalty points balance + transaction history ─── */
router.get("/me/loyalty", customerAuth, async (req, res, next) => {
  try {
    const userId = req.customerId!;

    const s = await getCachedSettings();
    const loyaltyEnabled = (s["customer_loyalty_enabled"] ?? "on") === "on";

    /* Use the same computeLoyaltyPoints helper as /loyalty/balance so both
     endpoints always return identical totals. */
    const {
      totalEarned,
      totalRedeemed,
      available: pointsBalance,
    } = await computeLoyaltyPoints(db, userId);

    /* Fetch history rows separately (loyalty transactions only) for the timeline */
    const txns = await db
      .select({
        id: walletTransactionsTable.id,
        type: walletTransactionsTable.type,
        amount: walletTransactionsTable.amount,
        description: walletTransactionsTable.description,
        reference: walletTransactionsTable.reference,
        createdAt: walletTransactionsTable.createdAt,
      })
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, userId),
          or(
            eq(walletTransactionsTable.type, "loyalty"),
            sql`${walletTransactionsTable.reference} LIKE 'loyalty_redeem_%'`
          )
        )
      )
      .orderBy(desc(walletTransactionsTable.createdAt));

    sendSuccess(res, {
      loyaltyEnabled,
      pointsBalance,
      totalEarned,
      totalRedeemed,
      transactions: txns.map((t) => ({
        id: t.id,
        type: t.type,
        amount: parseFloat(t.amount ?? "0"),
        description: t.description,
        reference: t.reference ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/loyalty/redeem",
  paymentLimiter,
  validateBody(LoyaltyRedeemSchema),
  async (req, res, next) => {
    const userId = req.customerId!;

    const s = await getCachedSettings();
    const loyaltyEnabled = (s["customer_loyalty_enabled"] ?? "on") === "on";
    if (!loyaltyEnabled) {
      sendError(res, "Loyalty program is not currently active", 403);
      return;
    }

    const MIN_REDEEM = 10;

    let newBalance: number;
    let redeemAmount: number;

    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);

        const { available } = await computeLoyaltyPoints(tx, userId);

        if (available < MIN_REDEEM) {
          throw Object.assign(new Error("insufficient"), { code: "INSUFFICIENT", available });
        }

        redeemAmount = available;

        const [upd] = await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance + ${redeemAmount}`, updatedAt: new Date() })
          .where(eq(usersTable.id, userId))
          .returning({ walletBalance: usersTable.walletBalance });

        if (!upd) throw new Error("User not found");

        await tx.insert(walletTransactionsTable).values({
          id: randomUUID(),
          userId,
          type: "credit",
          amount: redeemAmount.toFixed(2),
          description: `Loyalty points redeemed — ${redeemAmount} pts converted to wallet credit`,
          reference: `loyalty_redeem_${Date.now()}`,
        });

        newBalance = parseFloat(upd.walletBalance ?? "0");
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "INSUFFICIENT") {
        sendError(
          res,
          `You need at least ${MIN_REDEEM} loyalty points to redeem. You have ${(err as { code?: string; available?: number }).available} available.`,
          400
        );
        return;
      }
      next(err);
      return;
    }

    sendSuccess(
      res,
      {
        redeemed: redeemAmount!,
        newBalance: newBalance!,
      },
      `${redeemAmount!} loyalty points redeemed — Rs. ${redeemAmount!} added to your wallet!`
    );
  }
);

export default router;
