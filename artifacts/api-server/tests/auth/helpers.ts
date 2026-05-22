import cookieParser from "cookie-parser";
import express, { type Application } from "express";

export const DEFAULT_SETTINGS: Record<string, string> = {
  auth_phone_otp_enabled: "on",
  auth_email_otp_enabled: "on",
  auth_username_password_enabled: "on",
  auth_google_enabled: "off",
  auth_2fa_enabled: "on",
  auth_magic_link_enabled: "off",
  auth_facebook_enabled: "off",
  security_login_max_attempts: "5",
  security_lockout_minutes: "30",
  security_otp_cooldown_sec: "0",
  feature_new_users: "on",
  otp_require_when_no_provider: "off",
  security_otp_bypass: "off",
  integration_whatsapp: "off",
};

export function makeTestUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "usr_test01",
    phone: "+923001234567",
    email: "test@example.com",
    name: "Test User",
    roles: "customer",
    isActive: true,
    isBanned: false,
    passwordHash: null,
    otpCode: null,
    otpExpiry: null,
    otpUsed: false,
    otpBypassUntil: null,
    emailOtpCode: null,
    emailOtpExpiry: null,
    totpEnabled: false,
    totpSecret: null,
    tokenVersion: 0,
    requirePasswordChange: false,
    googleId: null,
    backupCodes: null,
    trustedDevices: null,
    username: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

export function makeTestApp(authRouter: ReturnType<typeof import("express").Router>) {
  const app: Application = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/auth", authRouter);
  return app;
}
