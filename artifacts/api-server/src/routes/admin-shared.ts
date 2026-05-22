import { adminActionAuditLogTable, db, notificationsTable } from "@workspace/db";
import {
  t as i18nT,
  type TranslationKey as I18nTranslationKey,
  type Language,
} from "@workspace/i18n";
import { randomBytes } from "crypto";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { generateId as _generateId } from "../lib/id.js";
import { logger as pinoLogger } from "../lib/logger.js";
import { redisClient } from "../lib/redis.js";
import {
  getCachedSettings as _getCachedSettings,
  invalidateSettingsCache as _invalidateSettingsCache,
  addSecurityEvent as _realAddSecurityEvent,
} from "../middleware/security.js";
import { verifyAccessToken } from "../utils/admin-jwt.js";

/**
 * Resolve a JWT secret from an environment variable.
 * Exits the process in production if the secret is absent or too short;
 * logs a warning and uses a padded dev fallback in development.
 */
function resolveAdminSecret(envVar: string): string {
  const val = process.env[envVar];
  if (!val || val.length < 32) {
    const msg = !val
      ? `[admin-shared] FATAL: ${envVar} is not set. A minimum 32-character secret is required.`
      : `[admin-shared] FATAL: ${envVar} is too short (${val.length} chars, need ≥32).`;
    if (process.env.NODE_ENV === "production") {
      pinoLogger.fatal(msg);
      process.exit(1);
    }
    pinoLogger.warn(
      `[admin-shared] WARNING: ${envVar} not set or too short. ` +
        `Using unsafe dev fallback — set a strong secret before deploying.`
    );
    return (val ?? "") + "dev_fallback_pad_to_32_chars_min!!";
  }
  return val;
}

/* ── Re-exports ──────────────────────────────────────────────────────────── */
export { generateId } from "../lib/id.js";
export { logger } from "../lib/logger.js";

/* ── CONSTANTS ─────────────────────────────────────────────────────────── */

export const ADMIN_TOKEN_TTL_HRS = 24;
export const ADMIN_REFRESH_TTL_DAYS = 30;
export const ADMIN_MAX_ATTEMPTS = 5;
export const ADMIN_LOCKOUT_TIME = 15;

/* ── NOTIFICATION KEYS ─────────────────────────────────────────────────── */

export interface NotifKeyEntry {
  titleKey: string;
  bodyKey: string;
  icon: string;
}

export const ORDER_NOTIF_KEYS: Record<string, NotifKeyEntry> = {
  confirmed: {
    titleKey: "notifOrderConfirmed",
    bodyKey: "notifOrderConfirmedBody",
    icon: "checkmark-circle",
  },
  preparing: {
    titleKey: "notifOrderPreparing",
    bodyKey: "notifOrderPreparingBody",
    icon: "restaurant-outline",
  },
  out_for_delivery: {
    titleKey: "notifOrderOutForDelivery",
    bodyKey: "notifOrderOutForDeliveryBody",
    icon: "bicycle-outline",
  },
  delivered: {
    titleKey: "notifOrderDelivered",
    bodyKey: "notifOrderDeliveredBody",
    icon: "checkmark-done-circle",
  },
  cancelled: {
    titleKey: "notifOrderCancelled",
    bodyKey: "notifOrderCancelledBody",
    icon: "close-circle",
  },
};

export const RIDE_NOTIF_KEYS: Record<string, NotifKeyEntry> = {
  accepted: {
    titleKey: "notifRideAccepted",
    bodyKey: "notifRideAcceptedBody",
    icon: "car-outline",
  },
  arrived: {
    titleKey: "notifRideArrived",
    bodyKey: "notifRideArrivedBody",
    icon: "location-outline",
  },
  in_transit: {
    titleKey: "notifRideInTransit",
    bodyKey: "notifRideInTransitBody",
    icon: "navigate-outline",
  },
  completed: {
    titleKey: "notifRideCompleted",
    bodyKey: "notifRideCompletedBody",
    icon: "star-outline",
  },
  cancelled: {
    titleKey: "notifRideCancelled",
    bodyKey: "notifRideCancelledBody",
    icon: "close-circle",
  },
};

export const PHARMACY_NOTIF_KEYS: Record<string, NotifKeyEntry> = {
  confirmed: {
    titleKey: "notifPharmacyOrderConfirmed",
    bodyKey: "notifPharmacyOrderConfirmedBody",
    icon: "checkmark-circle",
  },
  ready: {
    titleKey: "notifPharmacyOrderReady",
    bodyKey: "notifPharmacyOrderReadyBody",
    icon: "bag-check-outline",
  },
  out_for_delivery: {
    titleKey: "notifPharmacyOrderOutForDelivery",
    bodyKey: "notifPharmacyOrderOutForDeliveryBody",
    icon: "bicycle-outline",
  },
  delivered: {
    titleKey: "notifPharmacyOrderDelivered",
    bodyKey: "notifPharmacyOrderDeliveredBody",
    icon: "checkmark-done-circle",
  },
  cancelled: {
    titleKey: "notifPharmacyOrderCancelled",
    bodyKey: "notifPharmacyOrderCancelledBody",
    icon: "close-circle",
  },
};

export const PARCEL_NOTIF_KEYS: Record<string, NotifKeyEntry> = {
  confirmed: {
    titleKey: "notifParcelConfirmed",
    bodyKey: "notifParcelConfirmedBody",
    icon: "checkmark-circle",
  },
  picked_up: {
    titleKey: "notifParcelPickedUp",
    bodyKey: "notifParcelPickedUpBody",
    icon: "cube-outline",
  },
  in_transit: {
    titleKey: "notifParcelInTransit",
    bodyKey: "notifParcelInTransitBody",
    icon: "navigate-outline",
  },
  delivered: {
    titleKey: "notifParcelDelivered",
    bodyKey: "notifParcelDeliveredBody",
    icon: "checkmark-done-circle",
  },
  cancelled: {
    titleKey: "notifParcelCancelled",
    bodyKey: "notifParcelCancelledBody",
    icon: "close-circle",
  },
};

/* ── DEFAULT PLATFORM SETTINGS ─────────────────────────────────────────── */

export const DEFAULT_PLATFORM_SETTINGS: Array<{
  key: string;
  value: string;
  label: string;
  category: string;
}> = [
  { key: "feature_mart", value: "on", category: "features", label: "feature_mart" },
  { key: "feature_food", value: "on", category: "features", label: "feature_food" },
  { key: "feature_rides", value: "on", category: "features", label: "feature_rides" },
  { key: "feature_pharmacy", value: "on", category: "features", label: "feature_pharmacy" },
  { key: "feature_parcel", value: "on", category: "features", label: "feature_parcel" },
  { key: "feature_van", value: "on", category: "features", label: "feature_van" },
  { key: "feature_wallet", value: "on", category: "features", label: "feature_wallet" },
  { key: "feature_referral", value: "on", category: "features", label: "feature_referral" },
  { key: "feature_new_users", value: "on", category: "features", label: "feature_new_users" },
  { key: "auth_mode", value: "OTP", category: "auth", label: "auth_mode" },
  { key: "auth_otp_enabled", value: "on", category: "auth", label: "auth_otp_enabled" },
  { key: "auth_email_enabled", value: "on", category: "auth", label: "auth_email_enabled" },
  { key: "auth_google_enabled", value: "on", category: "auth", label: "auth_google_enabled" },
  { key: "auth_facebook_enabled", value: "off", category: "auth", label: "auth_facebook_enabled" },
  { key: "auth_phone_otp_enabled", value: "on", category: "auth", label: "auth_phone_otp_enabled" },
  { key: "auth_email_otp_enabled", value: "on", category: "auth", label: "auth_email_otp_enabled" },
  {
    key: "auth_username_password_enabled",
    value: "off",
    category: "auth",
    label: "auth_username_password_enabled",
  },
  {
    key: "auth_magic_link_enabled",
    value: "off",
    category: "auth",
    label: "auth_magic_link_enabled",
  },
  {
    key: "auth_magic_link_ttl_min",
    value: "30",
    category: "auth",
    label: "auth_magic_link_ttl_min",
  },
  { key: "firebase_enabled", value: "off", category: "integrations", label: "firebase_enabled" },
  {
    key: "security_lockout_enabled",
    value: "on",
    category: "security",
    label: "security_lockout_enabled",
  },
  {
    key: "security_login_max_attempts",
    value: "5",
    category: "security",
    label: "security_login_max_attempts",
  },
  {
    key: "security_lockout_minutes",
    value: "30",
    category: "security",
    label: "security_lockout_minutes",
  },
  {
    key: "security_otp_max_per_phone",
    value: "5",
    category: "security",
    label: "security_otp_max_per_phone",
  },
  {
    key: "security_otp_max_per_ip",
    value: "20",
    category: "security",
    label: "security_otp_max_per_ip",
  },
  {
    key: "security_otp_window_min",
    value: "60",
    category: "security",
    label: "security_otp_window_min",
  },
  {
    key: "security_suspicious_pattern_threshold",
    value: "60",
    category: "security",
    label: "security_suspicious_pattern_threshold",
  },
  { key: "jwt_access_ttl_sec", value: "900", category: "security", label: "jwt_access_ttl_sec" },
  { key: "jwt_refresh_ttl_days", value: "7", category: "security", label: "jwt_refresh_ttl_days" },
  { key: "platform_mode", value: "demo", category: "general", label: "platform_mode" },
  { key: "currency", value: "PKR", category: "general", label: "currency" },
  { key: "currency_symbol", value: "Rs.", category: "general", label: "currency_symbol" },
  { key: "default_language", value: "en", category: "general", label: "default_language" },
  {
    key: "health_monitor_enabled",
    value: "off",
    category: "health",
    label: "health_monitor_enabled",
  },
  { key: "loyalty_enabled", value: "off", category: "features", label: "loyalty_enabled" },
  {
    key: "loyalty_points_per_rupee",
    value: "1",
    category: "loyalty",
    label: "loyalty_points_per_rupee",
  },
  {
    key: "loyalty_redemption_rate",
    value: "0.01",
    category: "loyalty",
    label: "loyalty_redemption_rate",
  },
  { key: "wallet_min_topup", value: "100", category: "wallet", label: "wallet_min_topup" },
  { key: "wallet_max_topup", value: "25000", category: "wallet", label: "wallet_max_topup" },
  { key: "wallet_max_balance", value: "50000", category: "wallet", label: "wallet_max_balance" },
  { key: "wallet_min_send", value: "10", category: "wallet", label: "wallet_min_send" },
  { key: "wallet_max_send", value: "25000", category: "wallet", label: "wallet_max_send" },
  { key: "wallet_min_withdraw", value: "100", category: "wallet", label: "wallet_min_withdraw" },
  { key: "wallet_max_withdraw", value: "25000", category: "wallet", label: "wallet_max_withdraw" },
];

/* ── DEFAULT RIDE SERVICES ─────────────────────────────────────────────── */

export const DEFAULT_RIDE_SERVICES = [
  { id: "bike", name: "Bike", icon: "bicycle-outline", baseFare: "30", perKm: "10" },
  { id: "car", name: "Car", icon: "car-outline", baseFare: "80", perKm: "20" },
  { id: "rickshaw", name: "Rickshaw", icon: "car-sport-outline", baseFare: "50", perKm: "12" },
];

/* ── ADMIN LOGIN LOCKOUT — Redis-backed with in-memory fallback ──────── */

/** In-memory fallback used when Redis is unavailable (lost on restart). */
const _memAttempts = new Map<string, { count: number; lastAttempt: number }>();

function _memKey(ip: string) {
  return `admin:lockout:${ip}`;
}
const LOCKOUT_TTL_SEC = ADMIN_LOCKOUT_TIME * 60;

/**
 * Returns true when the IP has exceeded ADMIN_MAX_ATTEMPTS within the
 * lockout window. Uses Redis when available, falls back to in-memory.
 */
export async function checkAdminLoginLockout(ip: string): Promise<boolean> {
  if (redisClient) {
    try {
      const raw = await redisClient.get(_memKey(ip));
      if (!raw) return false;
      const count = parseInt(raw, 10);
      return count >= ADMIN_MAX_ATTEMPTS;
    } catch (err) {
      pinoLogger.warn(
        { ip, err },
        "[admin-shared] Redis lockout check failed — using memory fallback"
      );
    }
  }
  /* in-memory fallback */
  const record = _memAttempts.get(ip);
  if (!record) return false;
  if (record.count >= ADMIN_MAX_ATTEMPTS) {
    const elapsed = Date.now() - record.lastAttempt;
    if (elapsed < LOCKOUT_TTL_SEC * 1000) return true;
    _memAttempts.delete(ip);
  }
  return false;
}

/**
 * Increment the failure counter for the IP. The key is given a TTL equal
 * to the lockout window so Redis auto-expires it once the window passes.
 */
export async function recordAdminLoginFailure(ip: string): Promise<void> {
  if (redisClient) {
    try {
      const key = _memKey(ip);
      const count = await redisClient.incr(key);
      if (count === 1) {
        /* First failure — start the TTL clock */
        await redisClient.expire(key, LOCKOUT_TTL_SEC);
      }
      return;
    } catch (err) {
      pinoLogger.warn(
        { ip, err },
        "[admin-shared] Redis lockout record failed — using memory fallback"
      );
    }
  }
  /* in-memory fallback */
  const record = _memAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  record.count += 1;
  record.lastAttempt = Date.now();
  _memAttempts.set(ip, record);
}

/** Export for backward compatibility with code that checks the map directly. */
export const adminLoginAttempts = _memAttempts;

/* ── TYPE DEFINITIONS ──────────────────────────────────────────────────── */

export interface AdminPayload {
  adminId: string | null;
  role: string;
  name: string;
  permissions: string[];
}

export interface AdminRequest extends Request {
  adminId?: string;
  adminRole?: string;
  adminName?: string;
  adminPermissions?: string[];
  adminPayload?: AdminPayload;
  adminIp?: string;
}

export type TranslationKey = string;

/* ── SECURITY CORE ─────────────────────────────────────────────────────── */

// v2 system: use ADMIN_ACCESS_TOKEN_SECRET for all admin token signing/verification
const _ADMIN_ACCESS_TOKEN_SECRET = resolveAdminSecret("ADMIN_ACCESS_TOKEN_SECRET");
const _ADMIN_JWT_ISSUER = process.env.JWT_ISSUER ?? "ajkmart-admin";

const _ADMIN_REFRESH_SECRET = (() => {
  const v = process.env.ADMIN_JWT_REFRESH_SECRET || process.env.ADMIN_REFRESH_SECRET;
  if (!v || v.length < 32) {
    const key = "ADMIN_JWT_REFRESH_SECRET / ADMIN_REFRESH_SECRET";
    const msg = !v
      ? `[admin-shared] FATAL: ${key} is not set. A minimum 32-character secret is required.`
      : `[admin-shared] FATAL: ${key} is too short (${v.length} chars, need ≥32).`;
    if (process.env.NODE_ENV === "production") {
      pinoLogger.fatal(msg);
      process.exit(1);
    }
    pinoLogger.warn(
      `[admin-shared] WARNING: ${key} not set or too short. Using unsafe dev fallback.`
    );
    return (v ?? "") + "dev_fallback_pad_to_32_chars_min!!";
  }
  return v;
})();

/**
 * Sign an admin JWT using the v2 system (ADMIN_ACCESS_TOKEN_SECRET).
 * Payload uses v2 format: { sub, role, name, perms, pv }.
 * expiresInHrs is honoured for legacy callers that need custom TTLs.
 */
export function signAdminJwt(
  adminId: string | null,
  role: string,
  name: string,
  expiresInHrs: number = ADMIN_TOKEN_TTL_HRS,
  permissions: string[] = []
): string {
  return jwt.sign(
    { sub: adminId ?? "", role, name, perms: permissions, pv: 0 },
    _ADMIN_ACCESS_TOKEN_SECRET,
    { expiresIn: `${expiresInHrs}h`, issuer: _ADMIN_JWT_ISSUER, algorithm: "HS256" }
  );
}

export function signAdminRefreshToken(adminId: string | null, role: string): string {
  return jwt.sign({ adminId, role }, _ADMIN_REFRESH_SECRET, {
    expiresIn: `${ADMIN_REFRESH_TTL_DAYS}d`,
  });
}

/**
 * Verify an admin JWT using the v2 system (ADMIN_ACCESS_TOKEN_SECRET).
 * Maps v2 payload fields (sub → adminId, perms → permissions) back to AdminPayload.
 */
export function verifyAdminJwt(token: string): AdminPayload | null {
  try {
    const payload = verifyAccessToken(token);
    return {
      adminId: payload.sub ?? null,
      role: payload.role ?? "admin",
      name: payload.name ?? "Admin",
      permissions: payload.perms ?? [],
    };
  } catch (err) {
    pinoLogger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[admin-shared] unhandled error"
    );
    return null;
  }
}

export async function getAdminSecret(): Promise<string | null> {
  // Priority order:
  //   1. Runtime-config value — updated immediately when the rotate-secret
  //      endpoint is called, and seeded from "admin_secret_override" in the
  //      DB on every restart. This is the only source that reflects a
  //      rotation performed without a server restart.
  //   2. platform_settings["admin_master_secret"] — manually set via admin UI.
  //   3. ADMIN_SECRET env var — initial bootstrap value.
  const { getAdminSecretRuntime } = await import("../lib/runtime-config.js");
  const runtimeSecret = getAdminSecretRuntime();
  if (runtimeSecret) return runtimeSecret;

  const envSecret = process.env.ADMIN_SECRET;
  try {
    const settings = await _getCachedSettings();
    return settings["admin_master_secret"] || envSecret || null;
  } catch (err) {
    pinoLogger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[admin-shared] unhandled error"
    );
    return envSecret || null;
  }
}

export async function verifyAdminSecret(input: string): Promise<boolean> {
  const actual = await getAdminSecret();
  if (!actual) return false;
  return input === actual;
}

/* ── MIDDLEWARE ────────────────────────────────────────────────────────── */

export const adminAuth = (req: AdminRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Unauthorized: No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1]!;

  try {
    // v2: verify with ADMIN_ACCESS_TOKEN_SECRET, map sub→adminId, perms→permissions
    const payload = verifyAccessToken(token);
    req.adminId = payload.sub ?? undefined;
    req.adminRole = payload.role ?? "admin";
    req.adminName = payload.name ?? "Admin";
    req.adminPermissions = payload.perms ?? [];
    req.adminPayload = {
      adminId: payload.sub ?? null,
      role: payload.role ?? "admin",
      name: payload.name ?? "Admin",
      permissions: payload.perms ?? [],
    };
    req.adminIp = getClientIp(req);
    next();
  } catch (err) {
    pinoLogger.warn({ err, ip: getClientIp(req) }, "[admin-shared] Invalid admin token");
    res.status(401).json({ success: false, error: "Unauthorized: Invalid or expired token" });
  }
};

/* ── AUDIT LOGGING ─────────────────────────────────────────────────────── */

export async function addAuditEntry(params: {
  action: string;
  ip: string;
  adminId?: string | null;
  adminName?: string | null;
  details?: string;
  result: "success" | "fail" | "warn";
  affectedUserId?: string | null;
  affectedUserName?: string | null;
  affectedUserRole?: string | null;
}): Promise<void> {
  try {
    await db.insert(adminActionAuditLogTable).values({
      id: _generateId(),
      adminId: params.adminId ?? null,
      adminName: params.adminName ?? null,
      ip: params.ip,
      action: params.action,
      result: params.result,
      details: params.details ?? null,
      affectedUserId: params.affectedUserId ?? null,
      affectedUserName: params.affectedUserName ?? null,
      affectedUserRole: params.affectedUserRole ?? null,
    });
  } catch (err) {
    pinoLogger.error({ err, params }, "[admin-shared] Failed to write audit entry");
  }
}

/* ── SETTINGS CACHE ────────────────────────────────────────────────────── */

export const getCachedSettings = _getCachedSettings;
export const invalidateSettingsCache = _invalidateSettingsCache;

export function invalidatePlatformSettingsCache(): void {
  _invalidateSettingsCache();
}

export async function getPlatformSettings(): Promise<Record<string, string>> {
  return _getCachedSettings();
}

/* ── HELPERS ───────────────────────────────────────────────────────────── */

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return (
      (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0])?.trim() ||
      req.ip ||
      "unknown"
    );
  }
  return req.ip || "unknown";
}

/* ── MFA UTILITIES ─────────────────────────────────────────────────────── */

export function generateTotpSecret(): string {
  return randomBytes(20).toString("hex");
}

export async function generateQRCodeDataURL(secret: string, accountName: string): Promise<string> {
  const { default: qrcode } = await import("qrcode");
  const uri = getTotpUri(secret, accountName);
  return qrcode.toDataURL(uri);
}

export function getTotpUri(secret: string, accountName: string): string {
  const issuer = "AJKMart Admin";
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}

export async function verifyTotpToken(token: string, secret: string): Promise<boolean> {
  try {
    const { verifyTotpToken: totpVerify } = await import("../services/totp.js");
    return totpVerify(token, secret);
  } catch (err) {
    pinoLogger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[admin-shared] unhandled error"
    );
    return false;
  }
}

/* ── RATE LIMITING / SECURITY EVENTS ──────────────────────────────────── */

export async function resetAdminLoginAttempts(ip: string): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.del(_memKey(ip));
    } catch (err) {
      pinoLogger.warn({ ip, err }, "[admin-shared] Redis reset failed — clearing memory fallback");
    }
  }
  _memAttempts.delete(ip);
  pinoLogger.info({ ip }, "[admin-shared] Reset login attempts");
}

export function addSecurityEvent(params: {
  type: string;
  ip: string;
  userId?: string;
  details: string;
  severity: "low" | "medium" | "high" | "critical";
}): void {
  _realAddSecurityEvent(params);
}

/* ── LOCALISATION ──────────────────────────────────────────────────────── */

export function stripUser(user: Record<string, unknown>): Record<string, unknown> {
  const { password: _p, ...rest } = user;
  return rest;
}

export async function getUserLanguage(_userId: string): Promise<string> {
  return "en";
}

export function t(key: TranslationKey, lang: string): string {
  try {
    return i18nT(key as I18nTranslationKey, (lang || "en") as Language);
  } catch (err) {
    pinoLogger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[admin-shared] unhandled error"
    );
    return key;
  }
}

export async function sendUserNotification(
  userId: string,
  title: string,
  body: string,
  type: string = "system",
  icon: string = "notifications-outline"
): Promise<void> {
  try {
    await db.insert(notificationsTable).values({
      id: _generateId(),
      userId,
      title,
      body,
      type,
      icon,
    });
  } catch (err) {
    pinoLogger.error({ err, userId }, "[admin-shared] Failed to insert notification");
  }
  try {
    const { sendPushToUser } = await import("../lib/webpush.js");
    await sendPushToUser(userId, { title, body, icon });
  } catch (err) {
    pinoLogger.warn({ err, userId }, "[admin-shared] Push notification failed");
  }
}

/* ── RIDE SERVICES / LOCATIONS SEEDING ─────────────────────────────────── */

export { ensureDefaultLocations, ensureDefaultRideServices } from "../lib/seedDefaults.js";

export function formatSvc(svc: unknown): unknown {
  return svc;
}

/* ── MIGRATION STUBS ────────────────────────────────────────────────────── */

export async function ensureAuthMethodColumn(): Promise<void> {}
export async function ensureRideBidsMigration(): Promise<void> {}
export async function ensureOrdersGpsColumns(): Promise<void> {}
export async function ensurePromotionsTables(): Promise<void> {}
export async function ensureSupportMessagesTable(): Promise<void> {}
export async function ensureFaqsTable(): Promise<void> {}
export async function ensureCommunicationTables(): Promise<void> {}
export async function ensureVendorLocationColumns(): Promise<void> {}
export async function ensureVanServiceUpgrade(): Promise<void> {}
export async function ensureWalletP2PColumns(): Promise<void> {}
export async function ensureComplianceTables(): Promise<void> {}

/* ── SESSION MANAGEMENT ─────────────────────────────────────────────────── */

export async function revokeAllUserSessions(userId: string): Promise<void> {
  try {
    const { revokeAllUserRefreshTokens } = await import("../middleware/security.js");
    await revokeAllUserRefreshTokens(userId);
  } catch (err) {
    pinoLogger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[admin-shared] unhandled error"
    );
    pinoLogger.warn({ userId }, "[admin-shared] revokeAllUserSessions failed");
  }
}

/* ── SOS ────────────────────────────────────────────────────────────────── */

export function serializeSosAlert(alert: unknown): unknown {
  return alert;
}

/* ── AUDIT LOG PROXY ─────────────────────────────────────────────────────── */

export { auditLog } from "../middleware/security.js";
export type { AuditEntry } from "../middleware/security.js";
