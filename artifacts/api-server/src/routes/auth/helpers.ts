import { db } from "@workspace/db";
import {
  loginHistoryTable,
  rateLimitsTable,
  refreshTokensTable,
  userSessionsTable,
  userTotpSetupTable,
  usersTable,
} from "@workspace/db/schema";
import { canonicalizePhone } from "@workspace/phone-utils";
import crypto, { createHash, createHmac, randomBytes } from "crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { type Request, type Response } from "express";
import { z } from "zod";
import { logAuthEvent } from "../../lib/auth-response.js";
import { decrypt, encrypt, isEncryptionAvailable } from "../../lib/crypto/encryption.js";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import {
  SendOtpSchema,
  UserLoginSchema,
  VerifyOtpSchema,
} from "../../lib/validation/auth-schemas.js";
import {
  generateRefreshToken,
  getAccessTokenTtlSec,
  getCachedSettings,
  getRefreshTokenTtlDays,
  signAccessToken,
  verifyUserJwt,
  writeAuthAuditLog,
} from "../../middleware/security.js";

export const AUTH_OTP_TTL_MS = 5 * 60 * 1000;

export const RIDER_REFRESH_COOKIE = "ajkmart_rider_refresh";
export const RIDER_REFRESH_COOKIE_PATH = "/api/auth";
export const VENDOR_REFRESH_COOKIE = "ajkmart_vendor_refresh";
export const VENDOR_REFRESH_COOKIE_PATH = "/api/auth";

import { CNIC_REGEX, PHONE_REGEX, isValidCnic, isValidPhone } from "@workspace/phone-utils";
export { CNIC_REGEX, PHONE_REGEX, isValidCnic, isValidPhone };

export function hashOtp(otp: string, key?: string): string {
  if (key) {
    return createHmac("sha256", key).update(otp).digest("hex");
  }
  const secret = process.env["OTP_HMAC_SECRET"];
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[FATAL] OTP_HMAC_SECRET must be set in production. " +
          "This secret is used to hash OTP codes for verification and must not fall back to JWT_SECRET. " +
          "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    logger.warn(
      "[auth] OTP_HMAC_SECRET not set — using JWT_SECRET as fallback. " +
        "This is NOT safe for production. " +
        "Set a dedicated OTP_HMAC_SECRET before deploying."
    );
    const fallback = process.env["JWT_SECRET"];
    if (!fallback) {
      throw new Error(
        "[FATAL] OTP_HMAC_SECRET (or JWT_SECRET fallback) is not set — cannot hash OTP"
      );
    }
    return createHmac("sha256", fallback).update(otp).digest("hex");
  }
  return createHmac("sha256", secret).update(otp).digest("hex");
}

export { normalizeVehicleType as normalizeVehicleTypeForStorage } from "@workspace/service-constants";

export function generateVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const SAFE_PHONE_REGEX_DEFAULT = /^0?3\d{9}$/;

export async function isValidCanonicalPhone(phone: string): Promise<boolean> {
  try {
    const s = await getCachedSettings();
    const raw = s["regional_phone_format"] ?? "^0?3\\d{9}$";
    // Guard against ReDoS: validate the DB-stored pattern before compiling it
    const { default: safeRegex } = await import("safe-regex2");
    if (!safeRegex(raw)) {
      logger.warn(
        { pattern: raw },
        "[isValidCanonicalPhone] unsafe regex in regional_phone_format — falling back to default"
      );
      return SAFE_PHONE_REGEX_DEFAULT.test(phone);
    }
    return new RegExp(raw).test(phone);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return SAFE_PHONE_REGEX_DEFAULT.test(phone);
  }
}

export function isRiderSession(
  _req: Request,
  user?: { role?: string | null; roles?: string | null } | null
): boolean {
  const rolesStr = (user?.roles ?? user?.role ?? "") as string;
  if (!rolesStr) return false;
  return rolesStr
    .split(",")
    .map((r) => r.trim())
    .includes("rider");
}

export function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEV_DOMAIN;
}

export function setRiderRefreshCookie(
  req: Request,
  res: Response,
  refreshRaw: string,
  user?: { role?: string | null; roles?: string | null } | null
): void {
  if (!isRiderSession(req, user)) return;
  res.cookie(RIDER_REFRESH_COOKIE, refreshRaw, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: RIDER_REFRESH_COOKIE_PATH,
    maxAge: getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000,
  });
}

export function clearRiderRefreshCookie(res: Response): void {
  res.clearCookie(RIDER_REFRESH_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: RIDER_REFRESH_COOKIE_PATH,
  });
}

export function isVendorSession(
  _req: Request,
  user?: { role?: string | null; roles?: string | null } | null
): boolean {
  const rolesStr = (user?.roles ?? user?.role ?? "") as string;
  if (!rolesStr) return false;
  return rolesStr
    .split(",")
    .map((r) => r.trim())
    .includes("vendor");
}

export function setVendorRefreshCookie(
  req: Request,
  res: Response,
  refreshRaw: string,
  user?: { role?: string | null; roles?: string | null } | null
): void {
  if (!isVendorSession(req, user)) return;
  res.cookie(VENDOR_REFRESH_COOKIE, refreshRaw, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: VENDOR_REFRESH_COOKIE_PATH,
    maxAge: getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000,
  });
}

export function clearVendorRefreshCookie(res: Response): void {
  res.clearCookie(VENDOR_REFRESH_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: VENDOR_REFRESH_COOKIE_PATH,
  });
}

export const forgotPasswordSchema = z
  .object({
    phone: z.string().min(7).optional(),
    email: z.string().email("Invalid email address").optional(),
    identifier: z.string().min(3).optional(),
  })
  .strip()
  .refine((d) => d.phone || d.email || d.identifier, {
    message: "Phone, email, or username is required",
    path: ["phone"],
  });

export const registerSchema = z
  .object({
    phone: z.string().min(7, "Phone number is required"),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
    name: z.string().max(80).optional(),
    role: z.enum(["customer", "rider", "vendor"]).optional(),
    email: z.string().email().optional().or(z.literal("")),
    username: z
      .string()
      .min(3)
      .max(20)
      .regex(
        /^[a-z0-9_]+$/,
        "Username can only contain lowercase letters, numbers, and underscores"
      )
      .optional(),
    cnic: z
      .string()
      .regex(CNIC_REGEX, "CNIC format must be XXXXX-XXXXXXX-X")
      .optional()
      .or(z.literal("")),
    nationalId: z.string().optional(),
    vehicleType: z.string().optional(),
    vehicleRegNo: z.string().optional(),
    drivingLicense: z.string().optional(),
    address: z.string().max(255).optional(),
    city: z.string().max(80).optional(),
    emergencyContact: z.string().optional(),
    vehiclePlate: z.string().optional(),
    vehiclePhoto: z.string().optional(),
    documents: z.string().optional(),
    businessName: z.string().max(120).optional(),
    businessType: z.string().optional(),
    storeAddress: z.string().max(255).optional(),
    ntn: z.string().optional(),
    storeName: z.string().max(120).optional(),
    captchaToken: z.string().optional(),
  })
  .strip();

export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(10, "refreshToken must be at least 10 chars").optional(),
  })
  .strip();

export const checkIdentifierSchema = z
  .object({
    identifier: z.string().min(3, "Identifier must be at least 3 characters"),
    role: z.enum(["customer", "rider", "vendor"]).optional(),
    deviceId: z.string().max(256).optional(),
  })
  .strip();

export const phoneSchema = z
  .string()
  .min(7, "Phone number is required")
  .max(20, "Phone number too long")
  .regex(PHONE_REGEX, "Phone number must be a valid Pakistani mobile number (03XXXXXXXXX)");

export const sendOtpSchema = SendOtpSchema;
export const verifyOtpSchema = VerifyOtpSchema;
export const loginSchema = UserLoginSchema;

export {
  ChangePhoneConfirmSchema,
  ChangePhoneRequestSchema,
  CheckAvailableSchema,
  CompleteProfileSchema,
  EmailRegisterSchema,
  FirebaseVerifySchema,
  LinkFacebookSchema,
  LinkGoogleSchema,
  LoginVerifyOtpSchema,
  LogoutSchema,
  MagicLinkSendSchema,
  MagicLinkVerifySchema,
  MergeAccountSchema,
  ResetPasswordSchema,
  SendEmailOtpSchema,
  SendMergeOtpSchema,
  SendOtpSchema,
  SetPasswordSchema,
  SocialFacebookSchema,
  SocialGoogleSchema,
  TotpCodeSchema,
  TrustDeviceSchema,
  TwoFaRecoverySchema,
  TwoFaVerifySchema,
  UserLoginSchema,
  ValidateTokenSchema,
  VendorRegisterSchema,
  VerifyEmailOtpSchema,
  VerifyOtpSchema,
  VerifyResetOtpSchema,
} from "../../lib/validation/auth-schemas.js";

export async function checkAndIncrOtpRateLimit(params: {
  identifier: string;
  ip: string;
  settings: Record<string, string>;
}): Promise<
  { blocked: true; retryAfterSeconds: number; reason: "account" | "ip" } | { blocked: false }
> {
  const maxPerAcct = Math.max(
    1,
    parseInt(params.settings["security_otp_max_per_phone"] ?? "5", 10)
  );
  const maxPerIp = Math.max(1, parseInt(params.settings["security_otp_max_per_ip"] ?? "10", 10));
  const windowMin = Math.max(1, parseInt(params.settings["security_otp_window_min"] ?? "60", 10));
  const windowMs = windowMin * 60 * 1000;
  const now = new Date();

  async function checkOne(
    key: string,
    max: number
  ): Promise<{ blocked: true; retryAfterSeconds: number } | { blocked: false }> {
    const rows = await db
      .select()
      .from(rateLimitsTable)
      .where(eq(rateLimitsTable.key, key))
      .limit(1);
    const row = rows[0];
    const windowExpired = !row || now.getTime() - row.windowStart.getTime() >= windowMs;

    if (windowExpired) {
      await db
        .insert(rateLimitsTable)
        .values({ key, attempts: 1, windowStart: now, updatedAt: now })
        .onConflictDoUpdate({
          target: rateLimitsTable.key,
          set: { attempts: 1, windowStart: now, updatedAt: now },
        });
      return { blocked: false };
    }

    if (row.attempts >= max) {
      const windowEndsAt = row.windowStart.getTime() + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((windowEndsAt - now.getTime()) / 1000));
      return { blocked: true, retryAfterSeconds };
    }

    await db
      .update(rateLimitsTable)
      .set({ attempts: row.attempts + 1, updatedAt: now })
      .where(eq(rateLimitsTable.key, key));
    return { blocked: false };
  }

  const acctResult = await checkOne(`otp_acct:${params.identifier}`, maxPerAcct);
  if (acctResult.blocked)
    return { blocked: true, retryAfterSeconds: acctResult.retryAfterSeconds, reason: "account" };

  const ipResult = await checkOne(`otp_ip:${params.ip}`, maxPerIp);
  if (ipResult.blocked)
    return { blocked: true, retryAfterSeconds: ipResult.retryAfterSeconds, reason: "ip" };

  return { blocked: false };
}

export function detectIdentifierType(raw: string): "phone" | "email" | "username" {
  if (raw.includes("@")) return "email";
  const cleaned = raw.replace(/[\s\-()]/g, "");
  if (/^\+?92\d{10}$/.test(cleaned) || /^0?3\d{9}$/.test(cleaned)) return "phone";
  if (/^\d{10,}$/.test(cleaned)) return "phone";
  return "username";
}

export async function findUserByIdentifier(identifier: string) {
  const clean = identifier.toLowerCase().trim();
  const idType = detectIdentifierType(clean);

  if (idType === "phone") {
    const phone = canonicalizePhone(clean);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    return { user: user ?? null, idType, lookupKey: phone };
  }
  if (idType === "email") {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${clean}`)
      .limit(1);
    return { user: user ?? null, idType, lookupKey: clean };
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.username}) = ${clean}`)
    .limit(1);
  return { user: user ?? null, idType, lookupKey: clean };
}

export function extractAuthUser(
  req: Request
): { userId: string; phone: string; role: string } | null {
  const authHeader = req.headers["authorization"] as string | undefined;
  const raw = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!raw) return null;
  const payload = verifyUserJwt(raw);
  if (!payload) return null;
  return { userId: payload.userId, phone: payload.phone, role: payload.role };
}

export function parseUserAgent(ua?: string): { deviceName: string; browser: string; os: string } {
  if (!ua) return { deviceName: "Unknown", browser: "Unknown", os: "Unknown" };
  let browser = "Unknown";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("OPR/") || ua.includes("Opera/")) browser = "Opera";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/")) browser = "Safari";
  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";
  const deviceName = `${browser} on ${os}`;
  return { deviceName, browser, os };
}

export async function issueTokensForUser(
  user: typeof usersTable.$inferSelect,
  ip: string,
  method: string,
  userAgent?: string,
  req?: Request,
  res?: Response
) {
  if (user.tokenVersion == null) {
    throw new Error(
      `[issueTokensForUser] tokenVersion is null for user ${user.id} — DB row may be corrupted`
    );
  }
  const accessToken = signAccessToken(
    user.id,
    user.phone ?? "",
    user.roles ?? "customer",
    user.roles ?? "customer",
    user.tokenVersion
  );
  const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000);

  const refreshTokenId = generateId();
  const tokenFamilyId = crypto.randomUUID();
  await db.insert(refreshTokensTable).values({
    id: refreshTokenId,
    userId: user.id,
    tokenHash: refreshHash,
    authMethod: method,
    expiresAt: refreshExpiresAt,
    tokenFamilyId,
  });
  db.delete(refreshTokensTable)
    .where(
      and(eq(refreshTokensTable.userId, user.id), lt(refreshTokensTable.expiresAt, new Date()))
    )
    .catch((err) => {
      logger.error("[auth] Expired token cleanup failed:", err);
    });
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  void writeAuthAuditLog("login_success", { userId: user.id, ip, userAgent, metadata: { method } });

  if (req && res) {
    setRiderRefreshCookie(req, res, refreshRaw, user);
    setVendorRefreshCookie(req, res, refreshRaw, user);
  }

  const parsed = parseUserAgent(userAgent);
  const tokenHashStr = crypto.createHash("sha256").update(accessToken).digest("hex");
  try {
    await db.insert(userSessionsTable).values({
      id: generateId(),
      userId: user.id,
      tokenHash: tokenHashStr,
      refreshTokenId,
      deviceName: parsed.deviceName,
      browser: parsed.browser,
      os: parsed.os,
      ip,
    });
  } catch (err) {
    logger.error("[auth] Session record insert failed:", err);
  }

  try {
    await db.insert(loginHistoryTable).values({
      id: generateId(),
      userId: user.id,
      ip,
      deviceName: parsed.deviceName,
      browser: parsed.browser,
      os: parsed.os,
      success: true,
      method,
    });
  } catch (err) {
    logger.error("[auth] Login history insert failed:", err);
  }

  logAuthEvent({
    eventType: "login_success",
    userId: user.id,
    ip,
    userAgent,
    channel: method,
    role: user.roles ?? "customer",
    success: true,
    metadata: { deviceName: parsed.deviceName, browser: parsed.browser, os: parsed.os },
  });

  const expiresInSec = getAccessTokenTtlSec();
  return {
    token: accessToken,
    accessToken,
    refreshToken: refreshRaw,
    expiresIn: expiresInSec,
    expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    sessionDays: getRefreshTokenTtlDays(),
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      role: user.roles,
      roles: user.roles,
      avatar: user.avatar,
      walletBalance: parseFloat(user.walletBalance ?? "0"),
      isActive: user.isActive,
      cnic: user.cnic,
      city: user.city,
      emailVerified: user.emailVerified ?? false,
      phoneVerified: user.phoneVerified ?? false,
      totpEnabled: user.totpEnabled ?? false,
      needsProfileCompletion: !user.cnic || !user.name,
      acceptedTermsVersion: user.acceptedTermsVersion ?? null,
    },
    requiresTermsAcceptance: await (async () => {
      try {
        const s = await getCachedSettings();
        const currentTermsVersion = s["terms_version"] ?? "";
        if (!currentTermsVersion) return false;
        const userAccepted = user.acceptedTermsVersion ?? null;
        return userAccepted !== currentTermsVersion;
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          "[fn] error with fallback return"
        );
        return false;
      }
    })(),
  };
}

export function isDeviceTrusted(
  user: typeof usersTable.$inferSelect,
  deviceFingerprint: string,
  _trustedDays: number
): boolean {
  if (!user.trustedDevices || !deviceFingerprint) return false;
  try {
    const devices: Array<{ fp: string; expiresAt: number }> = JSON.parse(user.trustedDevices);
    const now = Date.now();
    return devices.some((d) => d.fp === deviceFingerprint && d.expiresAt > now);
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return false;
  }
}

/** Encrypt a PII string when ENCRYPTION_MASTER_KEY is available.
 *  In production, throws a hard error if encryption is unavailable (no plaintext fallback).
 *  In development, logs a warning and returns null to avoid blocking local work. */
export function tryEncrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    if (!isEncryptionAvailable()) {
      if (process.env["NODE_ENV"] === "production") {
        throw new Error(
          "FATAL: ENCRYPTION_MASTER_KEY is not set — cannot store PII. Set this secret before deploying."
        );
      }
      logger.warn(
        "[crypto] ENCRYPTION_MASTER_KEY is not set — PII stored as plaintext (development only). Set this secret before deploying to production."
      );
      return null;
    }
    return encrypt(value);
  } catch (err) {
    if (process.env["NODE_ENV"] === "production") {
      throw err;
    }
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[crypto] tryEncrypt failed — PII stored as plaintext"
    );
    return null;
  }
}

/** Resolve a PII field: read from encrypted column first, fall back to plaintext for legacy rows. */
export function decryptPii(
  encrypted: string | null | undefined,
  plaintext: string | null | undefined
): string | null {
  if (encrypted) {
    try {
      if (isEncryptionAvailable()) return decrypt(encrypted);
    } catch (err) {
      logger.debug(
        { error: err instanceof Error ? err.message : String(err) },
        `[fn] fall through to plaintext on decryption failure`
      );
    }
  }
  return plaintext ?? null;
}

export const PENDING_TOTP_TTL_MS = 5 * 60 * 1000;

export async function storePendingTotpSecret(
  userId: string,
  secret: string,
  encryptedSecret: string
): Promise<void> {
  await db
    .insert(userTotpSetupTable)
    .values({
      id: generateId(),
      userId,
      secret,
      encryptedSecret,
    })
    .onConflictDoUpdate({
      target: userTotpSetupTable.userId,
      set: { secret, encryptedSecret, createdAt: new Date() },
    });
}

export async function getPendingTotpSecret(
  userId: string
): Promise<{ secret: string; encryptedSecret: string } | null> {
  const [row] = await db
    .select()
    .from(userTotpSetupTable)
    .where(eq(userTotpSetupTable.userId, userId))
    .limit(1);
  if (!row) return null;
  const ageMs = Date.now() - row.createdAt.getTime();
  if (ageMs > PENDING_TOTP_TTL_MS) {
    await db.delete(userTotpSetupTable).where(eq(userTotpSetupTable.userId, userId));
    return null;
  }
  return { secret: row.secret, encryptedSecret: row.encryptedSecret };
}

export async function deletePendingTotpSecret(userId: string): Promise<void> {
  await db.delete(userTotpSetupTable).where(eq(userTotpSetupTable.userId, userId));
}
