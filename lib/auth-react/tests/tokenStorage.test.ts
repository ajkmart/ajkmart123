import { beforeEach, describe, expect, it } from "vitest";
import { createTokenStorage, getTokenStorage, SecureStorage } from "../src/api/tokenStorage";

const ACCESS_KEY = "ajk_access_token";
const REFRESH_KEY = "ajk_refresh_token";

describe("MemoryStorage", () => {
  it("getAccessToken returns null before any set", () => {
    const s = createTokenStorage("memory");
    expect(s.getAccessToken()).toBeNull();
  });

  it("setAccessToken / getAccessToken round-trip", () => {
    const s = createTokenStorage("memory");
    s.setAccessToken("access-abc");
    expect(s.getAccessToken()).toBe("access-abc");
  });

  it("removeAccessToken clears access token", () => {
    const s = createTokenStorage("memory");
    s.setAccessToken("access-abc");
    s.removeAccessToken();
    expect(s.getAccessToken()).toBeNull();
  });

  it("getRefreshToken returns null before any set", () => {
    const s = createTokenStorage("memory");
    expect(s.getRefreshToken()).toBeNull();
  });

  it("setRefreshToken / getRefreshToken round-trip", () => {
    const s = createTokenStorage("memory");
    s.setRefreshToken("refresh-xyz");
    expect(s.getRefreshToken()).toBe("refresh-xyz");
  });

  it("removeRefreshToken clears refresh token", () => {
    const s = createTokenStorage("memory");
    s.setRefreshToken("refresh-xyz");
    s.removeRefreshToken();
    expect(s.getRefreshToken()).toBeNull();
  });

  it("clear removes both tokens", () => {
    const s = createTokenStorage("memory");
    s.setAccessToken("access-abc");
    s.setRefreshToken("refresh-xyz");
    s.clear();
    expect(s.getAccessToken()).toBeNull();
    expect(s.getRefreshToken()).toBeNull();
  });

  it("two instances are fully isolated", () => {
    const a = createTokenStorage("memory");
    const b = createTokenStorage("memory");
    a.setAccessToken("tok-a");
    expect(b.getAccessToken()).toBeNull();
  });
});

describe("createTokenStorage factory", () => {
  it("'memory' returns a working MemoryStorage", () => {
    const s = createTokenStorage("memory");
    s.setAccessToken("mem-tok");
    expect(s.getAccessToken()).toBe("mem-tok");
  });

  it("getTokenStorage() defaults to 'web' (sessionStorage)", () => {
    const s = getTokenStorage();
    expect(s).toBeDefined();
    expect(typeof s.getAccessToken).toBe("function");
  });

  it("getTokenStorage('memory') returns a memory-backed store", () => {
    const s = getTokenStorage("memory");
    s.setAccessToken("via-helper");
    expect(s.getAccessToken()).toBe("via-helper");
  });
});

describe("WebStorage (session)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("stores access token in sessionStorage", () => {
    const s = createTokenStorage("web");
    s.setAccessToken("sess-access");
    expect(window.sessionStorage.getItem(ACCESS_KEY)).toBe("sess-access");
  });

  it("retrieves access token from sessionStorage", () => {
    window.sessionStorage.setItem(ACCESS_KEY, "preset-access");
    const s = createTokenStorage("web");
    expect(s.getAccessToken()).toBe("preset-access");
  });

  it("removes access token from sessionStorage", () => {
    const s = createTokenStorage("web");
    s.setAccessToken("sess-access");
    s.removeAccessToken();
    expect(s.getAccessToken()).toBeNull();
    expect(window.sessionStorage.getItem(ACCESS_KEY)).toBeNull();
  });

  it("stores and retrieves refresh token", () => {
    const s = createTokenStorage("web");
    s.setRefreshToken("sess-refresh");
    expect(s.getRefreshToken()).toBe("sess-refresh");
    expect(window.sessionStorage.getItem(REFRESH_KEY)).toBe("sess-refresh");
  });

  it("removes refresh token", () => {
    const s = createTokenStorage("web");
    s.setRefreshToken("sess-refresh");
    s.removeRefreshToken();
    expect(s.getRefreshToken()).toBeNull();
  });

  it("clear removes both tokens from sessionStorage", () => {
    const s = createTokenStorage("web");
    s.setAccessToken("a");
    s.setRefreshToken("r");
    s.clear();
    expect(s.getAccessToken()).toBeNull();
    expect(s.getRefreshToken()).toBeNull();
    expect(window.sessionStorage.getItem(ACCESS_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(REFRESH_KEY)).toBeNull();
  });
});

describe("WebStorage (local)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("stores access token in localStorage", () => {
    const s = createTokenStorage("web-local");
    s.setAccessToken("local-access");
    expect(window.localStorage.getItem(ACCESS_KEY)).toBe("local-access");
  });

  it("retrieves access token from localStorage", () => {
    window.localStorage.setItem(ACCESS_KEY, "preset-local");
    const s = createTokenStorage("web-local");
    expect(s.getAccessToken()).toBe("preset-local");
  });

  it("clear removes both tokens from localStorage", () => {
    const s = createTokenStorage("web-local");
    s.setAccessToken("la");
    s.setRefreshToken("lr");
    s.clear();
    expect(s.getAccessToken()).toBeNull();
    expect(s.getRefreshToken()).toBeNull();
  });
});

describe("SecureStorage alias", () => {
  it("is exported and is a constructor", () => {
    expect(typeof SecureStorage).toBe("function");
  });

  it("creates an instance that implements TokenStorage interface", () => {
    const s = new SecureStorage();
    expect(typeof s.getAccessToken).toBe("function");
    expect(typeof s.setAccessToken).toBe("function");
    expect(typeof s.removeAccessToken).toBe("function");
    expect(typeof s.getRefreshToken).toBe("function");
    expect(typeof s.setRefreshToken).toBe("function");
    expect(typeof s.removeRefreshToken).toBe("function");
    expect(typeof s.clear).toBe("function");
  });

  it("in-memory operations work without a SecureStore", () => {
    const s = new SecureStorage();
    expect(s.getAccessToken()).toBeNull();
    s.setAccessToken("native-tok");
    expect(s.getAccessToken()).toBe("native-tok");
    s.removeAccessToken();
    expect(s.getAccessToken()).toBeNull();
  });
});
