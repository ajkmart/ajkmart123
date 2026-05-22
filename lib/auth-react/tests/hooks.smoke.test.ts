/**
 * Task 7 — Hook smoke tests
 *
 * Verifies that all three hooks can be imported and that their public API
 * shape (returned object keys + function types) is correct without requiring
 * a running DOM or real React render.  We do NOT test render behaviour here —
 * that lives in authClient / tokenStorage tests.
 */
import { act, renderHook } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTokenStorage } from "../src/api/tokenStorage";
import { AuthProvider } from "../src/AuthProvider";
import { useAuth } from "../src/hooks/useAuth";
import { useLoginFlow } from "../src/hooks/useLoginFlow";
import { useSessionManager } from "../src/hooks/useSessionManager";
import { useTokenRefresh } from "../src/hooks/useTokenRefresh";

/* ── helpers ──────────────────────────────────────────────────────────────── */

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AuthProvider, { baseURL: "" }, children);
  };
}

/* ── import shape ──────────────────────────────────────────────────────────── */

describe("Hook exports — import shape", () => {
  it("useAuth is a function", () => {
    expect(typeof useAuth).toBe("function");
  });

  it("useTokenRefresh is a function", () => {
    expect(typeof useTokenRefresh).toBe("function");
  });

  it("useLoginFlow is a function", () => {
    expect(typeof useLoginFlow).toBe("function");
  });

  it("useSessionManager is a function", () => {
    expect(typeof useSessionManager).toBe("function");
  });
});

/* ── useAuth ──────────────────────────────────────────────────────────────── */

describe("useAuth — return shape", () => {
  it("returns expected keys from inside AuthProvider", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(),
    });

    expect(result.current).toHaveProperty("user");
    expect(result.current).toHaveProperty("isLoading");
    expect(result.current).toHaveProperty("isAuthenticated");
    expect(result.current).toHaveProperty("twoFactorPending");
    expect(result.current).toHaveProperty("storageError");
    expect(typeof result.current.login).toBe("function");
    expect(typeof result.current.logout).toBe("function");
    expect(typeof result.current.refreshToken).toBe("function");
  });

  it("initial state is unauthenticated", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.twoFactorPending).toBe(false);
    expect(result.current.storageError).toBeNull();
  });

  it("login() sets user and isAuthenticated", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(),
    });

    const fakeUser = { id: "u1", role: "customer" as const };
    const fakeToken =
      "header." + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + ".sig";

    act(() => {
      result.current.login(fakeUser, fakeToken);
    });

    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("logout() clears user", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(),
    });

    const fakeUser = { id: "u1", role: "customer" as const };
    const fakeToken =
      "h." + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + ".s";

    act(() => {
      result.current.login(fakeUser, fakeToken);
    });
    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.logout();
    });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});

/* ── useTokenRefresh ──────────────────────────────────────────────────────── */

describe("useTokenRefresh — return shape and options", () => {
  it("returns { refreshToken } function", () => {
    const storage = createTokenStorage("memory");
    const { result } = renderHook(() => useTokenRefresh({ tokenStorage: storage, baseURL: "" }));
    expect(typeof result.current.refreshToken).toBe("function");
  });

  it("accepts refreshIntervalSeconds option without TypeScript error", () => {
    const storage = createTokenStorage("memory");
    const { result } = renderHook(() =>
      useTokenRefresh({
        tokenStorage: storage,
        baseURL: "",
        refreshIntervalSeconds: 30,
        onLogout: vi.fn(),
      })
    );
    expect(typeof result.current.refreshToken).toBe("function");
  });

  it("accepts leewaySeconds option", () => {
    const storage = createTokenStorage("memory");
    const { result } = renderHook(() =>
      useTokenRefresh({
        tokenStorage: storage,
        baseURL: "",
        leewaySeconds: 120,
      })
    );
    expect(typeof result.current.refreshToken).toBe("function");
  });

  it("deduplicates concurrent refresh calls (isRefreshing guard)", async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves
    const storage = createTokenStorage("memory");
    const { result } = renderHook(() => useTokenRefresh({ tokenStorage: storage, baseURL: "" }));

    // Trigger two concurrent calls — fetch should only be called once
    void result.current.refreshToken();
    void result.current.refreshToken();

    // Give microtasks a chance to run
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

/* ── useLoginFlow ─────────────────────────────────────────────────────────── */

describe("useLoginFlow — return shape", () => {
  it("returns expected keys", () => {
    const { result } = renderHook(() => useLoginFlow(), {
      wrapper: makeWrapper(),
    });

    expect(typeof result.current.initiateLogin).toBe("function");
    expect(typeof result.current.verifyOtp).toBe("function");
    expect(typeof result.current.verifyPassword).toBe("function");
    expect(typeof result.current.twoFactorVerify).toBe("function");
    expect(typeof result.current.loading).toBe("boolean");
    expect(result.current.error == null || typeof result.current.error === "string").toBe(true);
  });

  it("initial loading is false and error is null", () => {
    const { result } = renderHook(() => useLoginFlow(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("initiateLogin sets loading during fetch and error on failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ success: false, message: "Not found" }),
    });

    const { result } = renderHook(() => useLoginFlow(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await expect(result.current.initiateLogin("notexist@x.com")).rejects.toThrow();
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
  });

  it("initiateLogin calls /api/auth/check-identifier", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { method: "otp", exists: true },
        }),
    });

    const { result } = renderHook(() => useLoginFlow(), {
      wrapper: makeWrapper(),
    });

    let res: { method: string; exists: boolean } | undefined;
    await act(async () => {
      res = await result.current.initiateLogin("+92-300-0000000");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("check-identifier"),
      expect.objectContaining({ method: "POST" })
    );
    expect(res?.method).toBe("otp");
    expect(res?.exists).toBe(true);
  });
});

/* ── useSessionManager — import only (needs auth context) ─────────────────── */

describe("useSessionManager — return shape", () => {
  it("returns expected keys", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { sessions: [] } }),
    });

    const { result } = renderHook(() => useSessionManager(), {
      wrapper: makeWrapper(),
    });

    expect(Array.isArray(result.current.sessions)).toBe(true);
    expect(Array.isArray(result.current.history)).toBe(true);
    expect(typeof result.current.loadingSessions).toBe("boolean");
    expect(typeof result.current.loadingHistory).toBe("boolean");
    expect(typeof result.current.refreshSessions).toBe("function");
    expect(typeof result.current.refreshHistory).toBe("function");
    expect(typeof result.current.revokeSession).toBe("function");
    expect(typeof result.current.revokeAllOthers).toBe("function");
    expect(typeof result.current.revokeAll).toBe("function");
  });
});
