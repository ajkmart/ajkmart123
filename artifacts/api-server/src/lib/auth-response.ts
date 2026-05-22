/**
 * auth-response.ts
 *
 * Standardized response helpers and event logging for all auth endpoints.
 *
 * Exports:
 *   AUTH_ERROR_CODES   — typed error code constants
 *   sendAuthSuccess()  — wraps sendSuccess with the standard auth payload
 *   sendAuthError()    — wraps sendErrorWithData with a typed error code
 *   logAuthEvent()     — fire-and-forget write to auth_events table
 *   AuthSuccessPayload / AuthUserPayload / LogAuthEventParams — TS types
 */

import { db } from "@workspace/db";
import { authEventsTable } from "@workspace/db/schema";
import type { Response } from "express";
import { generateId } from "./id.js";
import { logger } from "./logger.js";
import { sendErrorWithData, sendSuccess } from "./response.js";

// ─── Error Codes ──────────────────────────────────────────────────────────────

export const AUTH_ERROR_CODES = {
  INVALID_OTP: "INVALID_OTP",
  OTP_EXPIRED: "OTP_EXPIRED",
  OTP_BLOCKED: "OTP_BLOCKED",
  OTP_ALREADY_USED: "OTP_ALREADY_USED",
  OTP_DELIVERY_FAILED: "OTP_DELIVERY_FAILED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE",
  APPROVAL_PENDING: "APPROVAL_PENDING",
  APPROVAL_REJECTED: "APPROVAL_REJECTED",
  WRONG_APP: "WRONG_APP",
  ROLE_MISMATCH: "ROLE_MISMATCH",
  REQUIRES_2FA: "REQUIRES_2FA",
  TOTP_INVALID: "TOTP_INVALID",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  PHONE_NOT_REGISTERED: "PHONE_NOT_REGISTERED",
  EMAIL_NOT_REGISTERED: "EMAIL_NOT_REGISTERED",
  REGISTRATION_REQUIRED: "REGISTRATION_REQUIRED",
  REGISTRATION_DISABLED: "REGISTRATION_DISABLED",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  TOKEN_REVOKED: "TOKEN_REVOKED",
  REFRESH_TOKEN_REUSE: "REFRESH_TOKEN_REUSE",
  GOOGLE_TOKEN_INVALID: "GOOGLE_TOKEN_INVALID",
  FACEBOOK_TOKEN_INVALID: "FACEBOOK_TOKEN_INVALID",
  AUTH_METHOD_DISABLED: "AUTH_METHOD_DISABLED",
  CAPTCHA_FAILED: "CAPTCHA_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

// ─── Payload Types ────────────────────────────────────────────────────────────

export interface AuthUserPayload {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  username?: string | null;
  avatar?: string | null;
  role: string | null;
  roles: string | null;
  walletBalance: number;
  isActive?: boolean | null;
  cnic?: string | null;
  city?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  totpEnabled?: boolean;
  kycStatus?: string | null;
  approvalStatus?: string | null;
  accountLevel?: string | null;
  ajkId?: string | null;
  needsProfileCompletion?: boolean;
  acceptedTermsVersion?: string | null;
}

export interface AuthSuccessPayload {
  accessToken: string;
  token: string;
  refreshToken?: string;
  expiresIn: number;
  expiresAt: string;
  sessionDays?: number;
  user: AuthUserPayload;
  isNewUser?: boolean;
  requiresTermsAcceptance?: boolean;
  requires2FA?: boolean;
  twoFactorRequired?: boolean;
  twoFactorToken?: string;
  tempToken?: string;
  userId?: string;
  sessionId?: string;
  pendingApproval?: boolean;
}

// ─── Response Helpers ─────────────────────────────────────────────────────────

/**
 * Send a standardized auth success response.
 * Wraps sendSuccess so `data` is always nested under the `data` key.
 */
export function sendAuthSuccess(
  res: Response,
  payload: Partial<AuthSuccessPayload> & Record<string, unknown>,
  message?: string
): void {
  sendSuccess(res, payload, message);
}

/**
 * Send a standardized auth error response.
 * Always includes a machine-readable `code` in the `data` field.
 */
export function sendAuthError(
  res: Response,
  error: string,
  code: AuthErrorCode | string,
  statusCode: number,
  extra?: Record<string, unknown>
): void {
  sendErrorWithData(res, error, { code, ...(extra ?? {}) }, statusCode);
}

// ─── Auth Event Logging ───────────────────────────────────────────────────────

export type AuthEventType =
  | "login_success"
  | "login_failed"
  | "login_2fa_challenge"
  | "logout"
  | "register"
  | "otp_sent"
  | "otp_verified"
  | "otp_failed"
  | "otp_resent"
  | "password_reset_requested"
  | "password_reset_completed"
  | "magic_link_sent"
  | "magic_link_verified"
  | "social_login"
  | "token_refresh"
  | "token_revoked"
  | "2fa_enabled"
  | "2fa_disabled"
  | "2fa_recovery_used"
  | "device_trusted"
  | "account_locked"
  | "suspicious_activity"
  | "cross_app_attempt"
  | "banned_login_attempt";

export interface LogAuthEventParams {
  eventType: AuthEventType;
  userId?: string | null;
  ip: string;
  userAgent?: string;
  channel?: string;
  role?: string;
  deviceId?: string;
  success: boolean;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget write to the auth_events table.
 * Never throws — errors are logged as warnings so they cannot break auth flows.
 */
export function logAuthEvent(params: LogAuthEventParams): void {
  const id = generateId();
  db.insert(authEventsTable)
    .values({
      id,
      userId: params.userId ?? null,
      eventType: params.eventType,
      channel: params.channel ?? null,
      role: params.role ?? null,
      ip: params.ip,
      userAgent: params.userAgent ?? null,
      deviceId: params.deviceId ?? null,
      success: params.success,
      failureReason: params.failureReason ?? null,
      metadata: params.metadata ?? null,
    })
    .catch((err: unknown) => {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "[auth-event] Failed to write auth event — non-fatal"
      );
    });
}
