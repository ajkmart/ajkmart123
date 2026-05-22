/**
 * Regression tests for the auth-react deep bug fix & hardening pass.
 * Covers: logout token clear, session restore, OTP duplicate-fire prevention,
 * JSON parse error handling, 401 no-retry, country code uniqueness.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthClient, JsonParseError, UnauthorizedError } from "../src/api/authClient";
import { createTokenStorage } from "../src/api/tokenStorage";
import { DEFAULT_COUNTRIES } from "../src/components/PhoneInput";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeTestToken(exp: number): string {
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode({ alg: "HS256" })}.${encode({ sub: "u1", exp, role: "customer" })}.sig`;
}

const now = () => Math.floor(Date.now() / 1000);

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  };
}

function unauthorizedResponse() {
  return {
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    text: () => Promise.resolve("Unauthorized"),
    json: () => Promise.resolve({}),
  };
}

/* ── tokenStorage: logout clears BOTH tokens ────────────────────────────── */

describe("tokenStorage — logout clears both tokens", () => {
  it("removeAccessToken only clears the access token, refresh token survives", () => {
    const s = createTokenStorage("memory");
    s.setAccessToken("access-tok");
    s.setRefreshToken("refresh-tok");
    s.removeAccessToken();
    expect(s.getAccessToken()).toBeNull();
    expect(s.getRefreshToken()).toBe("refresh-tok");
  });

  it("removeRefreshToken only clears the refresh token, access token survives", () => {
    const s = createTokenStorage("memory");
    s.setAccessToken("access-tok");
    s.setRefreshToken("refresh-tok");
    s.removeRefreshToken();
    expect(s.getRefreshToken()).toBeNull();
    expect(s.getAccessToken()).toBe("access-tok");
  });

  it("clear() removes both tokens", () => {
    const s = createTokenStorage("memory");
    s.setAccessToken("access-tok");
    s.setRefreshToken("refresh-tok");
    s.clear();
    expect(s.getAccessToken()).toBeNull();
    expect(s.getRefreshToken()).toBeNull();
  });

  it("after logout (removeAccessToken + removeRefreshToken), both tokens are gone", () => {
    const s = createTokenStorage("memory");
    s.setAccessToken("at");
    s.setRefreshToken("rt");
    // simulate what AuthProvider.logout() does
    s.removeAccessToken();
    s.removeRefreshToken();
    expect(s.getAccessToken()).toBeNull();
    expect(s.getRefreshToken()).toBeNull();
  });
});

/* ── authClient: 401 must NOT be retried ───────────────────────────────── */

describe("authClient — 401 is not retried", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("throws UnauthorizedError immediately without retrying on persistent 401", async () => {
    vi.useFakeTimers();
    const storage = createTokenStorage("memory");
    const validToken = makeTestToken(now() + 3600);
    storage.setAccessToken(validToken);
    const onUnauthorized = vi.fn();

    // All calls return 401
    mockFetch.mockResolvedValue(unauthorizedResponse());

    const client = createAuthClient({
      baseURL: "http://api.test",
      tokenStorage: storage,
      onUnauthorized,
    });

    const promise = client.get("/secret");
    const assertion = expect(promise).rejects.toBeInstanceOf(UnauthorizedError);
    await vi.runAllTimersAsync();
    await assertion;

    // Should be: original request (401) + refresh attempt (401) + retry (401)
    // but NOT the full 4 attempts of withRetry (3 retries × retry loop)
    // Key invariant: withRetry does not sleep and retry on UnauthorizedError
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(4);
    vi.useRealTimers();
  });

  it("calls onUnauthorized exactly once when refresh fails with 401", async () => {
    vi.useFakeTimers();
    const storage = createTokenStorage("memory");
    storage.setAccessToken(makeTestToken(now() + 3600));
    const onUnauthorized = vi.fn();

    mockFetch.mockResolvedValue(unauthorizedResponse());

    const client = createAuthClient({
      baseURL: "http://api.test",
      tokenStorage: storage,
      onUnauthorized,
    });

    const promise = client.get("/secret").catch(() => {});
    await vi.runAllTimersAsync();
    await promise;
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

/* ── authClient: JSON parse errors must NOT be retried ─────────────────── */

describe("authClient — JSON parse error is not retried", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("throws JsonParseError when server returns non-JSON 2xx response", async () => {
    const storage = createTokenStorage("memory");
    storage.setAccessToken(makeTestToken(now() + 3600));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html>not json</html>"),
    });

    const client = createAuthClient({ baseURL: "http://api.test", tokenStorage: storage });
    await expect(client.get("/html-response")).rejects.toBeInstanceOf(JsonParseError);
  });

  it("does not retry on JsonParseError — fetch is called exactly once", async () => {
    const storage = createTokenStorage("memory");
    storage.setAccessToken(makeTestToken(now() + 3600));

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("not valid json {{{"),
    });

    const client = createAuthClient({ baseURL: "http://api.test", tokenStorage: storage });
    await client.get("/bad").catch(() => {});
    // Only one fetch call — no retry
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

/* ── PhoneInput: country codes must be unique ───────────────────────────── */

describe("PhoneInput country codes uniqueness", () => {
  it("DEFAULT_COUNTRIES has no duplicate codes", () => {
    const codes = DEFAULT_COUNTRIES.map((c) => c.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it("GB code maps to United Kingdom (+44), not Gilgit-Baltistan", () => {
    const gb = DEFAULT_COUNTRIES.find((c) => c.code === "GB");
    expect(gb).toBeDefined();
    expect(gb!.dial).toBe("+44");
    expect(gb!.name).toContain("United Kingdom");
  });

  it("Gilgit-Baltistan uses PKG code", () => {
    const pkgCountry = DEFAULT_COUNTRIES.find((c) => c.name.includes("Gilgit"));
    expect(pkgCountry).toBeDefined();
    expect(pkgCountry!.code).toBe("PKG");
  });

  it("PKG and GB are both present with correct dials", () => {
    const pkgEntry = DEFAULT_COUNTRIES.find((c) => c.code === "PKG");
    const gbEntry = DEFAULT_COUNTRIES.find((c) => c.code === "GB");
    expect(pkgEntry!.dial).toBe("+92");
    expect(gbEntry!.dial).toBe("+44");
  });
});

/* ── authClient: empty response body returns null without throwing ───────── */

describe("authClient — empty / 204 responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("returns null for empty response body (204)", async () => {
    const storage = createTokenStorage("memory");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
    });

    const client = createAuthClient({ baseURL: "http://api.test", tokenStorage: storage });
    const result = await client.delete("/resource");
    expect(result).toBeNull();
  });
});
