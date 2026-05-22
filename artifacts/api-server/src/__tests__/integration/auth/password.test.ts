/**
 * Integration tests — Forgot-password / Verify-reset-OTP / Reset-password flow
 *
 * Strategy:
 *  - sendOtpSMS / sendWhatsAppOTP / sendPasswordResetEmail are mocked so no
 *    real messages are delivered.
 *  - For verify-reset-otp we seed otp_tokens directly with otpType="reset" and
 *    a known code ("123456"), bypassing the need to call forgot-password first.
 *  - verify-reset-otp returns 422 (not 401) for wrong/expired codes — this is
 *    by design in the password.ts handler.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted) ────────────────────────────────────────────────────────────
vi.mock("../../../modules/otp/otp.deliver.js", () => ({
  deliverOtp: vi.fn().mockResolvedValue({ success: true, usedChannel: "sms" }),
  getAvailableChannels: vi.fn().mockReturnValue(["sms"]),
}));

vi.mock("../../../services/sms.js", () => ({
  sendOtpSMS: vi.fn().mockResolvedValue({ success: true }),
  isSMSProviderConfigured: vi.fn().mockReturnValue(true),
  isSMSConsoleActive: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../services/smsGateway.js", () => ({
  sendOtpWithFailover: vi.fn().mockResolvedValue({ success: true }),
  getWhitelistBypass: vi.fn().mockReturnValue(null),
}));

vi.mock("../../../services/whatsapp.js", () => ({
  sendWhatsAppOTP: vi.fn().mockResolvedValue({ success: true }),
  isWhatsAppProviderConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../services/email.js", () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  alertNewVendor: vi.fn().mockResolvedValue(undefined),
  isEmailProviderConfigured: vi.fn().mockReturnValue(false),
}));

// ── Imports ────────────────────────────────────────────────────────────────────
import request from "supertest";
import { createServer } from "../../../app.js";
import { hashPassword } from "../../../services/password.js";
import {
  cleanupOtpAttempts,
  cleanupOtpTokens,
  cleanupRefreshTokens,
  createTestUser,
  deleteTestUser,
  deleteTestUserByPhone,
  expireOtpToken,
  generateTestPhone,
  seedOtpToken,
  toCanonicalPhone,
} from "../helpers/db-helpers.js";

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  const createdUserIds: string[] = [];
  const usedPhones: string[] = [];

  beforeAll(async () => {
    app = await createServer();
  });

  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      await deleteTestUser(userId).catch(() => undefined);
    }
    for (const phone of usedPhones.splice(0)) {
      const canon = toCanonicalPhone(phone);
      await cleanupOtpTokens(canon).catch(() => undefined);
      await cleanupOtpAttempts(canon).catch(() => undefined);
      await deleteTestUserByPhone(canon).catch(() => undefined);
    }
  });

  it("returns 200 for a phone that belongs to an existing user", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);
    const canonPhone = toCanonicalPhone(phone);
    const userId = await createTestUser({ phone: canonPhone, phoneVerified: true });
    createdUserIds.push(userId);

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ phone })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.message ?? res.body.message).toMatch(/sent/i);
  });

  it("returns 200 even for a phone that does NOT exist (anti-enumeration)", async () => {
    const phone = generateTestPhone();

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ phone })
      .set("Content-Type", "application/json");

    // Must always return 200 to prevent account enumeration
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 400 when neither phone nor email is provided", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({})
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── verify-reset-otp ───────────────────────────────────────────────────────────

describe("POST /api/auth/verify-reset-otp", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  const createdUserIds: string[] = [];
  const usedPhones: string[] = [];

  beforeAll(async () => {
    app = await createServer();
  });

  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      await deleteTestUser(userId).catch(() => undefined);
    }
    for (const phone of usedPhones.splice(0)) {
      const canon = toCanonicalPhone(phone);
      await cleanupOtpTokens(canon).catch(() => undefined);
      await cleanupOtpAttempts(canon).catch(() => undefined);
      await deleteTestUserByPhone(canon).catch(() => undefined);
    }
  });

  it("returns 200 with a resetToken for a correct OTP", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);
    const canonPhone = toCanonicalPhone(phone);
    const userId = await createTestUser({ phone: canonPhone, phoneVerified: true });
    createdUserIds.push(userId);

    await seedOtpToken({
      identifier: canonPhone,
      identifierType: "phone",
      otpType: "reset",
      code: "123456",
      userId,
    });

    const res = await request(app)
      .post("/api/auth/verify-reset-otp")
      .send({ phone, otp: "123456" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("resetToken");
    expect(typeof res.body.data.resetToken).toBe("string");
    expect(res.body.data.resetToken.length).toBeGreaterThan(10);
  });

  it("returns 422 for a wrong OTP code", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);
    const canonPhone = toCanonicalPhone(phone);
    const userId = await createTestUser({ phone: canonPhone, phoneVerified: true });
    createdUserIds.push(userId);

    await seedOtpToken({
      identifier: canonPhone,
      identifierType: "phone",
      otpType: "reset",
      code: "123456",
      userId,
    });

    const res = await request(app)
      .post("/api/auth/verify-reset-otp")
      .send({ phone, otp: "000000" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it("returns 422 for an expired OTP", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);
    const canonPhone = toCanonicalPhone(phone);
    const userId = await createTestUser({ phone: canonPhone, phoneVerified: true });
    createdUserIds.push(userId);

    const { tokenId } = await seedOtpToken({
      identifier: canonPhone,
      identifierType: "phone",
      otpType: "reset",
      code: "123456",
      userId,
    });
    await expireOtpToken(tokenId);

    const res = await request(app)
      .post("/api/auth/verify-reset-otp")
      .send({ phone, otp: "123456" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it("returns 422 for a user that does not exist", async () => {
    const phone = generateTestPhone();

    const res = await request(app)
      .post("/api/auth/verify-reset-otp")
      .send({ phone, otp: "123456" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

// ── reset-password ─────────────────────────────────────────────────────────────

describe("POST /api/auth/reset-password", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  const createdUserIds: string[] = [];
  const usedPhones: string[] = [];

  beforeAll(async () => {
    app = await createServer();
  });

  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      await cleanupRefreshTokens(userId).catch(() => undefined);
      await deleteTestUser(userId).catch(() => undefined);
    }
    for (const phone of usedPhones.splice(0)) {
      const canon = toCanonicalPhone(phone);
      await cleanupOtpTokens(canon).catch(() => undefined);
      await cleanupOtpAttempts(canon).catch(() => undefined);
      await deleteTestUserByPhone(canon).catch(() => undefined);
    }
  });

  it("resets password successfully with a valid resetToken", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);
    const canonPhone = toCanonicalPhone(phone);
    const userId = await createTestUser({
      phone: canonPhone,
      phoneVerified: true,
      passwordHash: hashPassword("OldP@ssword1"),
    });
    createdUserIds.push(userId);

    // Seed reset OTP and obtain resetToken via verify-reset-otp
    await seedOtpToken({
      identifier: canonPhone,
      identifierType: "phone",
      otpType: "reset",
      code: "123456",
      userId,
    });

    const verifyRes = await request(app)
      .post("/api/auth/verify-reset-otp")
      .send({ phone, otp: "123456" })
      .set("Content-Type", "application/json");

    expect(verifyRes.status).toBe(200);
    const { resetToken } = verifyRes.body.data;

    // Use the resetToken to set a new password
    const resetRes = await request(app)
      .post("/api/auth/reset-password")
      .send({ phone, resetToken, newPassword: "NewP@ssword1" })
      .set("Content-Type", "application/json");

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);
  });

  it("returns 400 or 401 for an invalid resetToken", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);
    const canonPhone = toCanonicalPhone(phone);
    const userId = await createTestUser({ phone: canonPhone, phoneVerified: true });
    createdUserIds.push(userId);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ phone, resetToken: "invalid.token.here", newPassword: "NewP@ssword1" })
      .set("Content-Type", "application/json");

    expect([400, 401, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for a weak new password", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);
    const canonPhone = toCanonicalPhone(phone);
    const userId = await createTestUser({ phone: canonPhone, phoneVerified: true });
    createdUserIds.push(userId);

    await seedOtpToken({
      identifier: canonPhone,
      identifierType: "phone",
      otpType: "reset",
      code: "123456",
      userId,
    });

    const verifyRes = await request(app)
      .post("/api/auth/verify-reset-otp")
      .send({ phone, otp: "123456" })
      .set("Content-Type", "application/json");

    expect(verifyRes.status).toBe(200);
    const { resetToken } = verifyRes.body.data;

    const resetRes = await request(app)
      .post("/api/auth/reset-password")
      .send({ phone, resetToken, newPassword: "weak" })
      .set("Content-Type", "application/json");

    expect(resetRes.status).toBe(400);
    expect(resetRes.body.success).toBe(false);
  });

  it("cannot reuse the same resetToken twice (single-use enforcement)", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);
    const canonPhone = toCanonicalPhone(phone);
    const userId = await createTestUser({ phone: canonPhone, phoneVerified: true });
    createdUserIds.push(userId);

    await seedOtpToken({
      identifier: canonPhone,
      identifierType: "phone",
      otpType: "reset",
      code: "123456",
      userId,
    });

    const verifyRes = await request(app)
      .post("/api/auth/verify-reset-otp")
      .send({ phone, otp: "123456" })
      .set("Content-Type", "application/json");
    expect(verifyRes.status).toBe(200);
    const { resetToken } = verifyRes.body.data;

    // First use succeeds
    const first = await request(app)
      .post("/api/auth/reset-password")
      .send({ phone, resetToken, newPassword: "NewP@ssword1" })
      .set("Content-Type", "application/json");
    expect(first.status).toBe(200);

    // Second use must fail (JTI blacklisted or token version mismatch)
    const second = await request(app)
      .post("/api/auth/reset-password")
      .send({ phone, resetToken, newPassword: "AnotherP@ss1" })
      .set("Content-Type", "application/json");
    expect([400, 401, 422, 403]).toContain(second.status);
    expect(second.body.success).toBe(false);
  });
});
