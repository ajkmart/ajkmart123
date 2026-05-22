/**
 * Logout sequence ordering tests
 *
 * Verifies the security invariant: local tokens are always cleared BEFORE
 * the server-side revocation request is issued.  If the revocation request
 * is slow or fails, the local session is already dead.
 *
 * Run from artifacts/rider-app:
 *   pnpm test
 */

import { describe, expect, it, vi } from "vitest";
import { executeLogoutSequence, type LogoutApi } from "../lib/logoutSequence";

describe("logout sequence ordering", () => {
  it("clears tokens before making the server revocation request", async () => {
    const callOrder: string[] = [];

    const mockApi: LogoutApi = {
      getRefreshToken: () => "test-refresh-token",
      clearTokens: () => {
        callOrder.push("clearTokens");
      },
      logout: vi.fn(async () => {
        callOrder.push("serverLogout");
      }),
    };

    executeLogoutSequence(mockApi, () => {
      callOrder.push("clearState");
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const clearIdx = callOrder.indexOf("clearTokens");
    const serverIdx = callOrder.indexOf("serverLogout");

    expect(clearIdx).toBeGreaterThanOrEqual(0);
    expect(serverIdx).toBeGreaterThanOrEqual(0);
    expect(clearIdx).toBeLessThan(serverIdx);
  });

  it("clears tokens before the server call even when the call rejects", async () => {
    const callOrder: string[] = [];

    const mockApi: LogoutApi = {
      getRefreshToken: () => "expiring-token",
      clearTokens: () => {
        callOrder.push("clearTokens");
      },
      logout: vi.fn(async () => {
        callOrder.push("serverLogout");
        throw new Error("network failure");
      }),
    };

    executeLogoutSequence(mockApi, () => {});

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(callOrder.indexOf("clearTokens")).toBeLessThan(callOrder.indexOf("serverLogout"));
  });

  it("still clears tokens when there is no refresh token", () => {
    const cleared: boolean[] = [];

    const mockApi: LogoutApi = {
      getRefreshToken: () => "",
      clearTokens: () => {
        cleared.push(true);
      },
      logout: vi.fn(),
    };

    executeLogoutSequence(mockApi, () => {});

    expect(cleared).toHaveLength(1);
    expect(mockApi.logout).not.toHaveBeenCalled();
  });

  it("calls clearAppState immediately after clearing tokens (before network)", () => {
    const callOrder: string[] = [];

    const mockApi: LogoutApi = {
      getRefreshToken: () => "tok",
      clearTokens: () => {
        callOrder.push("clearTokens");
      },
      logout: vi.fn(async () => {
        callOrder.push("serverLogout");
      }),
    };

    executeLogoutSequence(mockApi, () => {
      callOrder.push("clearState");
    });

    const clearIdx = callOrder.indexOf("clearTokens");
    const stateIdx = callOrder.indexOf("clearState");

    expect(clearIdx).toBeLessThan(stateIdx);
  });
});
