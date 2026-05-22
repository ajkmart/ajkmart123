/**
 * Integration tests — POST /api/auth/send-otp  &  POST /api/auth/verify-otp
 *
 * Strategy:
 *  - deliverOtp is mocked so no real SMS/WhatsApp is sent.
 *  - The OTP module still saves tokens to the real DB.
 *  - For verify-otp we seed otp_tokens directly with a known code ("123456")
 *    so we never need to capture the randomly generated plaintext code.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted before all imports) ────────────────────────────────────────
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
import { db } from "@workspace/db";
import { otpTokensTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createServer } from "../../../app.js";
import {
  cleanupOtpAttempts,
  cleanupOtpTokens,
  createTestUser,
  deleteTestUser,
  deleteTestUserByPhone,
  expireOtpToken,
  generateTestPhone,
  seedOtpToken,
  toCanonicalPhone,
} from "../helpers/db-helpers.js";

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("POST /api/auth/send-otp", () => {
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
      await deleteTestUserByPhone(canon).catch(() => undefined);
      await cleanupOtpTokens(canon).catch(() => undefined);
      await cleanupOtpAttempts(canon).catch(() => undefined);
    }
  });

  it("returns 200 and channel for a valid phone number", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    const res = await request(app)
      .post("/api/auth/send-otp")
      .send({ phone })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("channel");
  });

  it("stores the OTP hash in otp_tokens — not the plaintext code", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    await request(app)
      .post("/api/auth/send-otp")
      .send({ phone })
      .set("Content-Type", "application/json");

    const now = new Date();
    // Routes canonicalize the phone before storing as identifier
    const canonPhone = toCanonicalPhone(phone);
    const rows = await db
      .select()
      .from(otpTokensTable)
      .where(eq(otpTokensTable.identifier, canonPhone))
      .limit(5);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0]!;
    // Hash must be a 64-char hex string (SHA-256 / HMAC-SHA256), never a 6-digit OTP
    expect(row.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.otpHash).not.toMatch(/^\d{6}$/);
    expect(row.usedAt).toBeNull();
    expect(row.expiresAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("returns 400 for an invalid phone number format", async () => {
    const res = await request(app)
      .post("/api/auth/send-otp")
      .send({ phone: "not-a-phone" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when phone is missing", async () => {
    const res = await request(app)
      .post("/api/auth/send-otp")
      .send({})
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 429 after exceeding rate limit for the same phone", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    const makeRequest = () =>
      request(app)
        .post("/api/auth/send-otp")
        .send({ phone })
        .set("Content-Type", "application/json");

    // First 3 requests should succeed (limit is 3/60s)
    await makeRequest();
    await makeRequest();
    await makeRequest();

    // 4th request should be rate-limited
    const res = await makeRequest();
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty("retryAfter");
  });
});

// ── verify-otp ─────────────────────────────────────────────────────────────────

describe("POST /api/auth/verify-otp", () => {
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
      await deleteTestUserByPhone(canon).catch(() => undefined);
      await cleanupOtpTokens(canon).catch(() => undefined);
      await cleanupOtpAttempts(canon).catch(() => undefined);
    }
  });

  it("returns 200 with access token when OTP is correct (new user flow)", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    // Routes store otp_tokens with the canonical phone as identifier
    const canonPhone = toCanonicalPhone(phone);
    await seedOtpToken({
      identifier: canonPhone,
      identifierType: "phone",
      otpType: "login",
      code: "123456",
    });

    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ phone, otp: "123456" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // New user: accessToken field
    const data = res.body.data;
    const hasToken = "accessToken" in data || "token" in data;
    expect(hasToken).toBe(true);
    expect(data).toHaveProperty("user");
  });

  it("returns 200 with token for an existing user", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);
    const canonPhone = toCanonicalPhone(phone);
    // Store user with canonical phone (as routes do)
    const userId = await createTestUser({ phone: canonPhone, phoneVerified: true });
    createdUserIds.push(userId);

    await seedOtpToken({
      identifier: canonPhone,
      identifierType: "phone",
      otpType: "login",
      code: "123456",
      userId,
    });

    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ phone, otp: "123456" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    const hasToken = "accessToken" in data || "token" in data;
    expect(hasToken).toBe(true);
  });

  it("returns 401 for a wrong OTP code", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);
    const canonPhone = toCanonicalPhone(phone);

    await seedOtpToken({
      identifier: canonPhone,
      identifierType: "phone",
      otpType: "login",
      code: "123456",
    });

    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ phone, otp: "000000" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 for an expired OTP", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);
    const canonPhone = toCanonicalPhone(phone);

    const { tokenId } = await seedOtpToken({
      identifier: canonPhone,
      identifierType: "phone",
      otpType: "login",
      code: "123456",
    });
    await expireOtpToken(tokenId);

    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ phone, otp: "123456" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 on OTP replay attack (already-used token)", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);
    const canonPhone = toCanonicalPhone(phone);
    const userId = await createTestUser({ phone: canonPhone, phoneVerified: true });
    createdUserIds.push(userId);

    await seedOtpToken({
      identifier: canonPhone,
      identifierType: "phone",
      otpType: "login",
      code: "123456",
      userId,
    });

    // First verify succeeds
    const first = await request(app)
      .post("/api/auth/verify-otp")
      .send({ phone, otp: "123456" })
      .set("Content-Type", "application/json");
    expect(first.status).toBe(200);

    // Re-seed so there's no active token (first verify marks it used)
    // Second attempt with same code — token already used → 401
    const second = await request(app)
      .post("/api/auth/verify-otp")
      .send({ phone, otp: "123456" })
      .set("Content-Type", "application/json");
    expect(second.status).toBe(401);
  });

  it("returns 400 for missing phone", async () => {
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ otp: "123456" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for non-numeric OTP", async () => {
    const phone = generateTestPhone();
    usedPhones.push(phone);

    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ phone, otp: "abcdef" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
