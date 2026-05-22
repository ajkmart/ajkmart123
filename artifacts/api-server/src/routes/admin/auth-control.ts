import { db } from "@workspace/db";
import {
  authEventsTable,
  otpAttemptsTable,
  platformSettingsTable,
  refreshTokensTable,
  usersTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { Router } from "express";
import { logger } from "../../lib/logger.js";
import { sendError, sendSuccess, sendValidationError } from "../../lib/response.js";
import { getIO } from "../../lib/socketio.js";
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

const ALLOWED_METHODS = [
  "auth_phone_otp_enabled",
  "auth_email_otp_enabled",
  "auth_username_password_enabled",
  "auth_google_enabled",
  "auth_facebook_enabled",
  "auth_magic_link_enabled",
  "auth_biometric_enabled",
] as const;

type AllowedMethod = (typeof ALLOWED_METHODS)[number];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ROLE_KEYS = ["customer", "rider", "vendor"] as const;
type Role = (typeof ROLE_KEYS)[number];

function parseRoleMap(raw: string | null | undefined): Record<Role, boolean> {
  const fallback = { customer: false, rider: false, vendor: false };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<Role, string>>;
    return {
      customer: parsed.customer === "on",
      rider: parsed.rider === "on",
      vendor: parsed.vendor === "on",
    };
  } catch {
    const on = raw === "on";
    return { customer: on, rider: on, vendor: on };
  }
}

function serialiseRoleMap(value: Record<Role, boolean>): string {
  return JSON.stringify({
    customer: value.customer ? "on" : "off",
    rider: value.rider ? "on" : "off",
    vendor: value.vendor ? "on" : "off",
  });
}

function mapRowsToMethods(rows: Array<{ key: string; value: string }>) {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const methods: Record<string, Record<Role, boolean>> = {};
  for (const method of ALLOWED_METHODS) {
    methods[method] = parseRoleMap(map.get(method));
  }
  methods.auth_totp_enabled = { customer: true, rider: true, vendor: true };
  return methods;
}

router.get("/auth/methods", adminAuth, async (_req, res, next) => {
  try {
    const rows = await db
      .select({ key: platformSettingsTable.key, value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(or(...ALLOWED_METHODS.map((m) => eq(platformSettingsTable.key, m))));
    sendSuccess(res, { methods: mapRowsToMethods(rows) });
  } catch (err) {
    next(err);
  }
});

router.patch("/auth/methods", adminAuth, async (req, res, next) => {
  try {
    const body = req.body as {
      method?: string;
      role?: string;
      enabled?: boolean;
      settings?: Array<{ key: string; value: string }>;
    };
    const updates: Array<{ key: string; value: string }> = [];

    if (Array.isArray(body.settings)) {
      for (const item of body.settings) {
        if (!ALLOWED_METHODS.includes(item.key as AllowedMethod)) {
          sendValidationError(res, `Invalid auth method: ${item.key}`);
          return;
        }
        updates.push({ key: item.key, value: String(item.value) });
      }
    } else {
      const method = body.method as string | undefined;
      const role = body.role as Role | undefined;
      const enabled = body.enabled;
      if (!method || !role || typeof enabled !== "boolean") {
        sendValidationError(res, "method, role, enabled are required");
        return;
      }
      if (!ALLOWED_METHODS.includes(method as AllowedMethod)) {
        sendValidationError(res, `Invalid auth method: ${method}`);
        return;
      }
      const rows = await db
        .select({ key: platformSettingsTable.key, value: platformSettingsTable.value })
        .from(platformSettingsTable)
        .where(eq(platformSettingsTable.key, method));
      const current = parseRoleMap(rows[0]?.value);
      current[role] = enabled;
      updates.push({ key: method, value: serialiseRoleMap(current) });
    }

    if (updates.length === 0) {
      sendValidationError(res, "No updates provided");
      return;
    }

    await db
      .insert(platformSettingsTable)
      .values(
        updates.map((item) => ({
          key: item.key,
          value: item.value,
          label: item.key,
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
      details: `Updated ${updates.map((u) => u.key).join(", ")}`,
      result: "success",
    });

    try {
      getIO()?.emit("platform-config:updated", { scope: "auth", keys: updates.map((u) => u.key) });
    } catch (err) {
      logger.warn({ err }, "[admin/auth-control] failed to emit platform-config:updated");
    }

    sendSuccess(res, { success: true, updated: updates.length });
  } catch (err) {
    next(err);
  }
});

router.get("/auth/events", adminAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10) || 50)
    );
    const eventType = String(req.query["event_type"] ?? "").trim();
    const role = String(req.query["role"] ?? "").trim();
    const success = String(req.query["success"] ?? "").trim();
    const userId = String(req.query["userId"] ?? "").trim();
    const dateFrom = String(req.query["dateFrom"] ?? "").trim();
    const dateTo = String(req.query["dateTo"] ?? "").trim();

    const conditions: Array<ReturnType<typeof eq>> = [];
    if (eventType) conditions.push(eq(authEventsTable.eventType, eventType));
    if (role) conditions.push(eq(authEventsTable.role, role));
    if (success === "success") conditions.push(eq(authEventsTable.success, true));
    if (success === "failure") conditions.push(eq(authEventsTable.success, false));
    if (userId) conditions.push(eq(authEventsTable.userId, userId));
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!Number.isNaN(from.getTime())) conditions.push(gte(authEventsTable.createdAt, from));
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!Number.isNaN(to.getTime())) conditions.push(lte(authEventsTable.createdAt, to));
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: authEventsTable.id,
          timestamp: authEventsTable.createdAt,
          userId: authEventsTable.userId,
          user: usersTable.name,
          event_type: authEventsTable.eventType,
          channel: authEventsTable.channel,
          role: authEventsTable.role,
          success: authEventsTable.success,
          ip: authEventsTable.ip,
        })
        .from(authEventsTable)
        .leftJoin(usersTable, eq(authEventsTable.userId, usersTable.id))
        .where(where)
        .orderBy(desc(authEventsTable.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(authEventsTable)
        .where(where),
    ]);

    sendSuccess(res, {
      events: rows.map((row) => ({ ...row, timestamp: row.timestamp.toISOString() })),
      page,
      limit,
      total: Number(countRows[0]?.total ?? 0),
    });
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
        userId: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        email: usersTable.email,
        attempts: otpAttemptsTable.count,
        expiresAt: otpAttemptsTable.expiresAt,
      })
      .from(otpAttemptsTable)
      .leftJoin(usersTable, eq(otpAttemptsTable.key, usersTable.phone))
      .where(gte(otpAttemptsTable.count, maxAttempts))
      .orderBy(desc(otpAttemptsTable.count));
    sendSuccess(res, {
      users: rows.map((row) => ({
        ...row,
        expiresAt: row.expiresAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/auth/stats", adminAuth, async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [events, registrations, activeSessions] = await Promise.all([
      db
        .select({
          eventType: authEventsTable.eventType,
          role: authEventsTable.role,
          success: authEventsTable.success,
          channel: authEventsTable.channel,
        })
        .from(authEventsTable)
        .where(gte(authEventsTable.createdAt, since)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(gte(usersTable.createdAt, today)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(refreshTokensTable)
        .where(
          and(eq(refreshTokensTable.revoked, false), gte(refreshTokensTable.expiresAt, new Date()))
        ),
    ]);

    const byMethod: Record<string, { success: number; failure: number }> = {};
    for (const row of events) {
      const key = row.channel ?? "unknown";
      if (!byMethod[key]) byMethod[key] = { success: 0, failure: 0 };
      if (row.success) byMethod[key].success += 1;
      else byMethod[key].failure += 1;
    }

    sendSuccess(res, {
      methodStats: byMethod,
      successCount: events.filter((e) => e.success).length,
      failureCount: events.filter((e) => !e.success).length,
      newRegistrationsToday: Number(registrations[0]?.count ?? 0),
      activeSessions: Number(activeSessions[0]?.count ?? 0),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/auth/broadcast-logout", adminAuth, async (req, res, next) => {
  try {
    const body = req.body as { role?: string };
    const role = body.role?.trim();
    if (role && !["customer", "rider", "vendor"].includes(role)) {
      sendValidationError(res, "role must be customer, rider, vendor, or omitted");
      return;
    }
    if (!(req as AdminRequest).adminPermissions?.includes("system.super_admin")) {
      sendError(res, "Super-admin permission required", 403);
      return;
    }

    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(role ? eq(usersTable.roles, role) : undefined);
    if (rows.length > 0) {
      await db
        .update(usersTable)
        .set({ tokenVersion: sql`${usersTable.tokenVersion} + 1`, updatedAt: new Date() })
        .where(role ? eq(usersTable.roles, role) : undefined);
    }

    void addAuditEntry({
      action: "broadcast_logout",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: role ? `Broadcast logout for ${role}` : "Broadcast logout for all users",
      result: "success",
    });
    sendSuccess(res, { success: true, affected: rows.length });
  } catch (err) {
    next(err);
  }
});

export default router;
