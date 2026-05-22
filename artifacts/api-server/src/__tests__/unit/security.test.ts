import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  blacklistJti,
  getClientIp,
  hashRefreshToken,
  idorGuard,
  signAccessToken,
  verifyUserJwt,
} from "../../middleware/security.js";

// Need JWT_SECRET for these tests — it's resolved at module load from env
// vitest.config.ts sets JWT_SECRET to a 32+ char test secret

describe("signAccessToken", () => {
  it("returns a valid JWT string", () => {
    const token = signAccessToken("u-1", "+923001234567", "customer", "customer", 1);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // header.payload.signature
  });

  it("embeds user data in the token", () => {
    const token = signAccessToken("u-1", "+923001234567", "customer", "customer", 1);
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    expect(payload.sub).toBe("u-1");
    expect(payload.phone).toBe("+923001234567");
    expect(payload.role).toBe("customer");
    expect(payload.type).toBe("access");
    expect(payload.jti).toBeTruthy();
  });
});

describe("verifyUserJwt", () => {
  it("returns payload for a valid token", () => {
    const token = signAccessToken("u-1", "+923001234567", "customer", "customer", 1);
    const payload = verifyUserJwt(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("u-1");
    expect(payload!.phone).toBe("+923001234567");
  });

  it("returns null for tampered signature", () => {
    const token = signAccessToken("u-1", "+923001234567", "customer", "customer", 1);
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(verifyUserJwt(tampered)).toBeNull();
  });

  it("returns null for completely invalid token", () => {
    expect(verifyUserJwt("not-a-token")).toBeNull();
    expect(verifyUserJwt("")).toBeNull();
  });

  it("returns null for 2fa_challenge token type", async () => {
    // Simulate creating a token with type=2fa_challenge
    const jwt = await import("jsonwebtoken");
    const token = jwt.default.sign(
      { sub: "u-1", phone: "+92", role: "customer", type: "2fa_challenge" },
      process.env["JWT_SECRET"]!,
      { algorithm: "HS256", expiresIn: "10m" }
    );
    expect(verifyUserJwt(token)).toBeNull();
  });
});

describe("hashRefreshToken", () => {
  it("is deterministic (same input → same hash)", () => {
    const a = hashRefreshToken("same-raw-token");
    const b = hashRefreshToken("same-raw-token");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes for different inputs", () => {
    const a = hashRefreshToken("token-a");
    const b = hashRefreshToken("token-b");
    expect(a).not.toBe(b);
  });
});

describe("blacklistJti", () => {
  it("does not throw when Redis is unavailable", async () => {
    // Redis is mocked/unavailable in test env — just ensure no throw
    await expect(
      blacklistJti("test-jti", Math.floor(Date.now() / 1000) + 100)
    ).resolves.not.toThrow();
  });
});

describe("getClientIp", () => {
  it("reads x-forwarded-for first", () => {
    const req = {
      headers: { "x-forwarded-for": "203.0.113.1, 70.41.3.18, 150.172.238.178" },
      socket: { remoteAddress: "192.168.1.1" },
    } as unknown as Request;
    expect(getClientIp(req)).toBe("203.0.113.1");
  });

  it("falls back to socket.remoteAddress", () => {
    const req = {
      headers: {},
      socket: { remoteAddress: "192.168.1.1" },
    } as unknown as Request;
    expect(getClientIp(req)).toBe("192.168.1.1");
  });

  it("returns 'unknown' when both are absent", () => {
    const req = { headers: {}, socket: {} } as unknown as Request;
    expect(getClientIp(req)).toBe("unknown");
  });
});

describe("idorGuard", () => {
  function makeRes(): Response {
    return {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
  }

  it("allows admin requests to bypass", () => {
    const req = { adminId: "a-1", userId: "u-1", params: { id: "u-2" } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();
    idorGuard(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks user from accessing another user's resource", () => {
    const req = {
      userId: "u-1",
      customerId: "u-1",
      params: { userId: "u-2" },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();
    idorGuard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Access denied" });
  });

  it("allows user to access their own resource", () => {
    const req = {
      userId: "u-1",
      customerId: "u-1",
      params: { userId: "u-1" },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();
    idorGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows when no param id is present", () => {
    const req = { userId: "u-1", params: {} } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();
    idorGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 401 when no callerId present", () => {
    const req = { params: { id: "u-1" } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();
    idorGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
