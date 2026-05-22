/**
 * Integration tests — POST /api/auth/magic-link/send  &  POST /api/auth/magic-link/verify
 *
 * Strategy:
 *  - sendMagicLinkEmail is mocked so we can capture the rawToken without
 *    actually sending an email.
 *  - auth_magic_link_enabled is seeded as "on" in platform_settings so
 *    isAuthMethodEnabledStrict passes.
 *  - The rawToken captured from the mock is used directly in magic-link/verify.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted) ────────────────────────────────────────────────────────────
const mockSendMagicLinkEmail = vi.fn();

vi.mock("../../../services/email.js", () => ({
  sendMagicLinkEmail: mockSendMagicLinkEmail,
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  alertNewVendor: vi.fn().mockResolvedValue(undefined),
  isEmailProviderConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("../../../modules/otp/otp.deliver.js", () => ({
  deliverOtp: vi.fn().mockResolvedValue({ success: true, usedChannel: "sms" }),
  getAvailableChannels: vi.fn().mockReturnValue(["sms"]),
}));

vi.mock("../../../services/sms.js", () => ({
  sendOtpSMS: vi.fn().mockResolvedValue({ success: true }),
  isSMSProviderConfigured: vi.fn().mockReturnValue(false),
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

// ── Imports ────────────────────────────────────────────────────────────────────
import request from "supertest";
import { createServer } from "../../../app.js";
import {
  cleanupMagicLinkTokens,
  cleanupRefreshTokens,
  createTestUser,
  deletePlatformSetting,
  deleteTestUser,
  generateTestEmail,
  seedPlatformSetting,
} from "../helpers/db-helpers.js";

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("Magic Link — send & verify", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createServer();
    // Enable magic link auth method for all tests in this suite
    await seedPlatformSetting("auth_magic_link_enabled", "on", "Magic Link Login", "auth");
  });

  afterAll(async () => {
    await deletePlatformSetting("auth_magic_link_enabled").catch(() => undefined);
    for (const userId of createdUserIds) {
      await cleanupMagicLinkTokens(userId).catch(() => undefined);
      await cleanupRefreshTokens(userId).catch(() => undefined);
      await deleteTestUser(userId).catch(() => undefined);
    }
  });

  afterEach(() => {
    mockSendMagicLinkEmail.mockClear();
  });

  // ── magic-link/send ──────────────────────────────────────────────────────────

  describe("POST /api/auth/magic-link/send", () => {
    it("returns 200 for a registered email (captures rawToken in mock)", async () => {
      const email = generateTestEmail();
      const userId = await createTestUser({ email, emailVerified: false });
      createdUserIds.push(userId);

      let capturedToken: string | null = null;
      mockSendMagicLinkEmail.mockImplementation(async (toEmail: string, token: string) => {
        capturedToken = token;
      });

      const res = await request(app)
        .post("/api/auth/magic-link/send")
        .send({ email })
        .set("Content-Type", "application/json");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSendMagicLinkEmail).toHaveBeenCalledOnce();
      expect(capturedToken).not.toBeNull();
      expect(typeof capturedToken).toBe("string");
      expect((capturedToken as unknown as string).length).toBeGreaterThan(10);
    });

    it("returns 200 for an unregistered email (anti-enumeration)", async () => {
      const email = generateTestEmail();

      const res = await request(app)
        .post("/api/auth/magic-link/send")
        .send({ email })
        .set("Content-Type", "application/json");

      // Must always respond 200 to prevent account enumeration
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Email should NOT have been sent (no user found)
      expect(mockSendMagicLinkEmail).not.toHaveBeenCalled();
    });

    it("returns 400 for a missing email", async () => {
      const res = await request(app)
        .post("/api/auth/magic-link/send")
        .send({})
        .set("Content-Type", "application/json");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 for an invalid email format", async () => {
      const res = await request(app)
        .post("/api/auth/magic-link/send")
        .send({ email: "not-an-email" })
        .set("Content-Type", "application/json");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ── magic-link/verify ────────────────────────────────────────────────────────

  describe("POST /api/auth/magic-link/verify", () => {
    it("returns 200 with a JWT token for a valid magic link token", async () => {
      const email = generateTestEmail();
      const userId = await createTestUser({ email, emailVerified: false, isActive: true });
      createdUserIds.push(userId);

      let capturedToken: string | null = null;
      mockSendMagicLinkEmail.mockImplementation(async (_email: string, token: string) => {
        capturedToken = token;
      });

      // Send the magic link
      const sendRes = await request(app)
        .post("/api/auth/magic-link/send")
        .send({ email })
        .set("Content-Type", "application/json");
      expect(sendRes.status).toBe(200);
      expect(capturedToken).not.toBeNull();

      // Verify the magic link
      const verifyRes = await request(app)
        .post("/api/auth/magic-link/verify")
        .send({ token: capturedToken })
        .set("Content-Type", "application/json");

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      const data = verifyRes.body.data;
      const hasToken = "token" in data || "accessToken" in data;
      expect(hasToken).toBe(true);
    });

    it("returns 401 for an invalid magic link token", async () => {
      const res = await request(app)
        .post("/api/auth/magic-link/verify")
        .send({ token: "invalid_token_that_does_not_exist_in_db" })
        .set("Content-Type", "application/json");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("returns 401 for a token that has already been used", async () => {
      const email = generateTestEmail();
      const userId = await createTestUser({ email, emailVerified: false, isActive: true });
      createdUserIds.push(userId);

      let capturedToken: string | null = null;
      mockSendMagicLinkEmail.mockImplementation(async (_email: string, token: string) => {
        capturedToken = token;
      });

      await request(app)
        .post("/api/auth/magic-link/send")
        .send({ email })
        .set("Content-Type", "application/json");
      expect(capturedToken).not.toBeNull();

      // First verify — should succeed
      const firstVerify = await request(app)
        .post("/api/auth/magic-link/verify")
        .send({ token: capturedToken })
        .set("Content-Type", "application/json");
      expect(firstVerify.status).toBe(200);

      // Second verify — token already used → 401
      const secondVerify = await request(app)
        .post("/api/auth/magic-link/verify")
        .send({ token: capturedToken })
        .set("Content-Type", "application/json");
      expect(secondVerify.status).toBe(401);
      expect(secondVerify.body.success).toBe(false);
    });

    it("returns 400 when the token field is absent", async () => {
      const res = await request(app)
        .post("/api/auth/magic-link/verify")
        .send({})
        .set("Content-Type", "application/json");

      expect([400, 401]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 when magic link auth method is disabled", async () => {
      // Temporarily disable the feature
      await seedPlatformSetting("auth_magic_link_enabled", "off");

      const res = await request(app)
        .post("/api/auth/magic-link/verify")
        .send({ token: "any_token" })
        .set("Content-Type", "application/json");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error ?? res.body.message).toMatch(/disabled/i);

      // Restore
      await seedPlatformSetting("auth_magic_link_enabled", "on");
    });
  });
});
