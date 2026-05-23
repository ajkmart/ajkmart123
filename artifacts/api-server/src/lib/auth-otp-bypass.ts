/**
 * auth-otp-bypass.ts
 *
 * OTP bypass detection and logging for auth flow.
 * Checks if a phone number has an active bypass (global suspend, per-user, or whitelist).
 */

import { db } from "@workspace/db";
import {
  otpBypassAuditTable,
  platformSettingsTable,
  usersTable,
  whitelistUsersTable,
} from "@workspace/db/schema";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";

const OTP_HASH_ROUNDS = 10;

export interface OTPBypassStatus {
  isBypassed: boolean;
  reason: "per_user" | "global" | "whitelist" | null;
  expiresAt: Date | null;
  bypassCode?: string;
  entryId?: string;
  createdBy?: string | null;
}

/**
 * Check if OTP can be bypassed for given phone
 *
 * Priority:
 * 1. Per-user bypass (user.otpBypassUntil > now)
 * 2. Global OTP disable (platform setting otp_global_disabled_until > now)
 * 3. Whitelist bypass (phone in whitelist_users, active, not expired)
 */
export async function checkOTPBypass(phone: string): Promise<OTPBypassStatus> {
  const now = new Date();

  try {
    // Priority 1: Per-user bypass
    const user = await db.query.usersTable.findFirst({
      where: and(eq(usersTable.phone, phone), gt(usersTable.otpBypassUntil, now)),
      columns: { id: true, otpBypassUntil: true },
    });

    if (user && user.otpBypassUntil && user.otpBypassUntil > now) {
      return {
        isBypassed: true,
        reason: "per_user",
        expiresAt: user.otpBypassUntil,
      };
    }

    // Priority 2: Global OTP disable
    const activeDisable = await db.query.platformSettingsTable.findFirst({
      where: and(
        eq(platformSettingsTable.key, "otp_global_disabled_until"),
        gt(platformSettingsTable.value, now.toISOString())
      ),
      columns: { value: true },
    });

    if (activeDisable?.value) {
      const disabledUntil = new Date(activeDisable.value);
      return {
        isBypassed: true,
        reason: "global",
        expiresAt: disabledUntil,
      };
    }

    // Priority 3: Whitelist bypass
    /* Production gate: if ENABLE_OTP_BYPASS_PRODUCTION is not explicitly set
       to "true", skip the entire whitelist lookup in production. This replaces
       the previous narrow two-code blocklist ("123456" / "000000") which still
       allowed any other code (e.g. "111111") to work as a valid bypass.
       A compromised or rogue admin could silently add bypass entries and take
       over any user account — this gate prevents that entirely unless the
       operator consciously opts in via the env var. */
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_OTP_BYPASS_PRODUCTION !== "true") {
      logger.warn(
        { phone },
        "[OTPBypass] Whitelist bypass skipped — feature disabled in production (set ENABLE_OTP_BYPASS_PRODUCTION=true to enable)"
      );
      return {
        isBypassed: false,
        reason: null,
        expiresAt: null,
      };
    }

    /* The previous `(record) => !record.expiresAt || record.expiresAt > now`
       callback isn't a valid Drizzle predicate — Drizzle's `where` expects
       a `SQLWrapper`, not a JS function — so TypeScript was failing the
       build and at runtime this branch silently matched nothing. Express
       the same intent with `or(isNull(...), gt(...))` so it compiles to
       real SQL. */
    const whitelisted = await db.query.whitelistUsersTable.findFirst({
      where: and(
        eq(whitelistUsersTable.identifier, phone),
        eq(whitelistUsersTable.isActive, true),
        or(isNull(whitelistUsersTable.expiresAt), gt(whitelistUsersTable.expiresAt, now))
      ),
      columns: { id: true, bypassCode: true, expiresAt: true, createdBy: true },
    });

    if (whitelisted) {
      return {
        isBypassed: true,
        reason: "whitelist",
        expiresAt: whitelisted.expiresAt || null,
        bypassCode: whitelisted.bypassCode,
        entryId: whitelisted.id,
        createdBy: whitelisted.createdBy,
      };
    }

    return {
      isBypassed: false,
      reason: null,
      expiresAt: null,
    };
  } catch (error) {
    logger.error({ error, phone }, "[OTPBypass] Check failed");
    return {
      isBypassed: false,
      reason: null,
      expiresAt: null,
    };
  }
}

/**
 * Log OTP bypass event to audit table
 */
export async function logOTPBypassEvent(
  eventType:
    | "login_otp_bypass"
    | "login_per_user_bypass"
    | "login_global_bypass"
    | "login_whitelist_bypass"
    | "otp_send_bypassed",
  userId: string | null,
  phone: string,
  ip: string,
  bypassReason: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await db.insert(otpBypassAuditTable).values({
      id: generateId(),
      eventType,
      userId,
      phone,
      bypassReason,
      ipAddress: ip,
      metadata: metadata || {},
    });
  } catch (error) {
    logger.error({ error }, "[OTPBypass] Audit log failed");
  }
}

/**
 * Helper to create bypass response for send-otp endpoint
 */
export function createBypassResponse(bypassed: OTPBypassStatus) {
  return {
    otpRequired: !bypassed.isBypassed,
    message: bypassed.isBypassed ? "OTP sent successfully" : "OTP verification required",
    channel: bypassed.reason === "whitelist" ? "whitelist" : "sms",
    fallbackChannels: bypassed.isBypassed ? [] : ["email", "whatsapp"],
    bypass: bypassed.isBypassed
      ? {
          active: true,
          reason: bypassed.reason,
          expiresAt: bypassed.expiresAt?.toISOString() || null,
        }
      : null,
  };
}

/**
 * Hash OTP for storage using bcrypt.
 *
 * Storing OTPs as a one-way hash means a database leak cannot be replayed
 * to log in: only the hash is persisted, never the user-visible code.
 */
export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, OTP_HASH_ROUNDS);
}

/**
 * Verify a user-supplied OTP against its stored bcrypt hash.
 * Returns false (without throwing) on any malformed input or hash format.
 */
export async function verifyOtp(otp: string, hash: string): Promise<boolean> {
  if (!otp || !hash) return false;
  try {
    return await bcrypt.compare(otp, hash);
  } catch (error) {
    logger.error({ error }, "[OTPBypass] verifyOtp failed");
    return false;
  }
}
