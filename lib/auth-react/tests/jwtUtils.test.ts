import { describe, expect, it } from "vitest";
import { decodeJwt, getTokenExpiryRemaining, isTokenExpired } from "../src/utils/jwtUtils";

function encodeBase64Url(obj: object): string {
  const json = JSON.stringify(obj);
  const utf8Bytes = encodeURIComponent(json).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  return btoa(utf8Bytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeToken(payload: object): string {
  const header = encodeBase64Url({ alg: "HS256", typ: "JWT" });
  const body = encodeBase64Url(payload);
  return `${header}.${body}.fake_sig`;
}

const now = () => Math.floor(Date.now() / 1000);

describe("decodeJwt", () => {
  it("decodes a standard JWT payload", () => {
    const payload = { sub: "user-123", role: "customer", exp: now() + 3600 };
    const token = makeToken(payload);
    const result = decodeJwt(token);
    expect(result).not.toBeNull();
    expect(result?.sub).toBe("user-123");
    expect(result?.role).toBe("customer");
    expect(result?.exp).toBe(payload.exp);
  });

  it("round-trips a payload containing Urdu text (non-ASCII)", () => {
    const payload = { sub: "user-456", city: "آزاد کشمیر", region: "AJK" };
    const token = makeToken(payload);
    const result = decodeJwt(token);
    expect(result).not.toBeNull();
    expect(result?.city).toBe("آزاد کشمیر");
    expect(result?.region).toBe("AJK");
    expect(result?.sub).toBe("user-456");
  });

  it("returns null for a malformed (two-part) token", () => {
    expect(decodeJwt("header.payload")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(decodeJwt("")).toBeNull();
  });

  it("returns null for a token with an invalid base64 payload", () => {
    expect(decodeJwt("header.!!!invalid!!!.sig")).toBeNull();
  });

  it("returns null for a token whose payload is not valid JSON", () => {
    const notJson = btoa("not-json-at-all").replace(/=/g, "");
    expect(decodeJwt(`header.${notJson}.sig`)).toBeNull();
  });
});

describe("isTokenExpired", () => {
  it("returns false for a token with a far-future exp", () => {
    const token = makeToken({ sub: "u1", exp: now() + 7200 });
    expect(isTokenExpired(token, 0)).toBe(false);
  });

  it("returns true for a token with a past exp", () => {
    const token = makeToken({ sub: "u2", exp: now() - 200 });
    expect(isTokenExpired(token, 0)).toBe(true);
  });

  it("returns true for a token with no exp field", () => {
    const token = makeToken({ sub: "u3" });
    expect(isTokenExpired(token)).toBe(true);
  });

  it("applies leeway correctly — token within leeway window is considered expired", () => {
    const token = makeToken({ sub: "u4", exp: now() + 30 });
    expect(isTokenExpired(token, 60)).toBe(true);
  });

  it("returns true for a malformed token", () => {
    expect(isTokenExpired("not.a.token")).toBe(true);
  });
});

describe("getTokenExpiryRemaining", () => {
  it("returns a positive number for a valid non-expired token", () => {
    const token = makeToken({ sub: "u5", exp: now() + 3600 });
    const remaining = getTokenExpiryRemaining(token);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(3600);
  });

  it("returns 0 for an expired token", () => {
    const token = makeToken({ sub: "u6", exp: now() - 100 });
    expect(getTokenExpiryRemaining(token)).toBe(0);
  });

  it("returns 0 for a token with no exp field", () => {
    const token = makeToken({ sub: "u7" });
    expect(getTokenExpiryRemaining(token)).toBe(0);
  });

  it("returns 0 for a malformed token", () => {
    expect(getTokenExpiryRemaining("bad")).toBe(0);
  });
});
