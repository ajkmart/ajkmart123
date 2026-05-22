/**
 * useAuth — rider-app auth operations hook
 *
 * Wraps the rider API surface so every call returns a consistent
 * { success, data, error } shape. Components never handle raw throw/catch.
 *
 * Includes: login, logout, OTP, password, refresh, register, biometricLogin,
 * loading state, network guard, Sentry capture.
 */
import { createLogger } from "@/lib/logger";
import { useCallback, useState } from "react";
import { api } from "../api";
import { useAuth as useAuthContext } from "../rider-auth";
const log = createLogger("[useAuth]");

export interface AuthResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TokenPair {
  token: string;
  refreshToken?: string;
}

function networkError(err: unknown): string {
  if (err instanceof Error && err.message.includes("fetch"))
    return "No internet connection. Please check your network.";
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

async function captureException(err: unknown) {
  try {
    if (import.meta.env.VITE_SENTRY_DSN) {
      const Sentry = await import("@sentry/react");
      Sentry.captureException(err);
    }
  } catch (e) {
    log.debug("[useAuth] Sentry capture failed (not available):", e);
  }
}

export function useAuthOps() {
  const { logout: appLogout } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);

  const wrap = useCallback(<T>(fn: () => Promise<AuthResult<T>>): Promise<AuthResult<T>> => {
    setIsLoading(true);
    return fn().finally(() => setIsLoading(false));
  }, []);

  async function sendOtp(
    phone: string
  ): Promise<AuthResult<{ otp?: string; channel?: string; fallbackChannels?: string[] }>> {
    return wrap(async () => {
      try {
        const res = (await api.sendOtp(phone)) as Record<string, unknown>;
        return { success: true, data: res as never };
      } catch (err: unknown) {
        await captureException(err);
        return { success: false, error: networkError(err) };
      }
    });
  }

  async function verifyOtp(phone: string, otp: string): Promise<AuthResult<TokenPair>> {
    return wrap(async () => {
      try {
        const res = (await api.verifyOtp(phone, otp)) as Record<string, unknown>;
        return {
          success: true,
          data: {
            token: res.accessToken as string,
            refreshToken: res.refreshToken as string | undefined,
          },
        };
      } catch (err: unknown) {
        await captureException(err);
        return { success: false, error: networkError(err) };
      }
    });
  }

  async function loginWithPassword(
    identifier: string,
    password: string
  ): Promise<AuthResult<TokenPair & { requires2FA?: boolean; tempToken?: string }>> {
    return wrap(async () => {
      try {
        const res = (await api.loginUsername(identifier, password)) as Record<string, unknown>;
        return {
          success: true,
          data: {
            token: res.accessToken as string,
            refreshToken: res.refreshToken as string | undefined,
            requires2FA: res.requires2FA as boolean | undefined,
            tempToken: res.tempToken as string | undefined,
          },
        };
      } catch (err: unknown) {
        await captureException(err);
        return { success: false, error: networkError(err) };
      }
    });
  }

  async function register(
    body: Record<string, unknown>
  ): Promise<AuthResult<{ token?: string; user?: unknown }>> {
    return wrap(async () => {
      try {
        const res = (await api.registerRider(
          body as Parameters<typeof api.registerRider>[0]
        )) as Record<string, unknown>;
        return { success: true, data: res as never };
      } catch (err: unknown) {
        await captureException(err);
        return { success: false, error: networkError(err) };
      }
    });
  }

  async function biometricLogin(): Promise<AuthResult<TokenPair>> {
    return wrap(async () => {
      try {
        const { getBiometricToken } = await import("../biometric").catch(() => ({}) as never);
        if (!getBiometricToken) throw new Error("Biometric not available");
        const storedRefreshToken = await getBiometricToken();
        /* Route through api.refreshToken() — mutex-guarded, single refresh path,
           prevents race with proactive refresh in useTokenRefresh hook.
           api.refreshToken() returns a status string ("refreshed"|"transient"|"auth_failed"),
           NOT a token payload — tokens are written directly to storage on success. */
        api.storeTokens(api.getToken(), storedRefreshToken);
        const status = await api.refreshToken();
        if (status !== "refreshed")
          throw new Error(`Biometric login failed — refresh status: ${String(status)}`);
        const token = api.getToken();
        if (!token) throw new Error("Biometric login failed — no token in storage after refresh");
        return {
          success: true,
          data: { token, refreshToken: api.getRefreshToken() ?? storedRefreshToken },
        };
      } catch (err: unknown) {
        await captureException(err);
        return { success: false, error: networkError(err) };
      }
    });
  }

  async function refreshToken(storedRefresh: string): Promise<AuthResult<TokenPair>> {
    return wrap(async () => {
      try {
        /* Route through api.refreshToken() — mutex-guarded, single refresh path.
           Returns status string — read updated tokens from storage on success. */
        api.storeTokens(api.getToken(), storedRefresh);
        const status = await api.refreshToken();
        if (status !== "refreshed")
          throw new Error(`Token refresh failed — status: ${String(status)}`);
        const token = api.getToken();
        if (!token) throw new Error("Refresh failed — no token in storage after refresh");
        return { success: true, data: { token, refreshToken: api.getRefreshToken() } };
      } catch (err: unknown) {
        await captureException(err);
        return { success: false, error: networkError(err) };
      }
    });
  }

  async function logout(): Promise<AuthResult> {
    return wrap(async () => {
      try {
        const refresh = api.getRefreshToken?.();
        await api.logout(refresh ?? undefined);
        appLogout();
        return { success: true };
      } catch (err: unknown) {
        await captureException(err);
        appLogout();
        return { success: false, error: networkError(err) };
      }
    });
  }

  return {
    sendOtp,
    verifyOtp,
    loginWithPassword,
    register,
    biometricLogin,
    refreshToken,
    logout,
    isLoading,
  };
}
