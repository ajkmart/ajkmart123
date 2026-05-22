/**
 * Wallet Integration Tests
 *
 * Covers auth guards, input validation, admin top-up, and rate limiting
 * for the wallet subsystem. No external network calls are required for
 * validation tests — all assertions target the Express request/response
 * layer or the local PostgreSQL DB seeded in beforeAll.
 *
 * Note on auth-guard response format:
 *   customerAuth returns { error: "..." } (no success field).
 *   adminAuth    returns { error: "..." } (no success field).
 *   Both are detected via HTTP status code; this suite does not assert
 *   success: false on those bare 401 responses.
 *
 * Run from artifacts/api-server:
 *   pnpm test
 */

import { randomUUID } from "crypto";
import type { Express } from "express";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_CUSTOMER_ID = "test-wallet-customer-e2e-001";
const TEST_CUSTOMER_PHONE = "+929990000011";

let app: Express;
let customerToken: string;
let adminToken: string;

beforeAll(async () => {
  const { createServer } = await import("../app.js");
  const { signUserJwt } = await import("../middleware/security.js");
  const { signAccessToken } = await import("../utils/admin-jwt.js");
  const { db } = await import("@workspace/db");
  const { usersTable } = await import("@workspace/db/schema");
  const { eq } = await import("drizzle-orm");

  app = (await createServer()) as any;

  customerToken = signUserJwt(TEST_CUSTOMER_ID, TEST_CUSTOMER_PHONE, "customer", "customer", 1);

  adminToken = signAccessToken("test-admin-wallet-e2e", "super", "Wallet Test Admin Bot", []);

  await db.delete(usersTable).where(eq(usersTable.id, TEST_CUSTOMER_ID));
  const now = new Date();
  await db.insert(usersTable).values({
    id: TEST_CUSTOMER_ID,
    phone: TEST_CUSTOMER_PHONE,
    name: "Test Wallet Customer",
    roles: "customer",
    approvalStatus: "approved",
    kycStatus: "verified",
    isActive: true,
    walletBalance: "5000.00",
    createdAt: now,
    updatedAt: now,
  });
}, 30_000);

afterAll(async () => {
  try {
    const { db } = await import("@workspace/db");
    const { usersTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(usersTable).where(eq(usersTable.id, TEST_CUSTOMER_ID));
  } catch (err) {
    console.warn("[wallet teardown] best-effort DB cleanup failed:", err);
  }
});

function api() {
  return supertest(app);
}

// ─── Auth guards ────────────────────────────────────────────────────────────

describe("Wallet auth guards — unauthenticated requests return 401", () => {
  it("GET /api/wallet returns 401 without token", async () => {
    const res = await api().get("/api/wallet");
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it("POST /api/wallet/deposit returns 401 without token", async () => {
    const res = await api()
      .post("/api/wallet/deposit")
      .send({
        amount: 500,
        paymentMethod: "jazzcash",
        transactionId: "TX123",
        idempotencyKey: randomUUID(),
      })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it("POST /api/wallet/send returns 401 without token", async () => {
    const res = await api()
      .post("/api/wallet/send")
      .send({ receiverPhone: "+923001234567", amount: 100 })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it("POST /api/wallet/withdraw returns 401 without token", async () => {
    const res = await api()
      .post("/api/wallet/withdraw")
      .send({ amount: 500, paymentMethod: "bank", accountNumber: "PK12345" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });
});

// ─── Balance fetch ──────────────────────────────────────────────────────────

describe("Wallet balance fetch", () => {
  it("GET /api/wallet returns 200 with balance and transactions for authenticated customer", async () => {
    const res = await api().get("/api/wallet").set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data?.balance).toBe("number");
    expect(Array.isArray(res.body.data?.transactions)).toBe(true);
  });
});

// ─── Deposit validation ─────────────────────────────────────────────────────

describe("Wallet deposit input validation", () => {
  it("POST /api/wallet/deposit with missing body returns 400/422", async () => {
    const res = await api()
      .post("/api/wallet/deposit")
      .send({})
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/wallet/deposit with negative amount returns 400/422", async () => {
    const res = await api()
      .post("/api/wallet/deposit")
      .send({
        amount: -100,
        paymentMethod: "jazzcash",
        transactionId: "TX001",
        idempotencyKey: randomUUID(),
      })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/wallet/deposit with non-numeric amount returns 400/422", async () => {
    const res = await api()
      .post("/api/wallet/deposit")
      .send({
        amount: "abc",
        paymentMethod: "jazzcash",
        transactionId: "TX002",
        idempotencyKey: randomUUID(),
      })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/wallet/deposit with missing idempotencyKey returns 400/422", async () => {
    const res = await api()
      .post("/api/wallet/deposit")
      .send({ amount: 500, paymentMethod: "jazzcash", transactionId: "TX003" })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

// ─── P2P send validation ───────────────────────────────────────────────────

describe("Wallet P2P send input validation", () => {
  it("POST /api/wallet/send with missing receiver and ajkId returns 400/422", async () => {
    const res = await api()
      .post("/api/wallet/send")
      .send({ amount: 100 })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("X-Idempotency-Key", randomUUID());
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/wallet/send with missing amount returns 400/422", async () => {
    const res = await api()
      .post("/api/wallet/send")
      .send({ receiverPhone: "+923001234567" })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("X-Idempotency-Key", randomUUID());
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/wallet/send with negative amount returns 400/422", async () => {
    const res = await api()
      .post("/api/wallet/send")
      .send({ receiverPhone: "+923001234567", amount: -50 })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("X-Idempotency-Key", randomUUID());
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/wallet/send missing X-Idempotency-Key header returns 400/422", async () => {
    const res = await api()
      .post("/api/wallet/send")
      .send({ receiverPhone: "+923001234567", amount: 100 })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/wallet/send to own phone (self-send) returns 400/422", async () => {
    const res = await api()
      .post("/api/wallet/send")
      .send({ receiverPhone: TEST_CUSTOMER_PHONE, amount: 100 })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("X-Idempotency-Key", randomUUID());
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

// ─── Withdraw validation ────────────────────────────────────────────────────

describe("Wallet withdraw input validation", () => {
  it("POST /api/wallet/withdraw with missing body returns 400/422", async () => {
    const res = await api()
      .post("/api/wallet/withdraw")
      .send({})
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/wallet/withdraw with missing accountNumber returns 400/422", async () => {
    const res = await api()
      .post("/api/wallet/withdraw")
      .send({ amount: 500, paymentMethod: "bank" })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/wallet/withdraw with amount exceeding realistic limit returns 400/422/403", async () => {
    const res = await api()
      .post("/api/wallet/withdraw")
      .send({ amount: 9_999_999, paymentMethod: "bank", accountNumber: "PK12345" })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([400, 422, 403]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

// ─── Admin top-up ────────────────────────────────────────────────────────────

describe("Wallet admin top-up", () => {
  it("POST /api/wallet/topup with valid admin token and valid amount returns 200", async () => {
    const res = await api()
      .post("/api/wallet/topup")
      .send({ userId: TEST_CUSTOMER_ID, amount: 200 })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data?.balance).toBe("number");
  });

  it("POST /api/wallet/topup with customer token returns 401", async () => {
    const res = await api()
      .post("/api/wallet/topup")
      .send({ userId: TEST_CUSTOMER_ID, amount: 200 })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([401, 403]).toContain(res.status);
    expect(res.body.error).toBeDefined();
  });

  it("POST /api/wallet/topup without token returns 401", async () => {
    const res = await api()
      .post("/api/wallet/topup")
      .send({ userId: TEST_CUSTOMER_ID, amount: 200 })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });
});

// ─── Rate limit smoke ────────────────────────────────────────────────────────

describe("Wallet rate limit smoke test", () => {
  it("35 rapid POST /api/wallet/deposit requests from same IP returns at least one 429", async () => {
    const requests = Array.from({ length: 35 }, () =>
      api()
        .post("/api/wallet/deposit")
        .send({
          amount: 500,
          paymentMethod: "jazzcash",
          transactionId: `TX-rl-${randomUUID()}`,
          idempotencyKey: randomUUID(),
        })
        .set("Content-Type", "application/json")
        .set("Authorization", `Bearer ${customerToken}`)
        .then((res) => res.status)
    );

    const statuses = await Promise.all(requests);
    const has429 = statuses.some((s) => s === 429);
    expect(
      has429,
      `Expected at least one 429 among statuses [${[...new Set(statuses)].join(", ")}]`
    ).toBe(true);
  }, 20_000);
});
