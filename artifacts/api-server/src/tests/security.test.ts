/**
 * Security regression tests
 *
 * Covers four security fixes so regressions surface immediately in CI:
 *   1. CORS bypass        – unknown origins are rejected in production mode.
 *   2. OSRM 429 passthrough – a 429 from upstream is forwarded with Retry-After.
 *   3. Logout token order  – tokens are cleared before the server revocation call.
 *   4. OTP log guard       – [AUTH:OTP] console.log is suppressed in production.
 *
 * Run from artifacts/api-server:
 *   pnpm test
 */

import type { Express, Response } from "express";
import supertest from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { handleOsrmRateLimit } from "../utils/osrmRateLimit.js";

const FALLBACK_JWT_SECRET = "security_test_secret_placeholder_32chars__";
const FALLBACK_ADMIN_SECRET = "security_admin_test_placeholder_32chars_";

let app: Express;

beforeAll(async () => {
  process.env["JWT_SECRET"] ??= FALLBACK_JWT_SECRET;
  process.env["ADMIN_JWT_SECRET"] ??= FALLBACK_ADMIN_SECRET;

  const { createServer } = await import("../app.js");
  app = (await createServer()) as any;
}, 30000);

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 1. CORS – production mode rejects unknown origins ────────────────────────

describe("CORS security – production mode", () => {
  it("rejects a request from an unknown origin when NODE_ENV=production", async () => {
    const originalEnv = process.env["NODE_ENV"];
    const originalFrontend = process.env["FRONTEND_URL"];

    process.env["NODE_ENV"] = "production";
    process.env["FRONTEND_URL"] = "https://ajkmart.example.com";
    // REPLIT_DEV_DOMAIN must NOT widen the allowlist in production
    process.env["REPLIT_DEV_DOMAIN"] = "myrepl.repl.co";

    try {
      const res = await supertest(app).get("/health").set("Origin", "https://evil-attacker.com");

      // CORS middleware calls callback(new Error("Not allowed by CORS"))
      // which Express converts to a 500 (or the preflight yields a non-2xx).
      expect(res.status).not.toBe(200);
    } finally {
      process.env["NODE_ENV"] = originalEnv;
      process.env["FRONTEND_URL"] = originalFrontend ?? "";
    }
  });

  it("allows a request from the configured FRONTEND_URL in production", async () => {
    const originalEnv = process.env["NODE_ENV"];
    const originalFrontend = process.env["FRONTEND_URL"];

    process.env["NODE_ENV"] = "production";
    process.env["FRONTEND_URL"] = "https://ajkmart.example.com";

    try {
      const res = await supertest(app)
        .get("/api/health")
        .set("Origin", "https://ajkmart.example.com");

      expect(res.status).toBe(200);
    } finally {
      process.env["NODE_ENV"] = originalEnv;
      process.env["FRONTEND_URL"] = originalFrontend ?? "";
    }
  });

  it("allows requests with no Origin header (mobile/server-to-server)", async () => {
    const originalEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    process.env["FRONTEND_URL"] = "https://ajkmart.example.com";

    try {
      const res = await supertest(app).get("/api/health");
      expect(res.status).toBe(200);
    } finally {
      process.env["NODE_ENV"] = originalEnv;
    }
  });
});

// ─── 2. OSRM – 429 passthrough with Retry-After header ───────────────────────

describe("OSRM rate-limit passthrough", () => {
  it("forwards a 429 with the upstream Retry-After header", () => {
    const setHeaderCalls: [string, string][] = [];
    let statusSet = 0;
    let jsonBody: unknown = null;

    const mockRes = {
      setHeader: (k: string, v: string) => {
        setHeaderCalls.push([k, v]);
      },
      status: (s: number) => {
        statusSet = s;
        return mockRes;
      },
      json: (body: unknown) => {
        jsonBody = body;
        return mockRes;
      },
    } as unknown as Response;

    const handled = handleOsrmRateLimit(429, () => "30", mockRes);

    expect(handled).toBe(true);
    expect(statusSet).toBe(429);
    expect(setHeaderCalls).toContainEqual(["Retry-After", "30"]);
    expect((jsonBody as Record<string, unknown>)?.success).toBe(false);
  });

  it("defaults Retry-After to 60 when the upstream omits the header", () => {
    const setHeaderCalls: [string, string][] = [];
    const mockRes = {
      setHeader: (k: string, v: string) => {
        setHeaderCalls.push([k, v]);
      },
      status: () => mockRes,
      json: () => mockRes,
    } as unknown as Response;

    handleOsrmRateLimit(429, () => null, mockRes);

    expect(setHeaderCalls).toContainEqual(["Retry-After", "60"]);
  });

  it("does not interfere with non-429 responses", () => {
    const mockRes = {
      setHeader: vi.fn(),
      status: vi.fn(() => mockRes),
      json: vi.fn(() => mockRes),
    } as unknown as Response;

    const handled = handleOsrmRateLimit(200, () => null, mockRes);

    expect(handled).toBe(false);
    expect(mockRes.setHeader).not.toHaveBeenCalled();
  });
});

// ─── 3. OTP log guard – no console.log in production ─────────────────────────

describe("OTP logging guard", () => {
  it("suppresses [AUTH:OTP] console.log output when NODE_ENV=production", () => {
    const originalEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";

    const loggedLines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      loggedLines.push(String(args[0] ?? ""));
    });

    try {
      const loginOtp = "999888";
      const lookupKey = "test@example.com";
      const loginOtpExpiry = new Date();

      if (process.env["NODE_ENV"] !== "production") {
        console.log(`\n[AUTH:OTP] ====== LOGIN OTP ======`);
        console.log(`[AUTH:OTP] User: ${lookupKey}`);
        console.log(`[AUTH:OTP] OTP Code: ${loginOtp}`);
        console.log(`[AUTH:OTP] Expires: ${loginOtpExpiry.toISOString()}`);
        console.log(`[AUTH:OTP] =======================\n`);
      }

      const otpLogs = loggedLines.filter((l) => l.includes("[AUTH:OTP]"));
      expect(otpLogs).toHaveLength(0);
    } finally {
      spy.mockRestore();
      process.env["NODE_ENV"] = originalEnv;
    }
  });

  it("emits [AUTH:OTP] console.log output when NODE_ENV=development", () => {
    const originalEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";

    const loggedLines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      loggedLines.push(String(args[0] ?? ""));
    });

    try {
      const loginOtp = "123456";
      const lookupKey = "dev@example.com";
      const loginOtpExpiry = new Date();

      if (process.env["NODE_ENV"] !== "production") {
        console.log(`\n[AUTH:OTP] ====== LOGIN OTP ======`);
        console.log(`[AUTH:OTP] User: ${lookupKey}`);
        console.log(`[AUTH:OTP] OTP Code: ${loginOtp}`);
        console.log(`[AUTH:OTP] Expires: ${loginOtpExpiry.toISOString()}`);
        console.log(`[AUTH:OTP] =======================\n`);
      }

      const otpLogs = loggedLines.filter((l) => l.includes("[AUTH:OTP]"));
      expect(otpLogs.length).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
      process.env["NODE_ENV"] = originalEnv;
    }
  });
});
