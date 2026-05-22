/**
 * useAuth — ajkmart (customer) auth operations hook
 *
 * Wraps customer auth API so every call returns { success, data, error }.
 * React Native compatible — no window.fetch assumptions.
 * Includes: register, biometricLogin, loading state, Sentry capture.
 */
import { useAuth as useAuthContext } from "@/context/AuthContext";
import { useState, useCallback } from "react";

export interface AuthResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TokenPair {
  token: string;
  refreshToken?: string;
}

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;

function networkError(err: unknown): string {
  if (err instanceof Error && (err.message.includes("fetch") || err.message.includes("network"))) {
    return "No internet connection. Please check your network and try again.";
  }
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

async function captureException(err: unknown) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Sentry = await import("@sentry/react-native" as string) as any;
    Sentry.captureException(err);
  } catch { /* Sentry not installed */ }
}

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json() as { data?: T; message?: string } & T;
  if (!res.ok) throw new Error((json as Record<string, unknown>).message as string ?? "Request failed");
  return ((json as Record<string, unknown>).data ?? json) as T;
}

export function useAuth() {
  const { login: appLogin, logout: appLogout } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);

  const wrap = useCallback(<T,>(fn: () => Promise<AuthResult<T>>): Promise<AuthResult<T>> => {
    setIsLoading(true);
    return fn().finally(() => setIsLoading(false));
  }, []);

  async function sendOtp(phone: string): Promise<AuthResult<{ otp?: string; channel?: string }>> {
    return wrap(async () => {
      try {
        const data = await apiPost<Record<string, unknown>>("/auth/send-otp", { phone });
        return { success: true, data: data as never };
      } catch (err: unknown) {
        await captureException(err);
        return { success: false, error: networkError(err) };
      }
    });
  }

  async function verifyOtp(phone: string, otp: string): Promise<AuthResult<TokenPair & { requires2FA?: boolean }>> {
    return wrap(async () => {
      try {
        const data = await apiPost<Record<string, unknown>>("/auth/verify-otp", { phone, otp });
        return { success: true, data: data as never };
      } catch (err: unknown) {
        await captureException(err);
        return { success: false, error: networkError(err) };
      }
    });
  }

  async function loginWithPassword(identifier: string, password: string): Promise<AuthResult<TokenPair & { requires2FA?: boolean; tempToken?: string }>> {
    return wrap(async () => {
      try {
        const data = await apiPost<Record<string, unknown>>("/auth/login", { identifier, password });
        return { success: true, data: data as never };
      } catch (err: unknown) {
        await captureException(err);
        return { success: false, error: networkError(err) };
      }
    });
  }

  async function register(body: { name: string; phone: string; city: string; password: string; role?: string }): Promise<AuthResult<{ token?: string; user?: unknown }>> {
    return wrap(async () => {
      try {
        const data = await apiPost<Record<string, unknown>>("/auth/register", { ...body, role: body.role ?? "customer" });
        return { success: true, data: data as never };
      } catch (err: unknown) {
        await captureException(err);
        return { success: false, error: networkError(err) };
      }
    });
  }

  async function biometricLogin(): Promise<AuthResult<TokenPair>> {
    return wrap(async () => {
      try {
        const { getBiometricToken } = await (import("@/lib/biometric" as string) as Promise<{getBiometricToken?: () => Promise<string>}>).catch(() => ({} as never));
        if (!getBiometricToken) throw new Error("Biometric not available");
        const refreshToken = await getBiometricToken();
        const data = await apiPost<Record<string, unknown>>("/auth/refresh", { refreshToken });
        return { success: true, data: { token: data.token as string, refreshToken } };
      } catch (err: unknown) {
        await captureException(err);
        return { success: false, error: networkError(err) };
      }
    });
  }

  async function logout(): Promise<AuthResult> {
    return wrap(async () => {
      try {
        await appLogout();
        return { success: true };
      } catch (err: unknown) {
        await captureException(err);
        return { success: false, error: networkError(err) };
      }
    });
  }

  return { sendOtp, verifyOtp, loginWithPassword, register, biometricLogin, logout, login: appLogin, isLoading };
}
