/**
 * Integration tests — POST /api/wallet/deposit
 *
 * Strategy:
 *  - SMS/email providers are mocked so no real messages are sent.
 *  - A real test user is seeded in the DB and authenticated via JWT.
 *  - A payment method (jazzcash) is enabled via platform_settings.
 *  - Tests exercise: happy path, frozen wallet rejection, wallet-disabled rejection,
 *    invalid input, disabled payment method, and idempotency replay.
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
import { db } from "@workspace/db";
import { walletTransactionsTable } from "@workspace/db/schema";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createServer } from "../../../app.js";
import { invalidateSettingsCache, signAccessToken } from "../../../middleware/security.js";
import {
  createTestUser,
  deletePlatformSetting,
  deleteTestUser,
  freezeWallet,
  generateTestPhone,
  seedPlatformSetting,
  toCanonicalPhone,
} from "../helpers/db-helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDepositBody(overrides: Record<string, unknown> = {}) {
  return {
    amount: 500,
    paymentMethod: "jazzcash",
    transactionId: `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("POST /api/wallet/deposit", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createServer();
    // Enable jazzcash and explicitly disable easypaisa for all tests in this suite
    await seedPlatformSetting("jazzcash_enabled", "on", "JazzCash Enabled", "payments");
    await seedPlatformSetting("easypaisa_enabled", "off", "EasyPaisa Enabled", "payments");
    await seedPlatformSetting("bank_enabled", "off", "Bank Enabled", "payments");
    await seedPlatformSetting("feature_wallet", "on", "Wallet Feature", "features");
    // Bust the in-process settings cache so routes read the newly-seeded values
    invalidateSettingsCache();
  });

  afterAll(async () => {
    await deletePlatformSetting("jazzcash_enabled").catch(() => undefined);
    await deletePlatformSetting("easypaisa_enabled").catch(() => undefined);
    await deletePlatformSetting("bank_enabled").catch(() => undefined);
    for (const userId of createdUserIds) {
      await deleteTestUser(userId).catch(() => undefined);
    }
  });

  // ── Frozen wallet ──────────────────────────────────────────────────────────

  it("returns 403 when the customer wallet is frozen", async () => {
    const phone = toCanonicalPhone(generateTestPhone());
    const userId = await createTestUser({ phone, phoneVerified: true });
    createdUserIds.push(userId);
    await freezeWallet(userId);

    const token = signAccessToken(userId, phone, "customer", "customer");

    const res = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send(makeDepositBody());

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/frozen/i);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("returns 200 and creates a pending transaction on valid deposit", async () => {
    const phone = toCanonicalPhone(generateTestPhone());
    const userId = await createTestUser({ phone, phoneVerified: true });
    createdUserIds.push(userId);

    const token = signAccessToken(userId, phone, "customer", "customer");

    const body = makeDepositBody();
    const res = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify a pending transaction was created in the DB
    const txns = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.userId, userId));

    expect(txns.length).toBeGreaterThan(0);
    const tx = txns.find((t) => t.reference?.includes("pending:"));
    expect(tx).toBeDefined();
    expect(tx!.type).toBe("credit");
    expect(parseFloat(tx!.amount)).toBe(500);
  });

  it("includes the transactionId in the response body", async () => {
    const phone = toCanonicalPhone(generateTestPhone());
    const userId = await createTestUser({ phone, phoneVerified: true });
    createdUserIds.push(userId);

    const token = signAccessToken(userId, phone, "customer", "customer");
    const body = makeDepositBody();

    const res = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(200);
    // sendSuccess wraps data: { success: true, data: { transactionId: ... } }
    expect(res.body.data?.transactionId ?? res.body.transactionId).toBeTruthy();
  });

  // ── Wallet feature disabled ────────────────────────────────────────────────

  it("returns 503 when wallet feature is disabled", async () => {
    const phone = toCanonicalPhone(generateTestPhone());
    const userId = await createTestUser({ phone, phoneVerified: true });
    createdUserIds.push(userId);

    // Temporarily disable the wallet feature
    await seedPlatformSetting("feature_wallet", "off", "Wallet Feature", "features");
    invalidateSettingsCache();

    const token = signAccessToken(userId, phone, "customer", "customer");

    const res = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send(makeDepositBody());

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);

    // Restore for subsequent tests
    await seedPlatformSetting("feature_wallet", "on", "Wallet Feature", "features");
    invalidateSettingsCache();
  });

  // ── Missing / invalid fields ───────────────────────────────────────────────

  it("returns 400 when transactionId is missing", async () => {
    const phone = toCanonicalPhone(generateTestPhone());
    const userId = await createTestUser({ phone, phoneVerified: true });
    createdUserIds.push(userId);

    const token = signAccessToken(userId, phone, "customer", "customer");
    const { transactionId: _t, ...bodyWithout } = makeDepositBody();

    const res = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send(bodyWithout);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when amount is negative", async () => {
    const phone = toCanonicalPhone(generateTestPhone());
    const userId = await createTestUser({ phone, phoneVerified: true });
    createdUserIds.push(userId);

    const token = signAccessToken(userId, phone, "customer", "customer");

    const res = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send(makeDepositBody({ amount: -100 }));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when idempotencyKey is not a UUID", async () => {
    const phone = toCanonicalPhone(generateTestPhone());
    const userId = await createTestUser({ phone, phoneVerified: true });
    createdUserIds.push(userId);

    const token = signAccessToken(userId, phone, "customer", "customer");

    const res = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send(makeDepositBody({ idempotencyKey: "not-a-uuid" }));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const res = await request(app).post("/api/wallet/deposit").send(makeDepositBody());

    expect(res.status).toBe(401);
  });

  // ── Disabled payment method ───────────────────────────────────────────────

  it("returns 400 when payment method is not enabled", async () => {
    const phone = toCanonicalPhone(generateTestPhone());
    const userId = await createTestUser({ phone, phoneVerified: true });
    createdUserIds.push(userId);

    const token = signAccessToken(userId, phone, "customer", "customer");

    // easypaisa is seeded as "off" in beforeAll — cache is already busted
    const res = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send(makeDepositBody({ paymentMethod: "easypaisa" }));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not enabled/);
  });

  // ── Idempotency replay ────────────────────────────────────────────────────

  it("replays stored response on duplicate idempotency key without creating a new DB row", async () => {
    const phone = toCanonicalPhone(generateTestPhone());
    const userId = await createTestUser({ phone, phoneVerified: true });
    createdUserIds.push(userId);

    const token = signAccessToken(userId, phone, "customer", "customer");
    const body = makeDepositBody();

    // First request
    const first = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    // Count transactions after first request
    const txnsAfterFirst = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.userId, userId));
    const countAfterFirst = txnsAfterFirst.length;

    // Second request with same idempotency key — must replay, no new DB row
    const second = await request(app)
      .post("/api/wallet/deposit")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);

    const txnsAfterSecond = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.userId, userId));
    expect(txnsAfterSecond.length).toBe(countAfterFirst);
  });
});
