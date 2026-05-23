/**
 * Integration tests — POST /api/vendors/wallet/withdraw
 *
 * Strategy:
 *  - A vendor user is seeded with a known wallet balance.
 *  - Two simultaneous withdrawal requests are fired in parallel.
 *  - The SELECT ... FOR UPDATE lock (B-018) must ensure only one succeeds
 *    when both would together exceed the balance, leaving balance >= 0.
 *  - Additional cases: insufficient balance, zero amount, unauthenticated.
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
import request from "supertest";
import { createServer } from "../../../app.js";
import { signAccessToken } from "../../../middleware/security.js";
import {
  createTestUser,
  deleteTestUser,
  generateTestPhone,
  getWalletBalance,
  setWalletBalance,
  toCanonicalPhone,
} from "../helpers/db-helpers.js";

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("POST /api/vendors/wallet/withdraw", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createServer();
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => undefined);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function createVendor(balance: number): Promise<{ id: string; token: string }> {
    const phone = toCanonicalPhone(generateTestPhone());
    const id = await createTestUser({
      phone,
      phoneVerified: true,
      roles: "vendor",
      approvalStatus: "approved",
      walletBalance: balance.toFixed(2),
    });
    createdUserIds.push(id);
    const token = signAccessToken(id, phone, "vendor", "vendor");
    return { id, token };
  }

  // ── Concurrent race condition ──────────────────────────────────────────────

  it("never lets balance go negative when two concurrent withdrawals race for the same funds", async () => {
    const startingBalance = 500;
    const withdrawAmount = 400; // Each request tries to withdraw 400 from 500
    const { id, token } = await createVendor(startingBalance);

    const [res1, res2] = await Promise.all([
      request(app)
        .post("/api/vendors/wallet/withdraw")
        .set("Authorization", `Bearer ${token}`)
        .send({ amount: withdrawAmount, method: "bank_transfer", bankName: "HBL" }),
      request(app)
        .post("/api/vendors/wallet/withdraw")
        .set("Authorization", `Bearer ${token}`)
        .send({ amount: withdrawAmount, method: "bank_transfer", bankName: "HBL" }),
    ]);

    const statuses = [res1.status, res2.status].sort();

    // Exactly one should succeed (201) and one should fail (400 insufficient)
    expect(statuses).toContain(201);
    expect(statuses).toContain(400);

    // Final balance must be >= 0
    const finalBalance = await getWalletBalance(id);
    expect(finalBalance).toBeGreaterThanOrEqual(0);

    // Specifically: only one withdrawal went through so balance = 500 - 400 = 100
    expect(finalBalance).toBeCloseTo(startingBalance - withdrawAmount, 1);
  });

  it("succeeds when withdrawal is within available balance", async () => {
    const { id, token } = await createVendor(1000);

    const res = await request(app)
      .post("/api/vendors/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 300, method: "bank_transfer", bankName: "UBL" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.amount).toBe(300);
    expect(res.body.data.transactionId).toBeTruthy();

    const finalBalance = await getWalletBalance(id);
    expect(finalBalance).toBeCloseTo(700, 1);
  });

  it("returns 400 when withdrawal amount exceeds balance", async () => {
    const { id, token } = await createVendor(100);

    const res = await request(app)
      .post("/api/vendors/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 500, method: "bank_transfer", bankName: "MCB" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/[Ii]nsufficient/);

    // Balance must be unchanged
    const finalBalance = await getWalletBalance(id);
    expect(finalBalance).toBeCloseTo(100, 1);
  });

  it("returns 400 when amount is zero", async () => {
    const { token } = await createVendor(500);

    const res = await request(app)
      .post("/api/vendors/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 0, method: "bank_transfer" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when amount is negative", async () => {
    const { token } = await createVendor(500);

    const res = await request(app)
      .post("/api/vendors/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: -50, method: "bank_transfer" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const res = await request(app)
      .post("/api/vendors/wallet/withdraw")
      .send({ amount: 100, method: "bank_transfer" });

    expect(res.status).toBe(401);
  });

  it("returns 403 when a customer token is used instead of a vendor token", async () => {
    const phone = toCanonicalPhone(generateTestPhone());
    const customerId = await createTestUser({ phone, phoneVerified: true, roles: "customer" });
    createdUserIds.push(customerId);
    const customerToken = signAccessToken(customerId, phone, "customer", "customer");

    const res = await request(app)
      .post("/api/vendors/wallet/withdraw")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ amount: 100, method: "bank_transfer" });

    expect(res.status).toBe(403);
  });
});
