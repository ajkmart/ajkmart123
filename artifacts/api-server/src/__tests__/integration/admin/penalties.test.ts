/**
 * Integration tests — Rider penalty add / remove / balance system
 *
 * Routes under test:
 *   POST   /api/admin/riders/:id/penalties
 *   DELETE /api/admin/riders/:id/penalties/:pid
 *   GET    /api/admin/riders/:id/penalties
 *
 * Strategy:
 *  - All external providers (SMS, email, OTP delivery) are mocked.
 *  - CSRF middleware is bypassed via a mock of admin-auth.ts.
 *  - sendUserNotification is mocked so push/notification calls are silent.
 *  - A rider user is seeded with a known wallet balance before each test.
 *  - DB state (wallet balance, transactions, penalty rows) is verified directly.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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

vi.mock("../../../middleware/admin-auth.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../../middleware/admin-auth.js")>();
  return {
    ...mod,
    csrfProtection: (_req: unknown, _res: unknown, next: () => void) => next(),
  };
});

vi.mock("../../../routes/admin-shared.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../../routes/admin-shared.js")>();
  return { ...mod, sendUserNotification: vi.fn().mockResolvedValue(undefined) };
});

// ── Imports ────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import request from "supertest";
import { db } from "@workspace/db";
import { walletTransactionsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { createServer } from "../../../app.js";
import { sendUserNotification } from "../../../routes/admin-shared.js";
import { signAccessToken } from "../../../utils/admin-jwt.js";
import {
  cleanupRiderPenalties,
  cleanupWalletTransactions,
  createTestAdmin,
  createTestUser,
  deleteTestAdmin,
  deleteTestUser,
  generateTestPhone,
  getPenaltyById,
  getWalletBalance,
  setWalletBalance,
} from "../helpers/db-helpers.js";

// ── Shared setup ───────────────────────────────────────────────────────────────

let app: Awaited<ReturnType<typeof createServer>>;
let adminId: string;
let adminToken: string;
let riderId: string;

beforeAll(async () => {
  app = await createServer();

  adminId = await createTestAdmin({ role: "super", name: "Penalty Test Admin" });
  adminToken = signAccessToken(adminId, "super", "Penalty Test Admin");

  riderId = await createTestUser({
    phone: generateTestPhone(),
    name: "Test Rider",
    roles: "rider",
    walletBalance: "0",
  });
});

afterAll(async () => {
  await cleanupRiderPenalties(riderId);
  await cleanupWalletTransactions(riderId);
  await deleteTestUser(riderId);
  await deleteTestAdmin(adminId);
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanupRiderPenalties(riderId);
  await cleanupWalletTransactions(riderId);
  await setWalletBalance(riderId, 0);
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function authPost(path: string) {
  return request(app)
    .post(path)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Request-Id", randomUUID());
}

function authDelete(path: string) {
  return request(app)
    .delete(path)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Request-Id", randomUUID());
}

function authGet(path: string) {
  return request(app)
    .get(path)
    .set("Authorization", `Bearer ${adminToken}`);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("POST /api/admin/riders/:id/penalties", () => {
  it("debits the rider wallet and creates a debit transaction", async () => {
    await setWalletBalance(riderId, 500);

    const res = await authPost(`/api/admin/riders/${riderId}/penalties`)
      .send({ type: "manual", amount: 200, reason: "Test deduction" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.penalty).toBeDefined();
    expect(res.body.penalty.amount).toBe(200);

    const penaltyId = res.body.penalty.id as string;
    expect(penaltyId).toBeTruthy();

    const dbPenalty = await getPenaltyById(penaltyId);
    expect(dbPenalty).not.toBeNull();
    expect(dbPenalty!.riderId).toBe(riderId);
    expect(parseFloat(String(dbPenalty!.amount))).toBe(200);
    expect(dbPenalty!.type).toBe("manual");
    expect(dbPenalty!.reason).toBe("Test deduction");

    const balance = await getWalletBalance(riderId);
    expect(balance).toBe(300);

    const [tx] = await db
      .select()
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, riderId),
          eq(walletTransactionsTable.reference, `penalty_${penaltyId}`)
        )
      )
      .limit(1);
    expect(tx).toBeDefined();
    expect(tx!.type).toBe("debit");
    expect(parseFloat(String(tx!.amount))).toBe(200);

    const notifyMock = vi.mocked(sendUserNotification);
    expect(notifyMock).toHaveBeenCalledOnce();
    expect(notifyMock).toHaveBeenCalledWith(
      riderId,
      "Penalty Applied ⚠️",
      expect.stringContaining("200"),
      expect.any(String),
      expect.any(String)
    );
  });

  it("does not go below zero when penalty exceeds balance", async () => {
    await setWalletBalance(riderId, 50);

    const res = await authPost(`/api/admin/riders/${riderId}/penalties`)
      .send({ type: "cancel", amount: 200, reason: "Cancellation penalty" });

    expect(res.status).toBe(201);

    const balance = await getWalletBalance(riderId);
    expect(balance).toBeGreaterThanOrEqual(0);
  });

  it("creates the penalty row but skips wallet debit when amount is 0", async () => {
    await setWalletBalance(riderId, 300);

    const res = await authPost(`/api/admin/riders/${riderId}/penalties`)
      .send({ type: "warning", amount: 0, reason: "Formal warning" });

    expect(res.status).toBe(201);
    expect(res.body.penalty.amount).toBe(0);

    const balance = await getWalletBalance(riderId);
    expect(balance).toBe(300);

    const penaltyId = res.body.penalty.id as string;
    const txRows = await db
      .select()
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, riderId),
          eq(walletTransactionsTable.reference, `penalty_${penaltyId}`)
        )
      );
    expect(txRows).toHaveLength(0);
  });

  it("accepts a penalty without an explicit reason", async () => {
    await setWalletBalance(riderId, 100);

    const res = await authPost(`/api/admin/riders/${riderId}/penalties`)
      .send({ type: "manual", amount: 50 });

    expect(res.status).toBe(201);
    expect(res.body.penalty.amount).toBe(50);
    expect(res.body.penalty.reason).toBeNull();
  });

  it("returns 404 for a non-existent rider", async () => {
    const res = await authPost(`/api/admin/riders/nonexistent_rider_xyz/penalties`)
      .send({ type: "manual", amount: 100 });

    expect(res.status).toBe(404);
  });

  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app)
      .post(`/api/admin/riders/${riderId}/penalties`)
      .send({ type: "manual", amount: 100 });

    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/admin/riders/:id/penalties/:pid", () => {
  it("removes the penalty and credits the wallet back", async () => {
    await setWalletBalance(riderId, 500);

    const addRes = await authPost(`/api/admin/riders/${riderId}/penalties`)
      .send({ type: "manual", amount: 200, reason: "Reversal test" });
    expect(addRes.status).toBe(201);

    const penaltyId = addRes.body.penalty.id as string;
    const balanceAfterPenalty = await getWalletBalance(riderId);
    expect(balanceAfterPenalty).toBe(300);

    const delRes = await authDelete(`/api/admin/riders/${riderId}/penalties/${penaltyId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const dbPenalty = await getPenaltyById(penaltyId);
    expect(dbPenalty).toBeNull();

    const balanceAfterReversal = await getWalletBalance(riderId);
    expect(balanceAfterReversal).toBe(500);

    const [creditTx] = await db
      .select()
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, riderId),
          eq(walletTransactionsTable.reference, `penalty_reversal_${penaltyId}`)
        )
      )
      .limit(1);
    expect(creditTx).toBeDefined();
    expect(creditTx!.type).toBe("credit");
    expect(parseFloat(String(creditTx!.amount))).toBe(200);

    const notifyMock = vi.mocked(sendUserNotification);
    expect(notifyMock).toHaveBeenLastCalledWith(
      riderId,
      "Penalty Reversed ✅",
      expect.stringContaining("200"),
      expect.any(String),
      expect.any(String)
    );
  });

  it("removes a zero-amount penalty without any wallet change", async () => {
    await setWalletBalance(riderId, 400);

    const addRes = await authPost(`/api/admin/riders/${riderId}/penalties`)
      .send({ type: "warning", amount: 0 });
    expect(addRes.status).toBe(201);

    const penaltyId = addRes.body.penalty.id as string;

    const delRes = await authDelete(`/api/admin/riders/${riderId}/penalties/${penaltyId}`);
    expect(delRes.status).toBe(200);

    const balance = await getWalletBalance(riderId);
    expect(balance).toBe(400);

    const creditTxRows = await db
      .select()
      .from(walletTransactionsTable)
      .where(
        and(
          eq(walletTransactionsTable.userId, riderId),
          eq(walletTransactionsTable.reference, `penalty_reversal_${penaltyId}`)
        )
      );
    expect(creditTxRows).toHaveLength(0);
  });

  it("returns 404 when penalty does not exist", async () => {
    const res = await authDelete(`/api/admin/riders/${riderId}/penalties/nonexistent_penalty_xyz`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when penalty belongs to a different rider", async () => {
    const otherRiderId = await createTestUser({
      phone: generateTestPhone(),
      roles: "rider",
      walletBalance: "100",
    });

    try {
      const addRes = await authPost(`/api/admin/riders/${otherRiderId}/penalties`)
        .send({ type: "manual", amount: 50 });
      expect(addRes.status).toBe(201);
      const penaltyId = addRes.body.penalty.id as string;

      const res = await authDelete(`/api/admin/riders/${riderId}/penalties/${penaltyId}`);
      expect(res.status).toBe(404);

      await cleanupRiderPenalties(otherRiderId);
    } finally {
      await cleanupWalletTransactions(otherRiderId);
      await deleteTestUser(otherRiderId);
    }
  });
});

describe("GET /api/admin/riders/:id/penalties", () => {
  it("returns a list of penalties for a rider", async () => {
    await setWalletBalance(riderId, 500);

    await authPost(`/api/admin/riders/${riderId}/penalties`)
      .send({ type: "cancel", amount: 100, reason: "Late cancellation" });
    await authPost(`/api/admin/riders/${riderId}/penalties`)
      .send({ type: "warning", amount: 0, reason: "First warning" });

    const res = await authGet(`/api/admin/riders/${riderId}/penalties`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.penalties)).toBe(true);
    expect(res.body.data.penalties.length).toBe(2);

    const types = res.body.data.penalties.map((p: { type: string }) => p.type);
    expect(types).toContain("cancel");
    expect(types).toContain("warning");
  });

  it("returns an empty list for a rider with no penalties", async () => {
    const res = await authGet(`/api/admin/riders/${riderId}/penalties`);

    expect(res.status).toBe(200);
    expect(res.body.data.penalties).toHaveLength(0);
  });

  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app).get(`/api/admin/riders/${riderId}/penalties`);
    expect(res.status).toBe(401);
  });
});
