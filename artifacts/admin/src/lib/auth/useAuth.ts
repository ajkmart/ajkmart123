/**
 * useAuth — admin auth operations hook
 *
 * Wraps the admin auth context so every call returns a consistent
 * { success, data, error } shape. Admin uses username+password+TOTP only.
 *
 * Includes: login (with MFA overlay support), logout.
 */
import { useAdminAuth } from "../adminAuthContext";

export interface AuthResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  retryAfter?: number;
}

export interface AdminLoginData {
  requiresMfa?: boolean;
  tempToken?: string;
}

function networkError(err: unknown): string {
  if (err instanceof Error && err.message.includes("fetch"))
    return "No internet connection. Please check your network.";
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

export function useAuth() {
  const { login, state, clearError, logout: adminLogout } = useAdminAuth();

  async function loginWithPassword(
    username: string,
    password: string,
    totp?: string,
    tempToken?: string | null
  ): Promise<AuthResult<AdminLoginData>> {
    try {
      clearError();
      await login(username, password, totp, tempToken ?? undefined);
      return { success: true };
    } catch (err: unknown) {
      if (err && typeof err === "object" && "requiresMfa" in err) {
        const e = err as { requiresMfa: boolean; tempToken?: string };
        return {
          success: false,
          error: "mfa_required",
          data: { requiresMfa: true, tempToken: e.tempToken },
        };
      }
      const errObj = err as Record<string, unknown> | null;
      const status = errObj?.status as number | undefined;
      if (status === 429) {
        const rd = errObj?.responseData as Record<string, unknown> | undefined;
        const retryAfter = typeof rd?.retryAfter === "number" ? rd.retryAfter : 60;
        return {
          success: false,
          error: "Too many attempts. Please wait before trying again.",
          retryAfter,
        };
      }
      return { success: false, error: networkError(err) };
    }
  }

  async function logout(): Promise<AuthResult> {
    try {
      await adminLogout();
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: networkError(err) };
    }
  }

  return { loginWithPassword, logout, isLoading: state.isLoading };
}
