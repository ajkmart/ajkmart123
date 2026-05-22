/**
 * Integration tests — POST /api/wallet/send
 *
 * Strategy:
 *  - SMS/email providers are mocked.
 *  - A sender and receiver user are seeded with known wallet balances.
 *  - X-Idempotency-Key header is provided on all requests.
 *  - Tests exercise: successful transfer, insufficient balance, frozen sender,
 *    unknown receiver, and idempotency replay.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted before all imports) ────────────────────────────────────────
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

vi.mock("../../../modules/otp/otp.deliver.js", () => ({
  deliverOtp: vi.fn().mockResolvedValue({ success: true, usedChannel: "sms" }),
  getAvailableChannels: vi.fn().mockReturnValue(["sms"]),
}));

// ── Imports ────────────────────────────────────────────────────────────────────
import { randomUUID } from "crypto";
import request from "supertest";
import { createServer } from "../../../app.js";
import { signAccessToken } from "../../../middleware/security.js";
import {
  createTestUser,
  deleteTestUser,
  freezeWallet,
  generateTestPhone,
  getWalletBalance,
  seedPlatformSetting,
  setWalletBalance,
  toCanonicalPhone,
} from "../helpers/db-helpers.js";

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("POST /api/wallet/send", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createServer();
    // Ensure wallet feature is enabled
    await seedPlatformSetting("feature_wallet", "on", "Wallet Feature", "features");
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => undefined);
    }
  });

  // ── Successful P2P transfer ───────────────────────────────────────────────

  it("deducts sender balance and credits receiver balance on successful transfer", async () => {
    const senderPhone = toCanonicalPhone(generateTestPhone());
    const receiverPhone = toCanonicalPhone(generateTestPhone());

    const senderId = await createTestUser({ phone: senderPhone, phoneVerified: true });
    const receiverId = await createTestUser({ phone: receiverPhone, phoneVerified: true });
    createdUserIds.push(senderId, receiverId);

    await setWalletBalance(senderId, 1000);
    await setWalletBalance(receiverId, 0);

    const token = signAccessToken(senderId, senderPhone, "customer", "customer");

    const res = await request(app)
      .post("/api/wallet/send")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Idempotency-Key", randomUUID())
      .send({ receiverPhone, amount: 300 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify DB balances
    const senderBal = await getWalletBalance(senderId);
    const receiverBal = await getWalletBalance(receiverId);
    expect(senderBal).toBeCloseTo(700, 1);
    expect(receiverBal).toBeCloseTo(300, 1);
  });

  // ── Insufficient balance ──────────────────────────────────────────────────

  it("returns 422 when sender has insufficient balance", async () => {
    const senderPhone = toCanonicalPhone(generateTestPhone());
    const receiverPhone = toCanonicalPhone(generateTestPhone());

    const senderId = await createTestUser({ phone: senderPhone, phoneVerified: true });
    const receiverId = await createTestUser({ phone: receiverPhone, phoneVerified: true });
    createdUserIds.push(senderId, receiverId);

    await setWalletBalance(senderId, 50); // Less than transfer amount

    const token = signAccessToken(senderId, senderPhone, "customer", "customer");

    const res = await request(app)
      .post("/api/wallet/send")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Idempotency-Key", randomUUID())
      .send({ receiverPhone, amount: 500 });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/[Ii]nsufficient/);

    // Sender balance should be unchanged
    const senderBal = await getWalletBalance(senderId);
    expect(senderBal).toBeCloseTo(50, 1);
  });

  // ── Frozen sender wallet ──────────────────────────────────────────────────

  it("returns 403 when sender wallet is frozen", async () => {
    const senderPhone = toCanonicalPhone(generateTestPhone());
    const receiverPhone = toCanonicalPhone(generateTestPhone());

    const senderId = await createTestUser({ phone: senderPhone, phoneVerified: true });
    const receiverId = await createTestUser({ phone: receiverPhone, phoneVerified: true });
    createdUserIds.push(senderId, receiverId);

    await setWalletBalance(senderId, 1000);
    await freezeWallet(senderId);

    const token = signAccessToken(senderId, senderPhone, "customer", "customer");

    const res = await request(app)
      .post("/api/wallet/send")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Idempotency-Key", randomUUID())
      .send({ receiverPhone, amount: 200 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ── Receiver not found ────────────────────────────────────────────────────

  it("returns 404 when receiver phone number does not exist", async () => {
    const senderPhone = toCanonicalPhone(generateTestPhone());
    const senderId = await createTestUser({ phone: senderPhone, phoneVerified: true });
    createdUserIds.push(senderId);

    await setWalletBalance(senderId, 1000);

    const token = signAccessToken(senderId, senderPhone, "customer", "customer");
    const nonExistentPhone = toCanonicalPhone(generateTestPhone());

    const res = await request(app)
      .post("/api/wallet/send")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Idempotency-Key", randomUUID())
      .send({ receiverPhone: nonExistentPhone, amount: 100 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);

    // Sender balance must not have changed
    const senderBal = await getWalletBalance(senderId);
    expect(senderBal).toBeCloseTo(1000, 1);
  });

  // ── Missing idempotency key ───────────────────────────────────────────────

  it("returns 400 when X-Idempotency-Key header is absent", async () => {
    const senderPhone = toCanonicalPhone(generateTestPhone());
    const receiverPhone = toCanonicalPhone(generateTestPhone());

    const senderId = await createTestUser({ phone: senderPhone, phoneVerified: true });
    const receiverId = await createTestUser({ phone: receiverPhone, phoneVerified: true });
    createdUserIds.push(senderId, receiverId);

    await setWalletBalance(senderId, 1000);

    const token = signAccessToken(senderId, senderPhone, "customer", "customer");

    const res = await request(app)
      .post("/api/wallet/send")
      .set("Authorization", `Bearer ${token}`)
      // No X-Idempotency-Key header
      .send({ receiverPhone, amount: 100 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/[Ii]dempotency/);
  });

  // ── Idempotency replay ────────────────────────────────────────────────────

  it("replays prior response on duplicate idempotency key without re-running the transfer", async () => {
    const senderPhone = toCanonicalPhone(generateTestPhone());
    const receiverPhone = toCanonicalPhone(generateTestPhone());

    const senderId = await createTestUser({ phone: senderPhone, phoneVerified: true });
    const receiverId = await createTestUser({ phone: receiverPhone, phoneVerified: true });
    createdUserIds.push(senderId, receiverId);

    await setWalletBalance(senderId, 1000);
    await setWalletBalance(receiverId, 0);

    const token = signAccessToken(senderId, senderPhone, "customer", "customer");
    const idemKey = randomUUID();

    // First request
    const first = await request(app)
      .post("/api/wallet/send")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Idempotency-Key", idemKey)
      .send({ receiverPhone, amount: 200 });

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    const senderBalAfterFirst = await getWalletBalance(senderId);
    const receiverBalAfterFirst = await getWalletBalance(receiverId);

    // Second request with same key — must replay, no additional transfer
    const second = await request(app)
      .post("/api/wallet/send")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Idempotency-Key", idemKey)
      .send({ receiverPhone, amount: 200 });

    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);

    // Balances should not have changed again
    const senderBalAfterSecond = await getWalletBalance(senderId);
    const receiverBalAfterSecond = await getWalletBalance(receiverId);
    expect(senderBalAfterSecond).toBeCloseTo(senderBalAfterFirst, 1);
    expect(receiverBalAfterSecond).toBeCloseTo(receiverBalAfterFirst, 1);
  });

  // ── Self-transfer ────────────────────────────────────────────────────────

  it("returns 400 when sender tries to send money to themselves", async () => {
    const senderPhone = toCanonicalPhone(generateTestPhone());
    const senderId = await createTestUser({ phone: senderPhone, phoneVerified: true });
    createdUserIds.push(senderId);

    await setWalletBalance(senderId, 1000);
    const token = signAccessToken(senderId, senderPhone, "customer", "customer");

    const res = await request(app)
      .post("/api/wallet/send")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Idempotency-Key", randomUUID())
      .send({ receiverPhone: senderPhone, amount: 100 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/yourself/);
  });

  // ── Unauthenticated ───────────────────────────────────────────────────────

  it("returns 401 for unauthenticated requests", async () => {
    const res = await request(app)
      .post("/api/wallet/send")
      .set("X-Idempotency-Key", randomUUID())
      .send({ receiverPhone: "03001234567", amount: 100 });

    expect(res.status).toBe(401);
  });
});
