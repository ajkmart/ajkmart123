import { act, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../src/AuthProvider";
import { useLoginFlow } from "../src/hooks/useLoginFlow";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(AuthProvider, { storageType: "memory" }, children);
}

function makeIdentifierResponse(method: "otp" | "password" = "otp", exists = true) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data: { method, exists } }),
  };
}

function makeSendOtpResponse() {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true }),
  };
}

describe("useLoginFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initiateLogin", () => {
    it("calls check-identifier endpoint and returns method/exists", async () => {
      // "newuser@example.com" doesn't look like a phone → no send-otp call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: { method: "otp", exists: true },
          }),
      });

      const { result } = renderHook(() => useLoginFlow(), { wrapper });

      let checkResult: { method: string; exists: boolean } | undefined;
      await act(async () => {
        checkResult = await result.current.initiateLogin("newuser@example.com");
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/check-identifier",
        expect.objectContaining({ method: "POST" })
      );
      expect(checkResult?.method).toBe("otp");
      expect(checkResult?.exists).toBe(true);
    });

    it("returns exists=false for a new user identifier", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: { method: "otp", exists: false },
          }),
      });

      const { result } = renderHook(() => useLoginFlow(), { wrapper });

      let checkResult: { exists: boolean } | undefined;
      await act(async () => {
        checkResult = await result.current.initiateLogin("newuser@example.com");
      });

      expect(checkResult?.exists).toBe(false);
    });

    it("sets error state when API call fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ success: false, error: "Invalid identifier" }),
      });

      const { result } = renderHook(() => useLoginFlow(), { wrapper });

      await act(async () => {
        try {
          await result.current.initiateLogin("bad");
        } catch {
          /* expected to throw */
        }
      });

      expect(result.current.error).toBe("Invalid identifier");
    });

    it("is not loading before a request and is false after completion", async () => {
      // Email doesn't trigger send-otp
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { method: "otp", exists: true } }),
      });

      const { result } = renderHook(() => useLoginFlow(), { wrapper });

      expect(result.current.loading).toBe(false);

      await act(async () => {
        await result.current.initiateLogin("user@example.com");
      });

      expect(result.current.loading).toBe(false);
    });

    it("forwards metadata to check-identifier and send-otp", async () => {
      // Phone number → triggers send-otp; add both mocks
      mockFetch
        .mockResolvedValueOnce(makeIdentifierResponse("otp"))
        .mockResolvedValueOnce(makeSendOtpResponse());

      const { result } = renderHook(() => useLoginFlow(), { wrapper });

      await act(async () => {
        await result.current.initiateLogin("03001234567", { vehicleType: "motorcycle" });
      });

      // check-identifier body should include metadata
      const checkBody = JSON.parse(
        (mockFetch.mock.calls[0]![1] as RequestInit).body as string
      ) as Record<string, unknown>;
      expect(checkBody.vehicleType).toBe("motorcycle");

      // send-otp body should also include metadata
      const sendBody = JSON.parse(
        (mockFetch.mock.calls[1]![1] as RequestInit).body as string
      ) as Record<string, unknown>;
      expect(sendBody.vehicleType).toBe("motorcycle");
    });
  });

  describe("verifyOtp", () => {
    it("calls verify-otp and logs in user on success", async () => {
      // Phone number: check-identifier → send-otp → verify-otp (3 fetch calls)
      mockFetch
        .mockResolvedValueOnce(makeIdentifierResponse("otp"))
        .mockResolvedValueOnce(makeSendOtpResponse())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                user: { id: "usr_001", phone: "+923001234567", role: "customer" },
                accessToken: "access_token_xyz",
              },
            }),
        });

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useLoginFlow({ onSuccess }), { wrapper });

      await act(async () => {
        await result.current.initiateLogin("03001234567");
      });
      await act(async () => {
        await result.current.verifyOtp("654321");
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[2]?.[0]).toContain("/api/auth/verify-otp");
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ id: "usr_001" }),
        "access_token_xyz"
      );
    });

    it("sets twoFactorPending when server requires 2FA", async () => {
      mockFetch
        .mockResolvedValueOnce(makeIdentifierResponse("otp"))
        .mockResolvedValueOnce(makeSendOtpResponse())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: { twoFactorRequired: true },
            }),
        });

      const { result } = renderHook(() => useLoginFlow(), { wrapper });

      await act(async () => {
        await result.current.initiateLogin("03001234567");
      });
      await act(async () => {
        await result.current.verifyOtp("654321");
      });

      expect(result.current.twoFactorPending).toBe(true);
    });

    it("sets error when OTP is rejected", async () => {
      mockFetch
        .mockResolvedValueOnce(makeIdentifierResponse("otp"))
        .mockResolvedValueOnce(makeSendOtpResponse())
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ success: false, error: "Invalid OTP" }),
        });

      const { result } = renderHook(() => useLoginFlow(), { wrapper });

      await act(async () => {
        await result.current.initiateLogin("03001234567");
      });
      await act(async () => {
        try {
          await result.current.verifyOtp("000000");
        } catch {
          /* expected */
        }
      });

      expect(result.current.error).toBe("Invalid OTP");
    });
  });

  describe("verifyPassword", () => {
    it("calls /api/auth/login and succeeds", async () => {
      // Email → no send-otp; password method → only 2 mocks needed
      mockFetch.mockResolvedValueOnce(makeIdentifierResponse("password")).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              user: { id: "usr_002", role: "vendor" },
              accessToken: "vendor_token",
            },
          }),
      });

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useLoginFlow({ onSuccess }), { wrapper });

      await act(async () => {
        await result.current.initiateLogin("vendor@store.com");
      });
      await act(async () => {
        await result.current.verifyPassword("Str0ngP@ss!");
      });

      expect(mockFetch.mock.calls[1]?.[0]).toContain("/api/auth/login");
      expect(onSuccess).toHaveBeenCalled();
    });

    it("sets error on invalid password", async () => {
      mockFetch.mockResolvedValueOnce(makeIdentifierResponse("password")).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ success: false, error: "Invalid credentials" }),
      });

      const { result } = renderHook(() => useLoginFlow(), { wrapper });

      await act(async () => {
        await result.current.initiateLogin("user@test.com");
      });
      await act(async () => {
        try {
          await result.current.verifyPassword("wrong");
        } catch {
          /* expected */
        }
      });

      expect(result.current.error).toBe("Invalid credentials");
    });
  });

  describe("twoFactorVerify", () => {
    it("calls /api/auth/2fa/verify and calls onSuccess", async () => {
      // Phone: check-identifier + send-otp + verify-otp + 2fa/verify = 4 mocks
      mockFetch
        .mockResolvedValueOnce(makeIdentifierResponse("otp"))
        .mockResolvedValueOnce(makeSendOtpResponse())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: { twoFactorRequired: true } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: { user: { id: "usr_003", role: "customer" }, accessToken: "final_token" },
            }),
        });

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useLoginFlow({ onSuccess }), { wrapper });

      await act(async () => {
        await result.current.initiateLogin("03001234567");
      });
      await act(async () => {
        await result.current.verifyOtp("654321");
      });
      await act(async () => {
        await result.current.twoFactorVerify("123456");
      });

      expect(mockFetch.mock.calls[3]?.[0]).toContain("/api/auth/2fa/verify");
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ id: "usr_003" }),
        "final_token"
      );
      expect(result.current.twoFactorPending).toBe(false);
    });

    it("sets error when 2FA code is wrong", async () => {
      mockFetch
        .mockResolvedValueOnce(makeIdentifierResponse("otp"))
        .mockResolvedValueOnce(makeSendOtpResponse())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: { twoFactorRequired: true } }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ success: false, error: "Invalid 2FA code" }),
        });

      const { result } = renderHook(() => useLoginFlow(), { wrapper });

      await act(async () => {
        await result.current.initiateLogin("03001234567");
      });
      await act(async () => {
        await result.current.verifyOtp("654321");
      });
      await act(async () => {
        try {
          await result.current.twoFactorVerify("000000");
        } catch {
          /* expected */
        }
      });

      expect(result.current.error).toBe("Invalid 2FA code");
    });
  });

  describe("clearError", () => {
    it("clears error state", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ success: false, error: "Some error" }),
      });

      const { result } = renderHook(() => useLoginFlow(), { wrapper });

      await act(async () => {
        try {
          await result.current.initiateLogin("bad");
        } catch {
          /* ok */
        }
      });
      expect(result.current.error).toBeTruthy();

      await act(async () => {
        result.current.clearError();
      });
      expect(result.current.error).toBeNull();
    });
  });
});
