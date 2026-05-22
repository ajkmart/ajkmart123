import { db } from "@workspace/db";
import {
  authEventsTable,
  otpAttemptsTable,
  platformSettingsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { Router } from "express";
import { sendSuccess, sendValidationError } from "../../lib/response.js";
import {
  addAuditEntry,
  adminAuth,
  getCachedSettings,
  getClientIp,
  invalidatePlatformSettingsCache,
  invalidateSettingsCache,
  type AdminRequest,
} from "../admin-shared.js";

const router = Router();

router.get("/auth/methods", adminAuth, async (_req, res, next) => {
  try {
    const settings = await getCachedSettings();
    const keys = [
      "auth_phone_otp_enabled",
      "auth_email_otp_enabled",
      "auth_username_password_enabled",
      "auth_google_enabled",
      "auth_facebook_enabled",
      "auth_magic_link_enabled",
      "auth_biometric_enabled",
      "auth_totp_enabled",
    ] as const;
    const methods: Record<string, Record<string, boolean>> = {};
    for (const key of keys) {
      const parsed = (() => {
        try {
          return JSON.parse(settings[key] ?? "{}") as Record<string, string>;
        } catch {
          return {
            customer: settings[key] ?? "off",
            rider: settings[key] ?? "off",
            vendor: settings[key] ?? "off",
          };
        }
      })();
      methods[key] = {
        customer: parsed.customer === "on" || settings[key] === "on",
        rider: parsed.rider === "on" || settings[key] === "on",
        vendor: parsed.vendor === "on" || settings[key] === "on",
      };
    }
    sendSuccess(res, { methods });
  } catch (err) {
    next(err);
  }
});

router.patch("/settings/auth-methods", adminAuth, async (req, res, next) => {
  try {
    const body = req.body as { settings?: Array<{ key: string; value: string }> };
    if (!Array.isArray(body.settings)) {
      sendValidationError(res, "settings array required");
      return;
    }
    await db
      .insert(platformSettingsTable)
      .values(
        body.settings.map(({ key, value }) => ({
          key,
          value: String(value),
          label: key,
          category: "auth",
          updatedAt: new Date(),
        }))
      )
      .onConflictDoUpdate({
        target: platformSettingsTable.key,
        set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` },
      });
    invalidateSettingsCache();
    invalidatePlatformSettingsCache();
    void addAuditEntry({
      action: "auth_methods_update",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Updated ${body.settings.length} auth settings`,
      result: "success",
    });
    sendSuccess(res, { success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/auth/events", adminAuth, async (req, res, next) => {
  try {
    const eventType = String(req.query["event_type"] ?? "").trim();
    const role = String(req.query["role"] ?? "").trim();
    const success = String(req.query["success"] ?? "").trim();
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10)));
    const conditions: SQL[] = [];
    if (eventType) conditions.push(eq(authEventsTable.eventType, eventType));
    if (role) conditions.push(eq(authEventsTable.role, role));
    if (success === "success") conditions.push(eq(authEventsTable.success, true));
    if (success === "failure") conditions.push(eq(authEventsTable.success, false));
    const rows = await db
      .select({
        id: authEventsTable.id,
        timestamp: authEventsTable.createdAt,
        user: usersTable.name,
        event_type: authEventsTable.eventType,
        channel: authEventsTable.channel,
        role: authEventsTable.role,
        success: authEventsTable.success,
        ip: authEventsTable.ip,
      })
      .from(authEventsTable)
      .leftJoin(usersTable, eq(authEventsTable.userId, usersTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(authEventsTable.createdAt))
      .limit(limit);
    sendSuccess(res, { events: rows.map((r) => ({ ...r, timestamp: r.timestamp.toISOString() })) });
  } catch (err) {
    next(err);
  }
});

router.get("/auth/locked-users", adminAuth, async (_req, res, next) => {
  try {
    const settings = await getCachedSettings();
    const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
    const rows = await db
      .select({
        id: usersTable.id,
        phone: usersTable.phone,
        email: usersTable.email,
        attempts: otpAttemptsTable.count,
        locked_since: otpAttemptsTable.firstAt,
      })
      .from(otpAttemptsTable)
      .leftJoin(usersTable, eq(otpAttemptsTable.key, usersTable.phone))
      .where(gte(otpAttemptsTable.count, maxAttempts))
      .orderBy(desc(otpAttemptsTable.count));
    sendSuccess(res, {
      users: rows.map((r) => ({ ...r, locked_since: r.locked_since?.toISOString() ?? null })),
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/users/:id/otp/attempts", adminAuth, async (req, res, next) => {
  try {
    const id = String(req.params["id"] ?? "");
    await db.delete(otpAttemptsTable).where(eq(otpAttemptsTable.key, id));
    sendSuccess(res, { success: true });
  } catch (err) {
    next(err);
  }
});

export { router };
