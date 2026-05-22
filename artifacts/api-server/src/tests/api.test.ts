/**
 * API Health Check Integration Tests
 *
 * Self-contained: the Express app is created in-process via createServer() and
 * exercised through supertest — no separately running server is needed.
 *
 * Run with a single command from artifacts/api-server:
 *   pnpm test
 *
 * The test suite sets fallback values for JWT_SECRET / ADMIN_JWT_SECRET so it
 * works in CI environments where those variables are not pre-configured. When
 * the real secrets are already present in the environment they are used as-is,
 * keeping the test token compatible with a concurrently running dev server.
 */

import type { Express } from "express";
import jwt from "jsonwebtoken";
import supertest from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

const FALLBACK_JWT_SECRET = "api_health_check_test_secret_placeholder_32chars";
const FALLBACK_ADMIN_SECRET = "api_health_check_admin_test_placeholder_32chars";

let app: Express;
let jwtSecret: string;

beforeAll(async () => {
  process.env["JWT_SECRET"] ??= FALLBACK_JWT_SECRET;
  process.env["ADMIN_JWT_SECRET"] ??= FALLBACK_ADMIN_SECRET;
  jwtSecret = process.env["JWT_SECRET"]!;

  const { createServer } = await import("../app.js");
  app = (await createServer()) as any;
}, 30000);

function makeAdminToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      sub: "test-admin-health-check",
      role: "super_admin",
      name: "Health Check Bot",
      perms: [],
      pv: 0,
      ...overrides,
    },
    process.env["ADMIN_ACCESS_TOKEN_SECRET"] ?? jwtSecret,
    { expiresIn: "1h", issuer: process.env["JWT_ISSUER"] ?? "ajkmart-admin", algorithm: "HS256" }
  );
}

function api() {
  return supertest(app);
}

// ─── Public endpoints ─────────────────────────────────────────────────────────

describe("Public endpoints", () => {
  it("GET /api/health returns 200 with {status: ok}", async () => {
    const res = await api().get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
    expect(typeof res.body.timestamp).toBe("string");
  });

  it("GET /api/categories returns 200 with a categories array", async () => {
    const res = await api().get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data?.categories)).toBe(true);
  });

  it("GET /api/products/trending-searches returns 200 with a searches array", async () => {
    const res = await api().get("/api/products/trending-searches");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data?.searches)).toBe(true);
  });

  it("GET /api/banners returns 200 with a banners array", async () => {
    const res = await api().get("/api/banners");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data?.banners)).toBe(true);
  });

  it("GET /api/platform-config returns 200 with config data", async () => {
    const res = await api().get("/api/platform-config");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it("GET /api/vendors returns 200 with a vendors array", async () => {
    const res = await api().get("/api/vendors");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data?.vendors)).toBe(true);
  });

  it("GET /api/recommendations/trending returns 200", async () => {
    const res = await api().get("/api/recommendations/trending");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── Authentication boundary checks ──────────────────────────────────────────

describe("Customer-protected endpoints reject unauthenticated requests", () => {
  it("GET /api/orders returns 401 without token", async () => {
    const res = await api().get("/api/orders");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("GET /api/wallet returns 401 without token", async () => {
    const res = await api().get("/api/wallet");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("GET /api/notifications returns 401 without token", async () => {
    const res = await api().get("/api/notifications");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("GET /api/addresses returns 401 without token", async () => {
    const res = await api().get("/api/addresses");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ─── Admin JWT auth ───────────────────────────────────────────────────────────

describe("Admin-protected endpoints with valid admin JWT", () => {
  it("GET /api/admin/system/stats returns 200 with valid admin token", async () => {
    const token = makeAdminToken();
    const res = await api().get("/api/admin/system/stats").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(typeof res.body.stats.users).toBe("number");
    expect(typeof res.body.generatedAt).toBe("string");
  });

  it("GET /api/admin/system/stats returns 401 without token", async () => {
    const res = await api().get("/api/admin/system/stats");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("GET /api/admin/system/stats returns 401 with an invalid token", async () => {
    const res = await api()
      .get("/api/admin/system/stats")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("GET /api/legal returns 200 with valid admin token", async () => {
    const token = makeAdminToken();
    const res = await api().get("/api/legal").set("Authorization", `Bearer ${token}`);
    expect([200, 404]).toContain(res.status);
    expect(res.body.success).toBeDefined();
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe("Input validation rejects malformed requests", () => {
  it("POST /api/auth/check-identifier with empty body returns 400", async () => {
    const res = await api()
      .post("/api/auth/check-identifier")
      .send({})
      .set("Content-Type", "application/json");
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/auth/send-otp without phone returns 400", async () => {
    const res = await api()
      .post("/api/auth/send-otp")
      .send({})
      .set("Content-Type", "application/json");
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/auth/verify-otp with missing fields returns 400", async () => {
    const res = await api()
      .post("/api/auth/verify-otp")
      .send({ phone: "123" })
      .set("Content-Type", "application/json");
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});
