/**
 * Rides Integration Tests
 *
 * Covers public endpoint health, fare estimation, auth guards, booking
 * validation, cancellation, and rider-side OTP entry for the rides subsystem.
 * No external routing API calls are required — fare estimation falls back
 * to the haversine formula when no external routing provider is configured.
 *
 * Run from artifacts/api-server:
 *   pnpm test
 */

import type { Express } from "express";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FALLBACK_JWT_SECRET = "rides_test_secret_placeholder_32chars____";
const FALLBACK_ADMIN_SECRET = "rides_admin_test_placeholder_32chars_____";
const FALLBACK_ADMIN_ACCESS_SECRET = "rides_admin_access_test_placeholder_32ch_";

const TEST_CUSTOMER_ID = "test-rides-customer-e2e-002";
const TEST_CUSTOMER_PHONE = "+929990000022";

const TEST_RIDER_ID = "test-rides-rider-e2e-002";
const TEST_RIDER_PHONE = "+929990000033";

let app: Express;
let customerToken: string;
let riderToken: string;

beforeAll(async () => {
  process.env["JWT_SECRET"] ??= FALLBACK_JWT_SECRET;
  process.env["ADMIN_JWT_SECRET"] ??= FALLBACK_ADMIN_SECRET;
  process.env["ADMIN_ACCESS_TOKEN_SECRET"] ??= FALLBACK_ADMIN_ACCESS_SECRET;
  process.env["ADMIN_REFRESH_TOKEN_SECRET"] ??= FALLBACK_ADMIN_ACCESS_SECRET;
  process.env["ADMIN_CSRF_SECRET"] ??= FALLBACK_ADMIN_ACCESS_SECRET;

  const { createServer } = await import("../app.js");
  const { signUserJwt } = await import("../middleware/security.js");
  const { db } = await import("@workspace/db");
  const { usersTable } = await import("@workspace/db/schema");
  const { eq } = await import("drizzle-orm");

  app = (await createServer()) as any;

  customerToken = signUserJwt(TEST_CUSTOMER_ID, TEST_CUSTOMER_PHONE, "customer", "customer", 1);
  riderToken = signUserJwt(TEST_RIDER_ID, TEST_RIDER_PHONE, "rider", "rider", 1);

  const now = new Date();

  await db.delete(usersTable).where(eq(usersTable.id, TEST_CUSTOMER_ID));
  await db.insert(usersTable).values({
    id: TEST_CUSTOMER_ID,
    phone: TEST_CUSTOMER_PHONE,
    name: "Test Rides Customer",
    roles: "customer",
    approvalStatus: "approved",
    kycStatus: "verified",
    isActive: true,
    walletBalance: "2000.00",
    createdAt: now,
    updatedAt: now,
  });

  await db.delete(usersTable).where(eq(usersTable.id, TEST_RIDER_ID));
  await db.insert(usersTable).values({
    id: TEST_RIDER_ID,
    phone: TEST_RIDER_PHONE,
    name: "Test Rides Rider",
    roles: "rider",
    approvalStatus: "approved",
    kycStatus: "verified",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}, 30_000);

afterAll(async () => {
  try {
    const { db } = await import("@workspace/db");
    const { usersTable } = await import("@workspace/db/schema");
    const { eq, or } = await import("drizzle-orm");
    await db
      .delete(usersTable)
      .where(or(eq(usersTable.id, TEST_CUSTOMER_ID), eq(usersTable.id, TEST_RIDER_ID)));
  } catch (err) {
    console.warn("[rides teardown] best-effort DB cleanup failed:", err);
  }
});

function api() {
  return supertest(app);
}

// ─── Public endpoints ────────────────────────────────────────────────────────

describe("Rides public endpoints", () => {
  it("GET /api/rides/services returns 200 with a services array", async () => {
    const res = await api().get("/api/rides/services");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data?.services)).toBe(true);
  });

  it("GET /api/rides/payment-methods returns 200 with a methods array", async () => {
    const res = await api().get("/api/rides/payment-methods");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data?.methods)).toBe(true);
  });
});

// ─── Fare estimate ───────────────────────────────────────────────────────────

describe("Rides fare estimate", () => {
  it("POST /api/rides/estimate with valid lat/lng returns 200 with fare", async () => {
    const res = await api()
      .post("/api/rides/estimate")
      .send({
        pickupLat: 33.7294,
        pickupLng: 73.3825,
        dropLat: 33.6007,
        dropLng: 73.0679,
        type: "bike",
      })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data?.fare).toBe("number");
    expect(res.body.data?.fare).toBeGreaterThan(0);
  });

  it("POST /api/rides/estimate with missing pickupLat returns 400/422", async () => {
    const res = await api()
      .post("/api/rides/estimate")
      .send({ pickupLng: 73.3825, dropLat: 33.6007, dropLng: 73.0679 })
      .set("Content-Type", "application/json");
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/rides/estimate with missing all coords returns 400/422", async () => {
    const res = await api()
      .post("/api/rides/estimate")
      .send({})
      .set("Content-Type", "application/json");
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/rides/estimate with non-numeric coords returns 400/422", async () => {
    const res = await api()
      .post("/api/rides/estimate")
      .send({ pickupLat: "not-a-number", pickupLng: "x", dropLat: "y", dropLng: "z" })
      .set("Content-Type", "application/json");
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

// ─── Auth guards ─────────────────────────────────────────────────────────────

describe("Rides auth guards — unauthenticated requests return 401", () => {
  it("POST /api/rides without token returns 401", async () => {
    const res = await api()
      .post("/api/rides")
      .send({
        type: "bike",
        pickupLat: 33.7294,
        pickupLng: 73.3825,
        dropLat: 33.6007,
        dropLng: 73.0679,
        pickupAddress: "Muzaffarabad",
        dropAddress: "Rawalpindi",
        paymentMethod: "cash",
      })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("GET /api/rides without token returns 401", async () => {
    const res = await api().get("/api/rides");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ─── Booking validation ───────────────────────────────────────────────────────

describe("Rides booking input validation", () => {
  it("POST /api/rides with authenticated customer but missing pickupLat returns 400/422", async () => {
    const res = await api()
      .post("/api/rides")
      .send({
        type: "bike",
        pickupLng: 73.3825,
        dropLat: 33.6007,
        dropLng: 73.0679,
        paymentMethod: "cash",
      })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/rides with authenticated customer but missing dropLat returns 400/422", async () => {
    const res = await api()
      .post("/api/rides")
      .send({
        type: "bike",
        pickupLat: 33.7294,
        pickupLng: 73.3825,
        dropLng: 73.0679,
        paymentMethod: "cash",
      })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/rides with authenticated customer but missing serviceType/type returns 400/422", async () => {
    const res = await api()
      .post("/api/rides")
      .send({
        pickupLat: 33.7294,
        pickupLng: 73.3825,
        dropLat: 33.6007,
        dropLng: 73.0679,
        paymentMethod: "cash",
      })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/rides with empty body returns 400/422", async () => {
    const res = await api()
      .post("/api/rides")
      .send({})
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

// ─── Cancel ride ─────────────────────────────────────────────────────────────

describe("Rides cancel", () => {
  it("PATCH /api/rides/:id/cancel without token returns 401", async () => {
    const res = await api()
      .patch("/api/rides/non-existent-ride-id/cancel")
      .send({})
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("PATCH /api/rides/:id/cancel with valid token on non-existent ride returns 404", async () => {
    const res = await api()
      .patch("/api/rides/non-existent-ride-id-xyz/cancel")
      .send({})
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(404);
  });
});

// ─── Rider-side endpoints ─────────────────────────────────────────────────────

describe("Rider-side ride endpoints auth guards", () => {
  it("POST /api/riders/rides/:id/accept without rider token returns 401", async () => {
    const res = await api()
      .post("/api/riders/rides/some-ride-id/accept")
      .send({ fare: 200 })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/riders/rides/:id/verify-otp without rider token returns 401", async () => {
    const res = await api()
      .post("/api/riders/rides/some-ride-id/verify-otp")
      .send({ otp: "1234" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ─── OTP validation ───────────────────────────────────────────────────────────

describe("Rider OTP validation", () => {
  it("POST /api/riders/rides/:id/verify-otp with rider token but non-existent ride returns 404", async () => {
    const res = await api()
      .post("/api/riders/rides/non-existent-ride-xyz/verify-otp")
      .send({ otp: "1234" })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${riderToken}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/riders/rides/:id/verify-otp with non-numeric OTP returns 400/422", async () => {
    const res = await api()
      .post("/api/riders/rides/any-ride-id/verify-otp")
      .send({ otp: "abcd" })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${riderToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/riders/rides/:id/verify-otp with overlong OTP (>10 chars) returns 400/422", async () => {
    const res = await api()
      .post("/api/riders/rides/any-ride-id/verify-otp")
      .send({ otp: "123456789012" })
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${riderToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/riders/rides/:id/verify-otp with missing OTP returns 400/422", async () => {
    const res = await api()
      .post("/api/riders/rides/any-ride-id/verify-otp")
      .send({})
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${riderToken}`);
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});
