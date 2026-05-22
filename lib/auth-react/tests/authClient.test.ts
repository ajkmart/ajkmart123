import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../src/api/authClient";
import type { TokenStorage } from "../src/api/tokenStorage";
import { createTokenStorage } from "../src/api/tokenStorage";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeTestToken(exp: number): string {
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode({ alg: "HS256" })}.${encode({ sub: "test", exp })}.sig`;
}

const now = () => Math.floor(Date.now() / 1000);

function makeClient(storage: TokenStorage, opts?: { onUnauthorized?: () => void }) {
  return createAuthClient({
    baseURL: "http://api.test",
    tokenStorage: storage,
    ...opts,
  });
}

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
    text: () => Promise.resolve("Unauthorized"),
    json: () => Promise.resolve({}),
  };
}

describe("authClient — GET request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("attaches Bearer token to Authorization header", async () => {
    const storage = createTokenStorage("memory");
    const validToken = makeTestToken(now() + 3600);
    storage.setAccessToken(validToken);
    mockFetch.mockResolvedValueOnce(okResponse({ data: "hello" }));

    const client = makeClient(storage);
    const result = await client.get<{ data: string }>("/test");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://api.test/test",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: `Bearer ${validToken}` }),
      })
    );
    expect(result).toEqual({ data: "hello" });
  });

  it("omits Authorization header when no token in storage", async () => {
    const storage = createTokenStorage("memory");
    mockFetch.mockResolvedValueOnce(okResponse(null));

    const client = makeClient(storage);
    await client.get("/public");

    const [, init] = mockFetch.mock.calls[0]!;
    expect(
      (init as RequestInit & { headers: Record<string, string> }).headers?.Authorization
    ).toBeUndefined();
  });

  it("returns parsed JSON response body", async () => {
    const storage = createTokenStorage("memory");
    mockFetch.mockResolvedValueOnce(okResponse({ items: [1, 2, 3] }));

    const client = makeClient(storage);
    const result = await client.get<{ items: number[] }>("/items");
    expect(result).toEqual({ items: [1, 2, 3] });
  });

  it("returns null for empty response body", async () => {
    const storage = createTokenStorage("memory");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
    });

    const client = makeClient(storage);
    const result = await client.get("/empty");
    expect(result).toBeNull();
  });

  it("throws on non-ok response (HTTP 500)", async () => {
    const storage = createTokenStorage("memory");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    vi.useFakeTimers();
    const client = makeClient(storage);
    const promise = client.get("/error");
    const assertion = expect(promise).rejects.toThrow("HTTP 500");
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });
});

describe("authClient — POST request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("sends body as JSON-serialised string", async () => {
    const storage = createTokenStorage("memory");
    const validToken = makeTestToken(now() + 3600);
    storage.setAccessToken(validToken);
    mockFetch.mockResolvedValueOnce(okResponse({ created: true }));

    const client = makeClient(storage);
    await client.post("/create", { name: "AJKMart", city: "Muzaffarabad" });

    const [, init] = mockFetch.mock.calls[0]!;
    expect((init as RequestInit).body).toBe(
      JSON.stringify({ name: "AJKMart", city: "Muzaffarabad" })
    );
    expect(
      (init as RequestInit & { headers: Record<string, string> }).headers?.["Content-Type"]
    ).toBe("application/json");
  });

  it("sends POST without body when body is undefined", async () => {
    const storage = createTokenStorage("memory");
    mockFetch.mockResolvedValueOnce(okResponse({}));

    const client = makeClient(storage);
    await client.post("/ping");

    const [, init] = mockFetch.mock.calls[0]!;
    expect((init as RequestInit).body).toBeUndefined();
  });
});

describe("authClient — 401 refresh flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("triggers a refresh and retries original request on 401", async () => {
    const storage = createTokenStorage("memory");
    const validToken = makeTestToken(now() + 3600);
    storage.setAccessToken(validToken);

    mockFetch
      .mockResolvedValueOnce(unauthorizedResponse()) // original request → 401
      .mockResolvedValueOnce(okResponse({ accessToken: "new-token-xyz" })) // refresh → 200
      .mockResolvedValueOnce(okResponse({ protected: true })); // retry → 200

    const client = makeClient(storage);
    const result = await client.get<{ protected: boolean }>("/protected");

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const [, retryInit] = mockFetch.mock.calls[2]!;
    expect(
      (retryInit as RequestInit & { headers: Record<string, string> }).headers?.Authorization
    ).toBe("Bearer new-token-xyz");
    expect(result).toEqual({ protected: true });
  });

  it("stores the new access token from refresh response", async () => {
    const storage = createTokenStorage("memory");
    const validToken = makeTestToken(now() + 3600);
    storage.setAccessToken(validToken);

    mockFetch
      .mockResolvedValueOnce(unauthorizedResponse())
      .mockResolvedValueOnce(okResponse({ accessToken: "stored-new-token" }))
      .mockResolvedValueOnce(okResponse({}));

    const client = makeClient(storage);
    await client.get("/check");

    expect(storage.getAccessToken()).toBe("stored-new-token");
  });

  it("calls onUnauthorized when refresh endpoint also returns 401", async () => {
    vi.useFakeTimers();
    const storage = createTokenStorage("memory");
    const validToken = makeTestToken(now() + 3600);
    storage.setAccessToken(validToken);
    const onUnauthorized = vi.fn();

    mockFetch.mockResolvedValue(unauthorizedResponse());

    const client = makeClient(storage, { onUnauthorized });
    const promise = client.get("/protected");
    const assertion = expect(promise).rejects.toThrow("Unauthorized");
    await vi.runAllTimersAsync();
    await assertion;
    expect(onUnauthorized).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("pre-emptively refreshes when stored token is already expired", async () => {
    const storage = createTokenStorage("memory");
    const expiredToken = makeTestToken(now() - 200);
    storage.setAccessToken(expiredToken);

    mockFetch
      .mockResolvedValueOnce(okResponse({ accessToken: "pre-refreshed-token" })) // proactive refresh
      .mockResolvedValueOnce(okResponse({ ok: true })); // actual request

    const client = makeClient(storage);
    await client.get("/resource");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [refreshUrl] = mockFetch.mock.calls[0]!;
    expect(refreshUrl as string).toContain("/api/auth/refresh");
  });
});

describe("authClient — withRetry backoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries on network error and succeeds after two failures", async () => {
    vi.useFakeTimers();
    const storage = createTokenStorage("memory");
    const validToken = makeTestToken(now() + 3600);
    storage.setAccessToken(validToken);

    const networkError = new TypeError("Network request failed");
    mockFetch
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(okResponse({ recovered: true }));

    const client = makeClient(storage);
    const promise = client.get<{ recovered: boolean }>("/flaky");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ recovered: true });
  });

  it("throws the original error after exhausting all retries", async () => {
    vi.useFakeTimers();
    const storage = createTokenStorage("memory");
    const validToken = makeTestToken(now() + 3600);
    storage.setAccessToken(validToken);

    mockFetch.mockRejectedValue(new TypeError("Connection refused"));

    const client = makeClient(storage);
    const promise = client.get("/always-down");
    const assertion = expect(promise).rejects.toThrow("Connection refused");
    await vi.runAllTimersAsync();
    await assertion;
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});
