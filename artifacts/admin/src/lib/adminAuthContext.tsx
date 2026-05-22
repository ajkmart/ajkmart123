import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { createLogger } from "@/lib/logger";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
const log = createLogger("[adminAuthContext]");

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  /** Login handle. Returned by every auth response so the popup can prefill it. */
  username?: string;
  role: string;
  /**
   * @deprecated Legacy "must change password" flag. The forced rotation gate
   * has been removed; the field is still surfaced so legacy callers keep
   * compiling. Do not add new references — it will be removed in a future cleanup.
   */
  mustChangePassword?: boolean;
  /**
   * True while the admin is still using the seeded default credentials.
   * Drives the OPTIONAL post-login popup that lets the super-admin update
   * their username and/or password. Skipping the popup keeps the defaults
   * working — nothing is gated on this flag.
   */
  usingDefaultCredentials?: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: AdminUser | null;
  isLoading: boolean;
  error: string | null;
  /**
   * @deprecated Always false. The forced password-change flow has been
   * removed; kept on the type so existing readers do not break.
   */
  mustChangePassword: boolean;
  /**
   * Mirrors `user.usingDefaultCredentials` from the most recent auth
   * response. The SPA renders the optional credentials popup when this
   * is true and the admin has not yet dismissed it for the session.
   */
  usingDefaultCredentials: boolean;
  /**
   * Set when the user clicks "Skip for now" so the popup does not
   * re-open during the same browser session. Cleared on logout / next
   * login (state is component-local, not persisted).
   */
  defaultCredentialsDismissed: boolean;
}

interface AuthContextType {
  state: AuthState;
  login: (username: string, password: string, totp?: string, tempToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string>;
  /**
   * Submits a password change against POST /api/admin/auth/change-password.
   * Returns the fresh access token; the credential popup uses it directly
   * so any subsequent username PATCH carries the rotated session.
   */
  changePassword: (currentPassword: string, newPassword: string) => Promise<string>;
  /**
   * Marks the credentials popup as dismissed for the rest of the session.
   * "Skip for now" — the default credentials keep working and the dialog
   * stops re-opening until the next login.
   */
  dismissDefaultCredentialsPrompt: () => void;
  /**
   * Patches the current admin's profile (used by the credentials popup
   * to apply a new username and/or display name without going through
   * the password endpoint). Mirrors the response into auth state.
   */
  updateOwnProfile: (input: { username?: string; name?: string }) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INITIAL_STATE: AuthState = {
  accessToken: null,
  user: null,
  isLoading: true,
  error: null,
  mustChangePassword: false,
  usingDefaultCredentials: false,
  defaultCredentialsDismissed: false,
};

/**
 * Decode the `exp` claim from a JWT access token without verifying its
 * signature (the server handles verification). Returns `null` when the
 * token is malformed or the claim is absent.
 */
function getJwtExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null; // Token must have 3 parts: header.payload.signature
    const payload = parts[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch (_e) {
    return null;
  }
}

/** Five minutes before expiry → show a dismissable warning banner. */
const SESSION_WARN_BEFORE_MS = 5 * 60_000;
/** Sixty seconds before expiry → auto-refresh silently (no user action needed). */
const PROACTIVE_REFRESH_BEFORE_MS = 60_000;

/**
 * Admin Auth Provider
 * Manages authentication state with in-memory access tokens
 * Refresh tokens are stored in HttpOnly cookies (handled by browser automatically)
 */
export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  // Use a ref to prevent concurrent refresh requests
  // This persists across renders so concurrent calls share one in-flight promise
  const refreshPromiseRef = useRef<Promise<string> | null>(null);

  // Timer that fires the 5-minute warning toast
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timer that silently auto-refreshes the token 60s before expiry
  const proactiveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which token the current timers were set for (avoids duplicate timers)
  const timerTokenRef = useRef<string | null>(null);
  // Deduplication flag: prevents the same session-expiry toast from showing
  // multiple times if scheduleExpiryWarning is called concurrently.
  const expiryToastShownRef = useRef<boolean>(false);

  /**
   * Schedule both session timers whenever the access token changes:
   *  1. Proactive silent refresh  — 60 s before expiry (no user action needed).
   *  2. Warning toast             — 5 min before expiry with "Extend Session" CTA.
   */
  const scheduleExpiryWarning = useCallback((token: string, refreshFn: () => Promise<string>) => {
    if (timerTokenRef.current === token) return; // already scheduled for this token

    // Clear any previous timers
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    if (proactiveRefreshTimerRef.current) {
      clearTimeout(proactiveRefreshTimerRef.current);
      proactiveRefreshTimerRef.current = null;
    }
    timerTokenRef.current = token;

    const expiresAt = getJwtExpiry(token);
    if (!expiresAt) return;

    // ── 1. Proactive silent refresh at T-60s ──────────────────────────────
    const msUntilRefresh = expiresAt - Date.now() - PROACTIVE_REFRESH_BEFORE_MS;
    if (msUntilRefresh > 0) {
      proactiveRefreshTimerRef.current = setTimeout(() => {
        proactiveRefreshTimerRef.current = null;
        refreshFn().catch((err) => {
          log.warn("[adminAuth] Proactive token refresh failed:", err);
          // refreshFn() already shows the "Session expired" toast and redirects
          // on a genuine 401 — nothing else to do here.
        });
      }, msUntilRefresh);
    }

    // ── 2. Warning toast at T-5min ────────────────────────────────────────
    const msLeft = expiresAt - Date.now() - SESSION_WARN_BEFORE_MS;
    if (msLeft <= 0) return; // less than 5 min left — proactive refresh will handle it

    expiryToastShownRef.current = false;
    expiryTimerRef.current = setTimeout(() => {
      expiryTimerRef.current = null;
      if (expiryToastShownRef.current) return;
      expiryToastShownRef.current = true;
      toast({
        title: "Your session expires in 5 minutes",
        description: 'Click "Extend Session" to stay logged in.',
        duration: 4 * 60_000, // dismiss just before the auto-refresh fires
        action: (
          <ToastAction
            altText="Extend Session"
            onClick={() => {
              refreshFn().catch((err) => {
                log.warn("[adminAuth] Manual session extend failed:", err);
              });
            }}
          >
            Extend Session
          </ToastAction>
        ),
      });
    }, msLeft);
  }, []);

  /** Cancel all session timers (called on logout or after a successful refresh). */
  const cancelExpiryWarning = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    if (proactiveRefreshTimerRef.current) {
      clearTimeout(proactiveRefreshTimerRef.current);
      proactiveRefreshTimerRef.current = null;
    }
    timerTokenRef.current = null;
  }, []);

  /**
   * Refresh access token using refresh token cookie
   * Browser automatically sends refresh_token cookie with request
   */
  const refreshAccessToken = useCallback(async (): Promise<string> => {
    // If a refresh is already in progress, return the pending promise
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = (async () => {
      try {
        const response = await fetch("/api/admin/auth/refresh", {
          method: "POST",
          credentials: "include", // Include cookies (refresh_token, csrf_token)
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            // Refresh token expired or invalid — clear auth, toast, redirect.
            cancelExpiryWarning();
            toast({
              variant: "destructive",
              title: "Session expired",
              description: "Please log in again to continue.",
            });
            setState({
              ...INITIAL_STATE,
              isLoading: false,
              error: "Session expired. Please log in again.",
            });
            // Soft-navigate via the event so the React router redirects without
            // a full page reload (preserves unsaved form state in other tabs).
            window.dispatchEvent(new CustomEvent("admin:force-redirect-to-login"));
            throw new Error("Session expired");
          }
          throw new Error("Failed to refresh token");
        }

        const data = await response.json();
        setState((prev) => ({
          ...prev,
          accessToken: data.accessToken,
          user: data.user
            ? {
                ...(prev.user ?? { id: "", name: "", email: "", role: "" }),
                ...data.user,
              }
            : prev.user,
          mustChangePassword: !!data.mustChangePassword,
          usingDefaultCredentials: !!data.usingDefaultCredentials,
          // Preserve session-scoped dismissal so refresh does not re-open the popup.
          error: null,
        }));

        return data.accessToken;
      } catch (err) {
        log.error("Token refresh failed:", err);
        throw err;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, [cancelExpiryWarning]);

  // Schedule the expiry warning whenever the token changes
  useEffect(() => {
    if (state.accessToken) {
      scheduleExpiryWarning(state.accessToken, refreshAccessToken);
    } else {
      cancelExpiryWarning();
    }

    return () => cancelExpiryWarning(); // Cleanup on unmount to prevent race conditions
  }, [state.accessToken, scheduleExpiryWarning, cancelExpiryWarning, refreshAccessToken]);

  /**
   * Session check when the tab regains focus after a long idle period.
   * If the in-memory token is missing or within 60 s of expiry, attempt a
   * silent refresh so the admin never hits a 401 on their first post-idle call.
   */
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      // Nothing to check when already logged out
      if (!state.accessToken) return;

      const expiresAt = getJwtExpiry(state.accessToken);
      // Malformed token — let the next API call's 401 handler take over
      if (!expiresAt) return;

      const msLeft = expiresAt - Date.now();
      // If already expired or within the 60-second proactive window → refresh now
      if (msLeft < PROACTIVE_REFRESH_BEFORE_MS) {
        refreshAccessToken().catch((err) => {
          // refreshAccessToken() already shows the toast and redirects on 401
          log.warn("[adminAuth] Visibility-change token refresh failed:", err);
        });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [state.accessToken, refreshAccessToken]);

  /**
   * On mount, attempt to restore session by refreshing access token
   * This allows users to stay logged in across page reloads.
   *
   * Optimization: skip the refresh call entirely when the host-readable
   * `csrf_token` cookie is absent. The only paths that issue a refresh
   * cookie (login, MFA, refresh) also set `csrf_token`, and logout clears
   * both — so an absent CSRF cookie reliably means "no session". Skipping
   * the call avoids a noisy 401 in browser DevTools on first-time visits.
   */
  useEffect(() => {
    const restoreSession = async () => {
      if (!readCsrfFromCookie()) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: null,
        }));
        return;
      }

      try {
        await refreshAccessToken();
        setState((prev) => ({
          ...prev,
          isLoading: false,
        }));
      } catch (_err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: null, // Don't show error on initial load if no session
        }));
      }
    };

    void restoreSession();
  }, [refreshAccessToken]);

  /**
   * Login with credentials
   * Supports both password-only and MFA flow
   */
  const login = useCallback(
    async (
      username: string,
      password: string,
      totp?: string,
      tempToken?: string,
      deviceMeta?: Record<string, unknown>
    ) => {
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        // If TOTP is provided, use the 2FA endpoint
        if (totp && tempToken) {
          const response = await fetch("/api/admin/auth/2fa", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tempToken,
              totp,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "MFA verification failed");
          }

          const data = await response.json();
          setState({
            accessToken: data.accessToken,
            user: data.user,
            isLoading: false,
            error: null,
            mustChangePassword: !!data.mustChangePassword,
            usingDefaultCredentials: !!data.usingDefaultCredentials,
            // Each fresh login resets the dismissal so the popup gets a chance again.
            defaultCredentialsDismissed: false,
          });
          return;
        }

        // Initial login with username/password
        const response = await fetch("/api/admin/auth/login", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            password,
            ...(deviceMeta ? { deviceMeta } : {}),
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Login failed");
        }

        const data = await response.json();

        // If MFA is required, throw a special error that includes the tempToken
        if (data.requiresMfa) {
          throw Object.assign(new Error(data.message || "MFA required"), {
            requiresMfa: true as const,
            tempToken: data.tempToken as string | undefined,
          });
        }

        // Login successful
        setState({
          accessToken: data.accessToken,
          user: data.user,
          isLoading: false,
          error: null,
          mustChangePassword: !!data.mustChangePassword,
          usingDefaultCredentials: !!data.usingDefaultCredentials,
          defaultCredentialsDismissed: false,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Login failed";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw err;
      }
    },
    []
  );

  /**
   * Logout and revoke session
   */
  const logout = useCallback(async () => {
    cancelExpiryWarning();
    // Clear sidebar UI state to prevent scroll/selection bleed between admin sessions
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("admin_sidebar_") || k.startsWith("admin_nav_"))
        .forEach((k) => localStorage.removeItem(k));
    } catch (_e) {}
    // Immediately null user + token so the authenticated layout is hidden
    // before the logout API call completes (prevents content flash).
    setState((prev) => ({
      ...prev,
      isLoading: true,
      user: null,
      accessToken: null,
    }));

    try {
      if (state.accessToken) {
        // Try to notify backend of logout
        const csrfToken = readCsrfFromCookie() || ""; // Fallback if cookie is cleared or malformed
        // eslint-disable-next-line ajk-local/no-silent-catch -- logout notification to server is best-effort; local auth state is cleared regardless
        await fetch("/api/admin/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${state.accessToken}`,
            "X-CSRF-Token": csrfToken,
            "Content-Type": "application/json",
          },
        }).catch(() => {
          // Logout failure is acceptable - cookies will be cleared anyway
        });
      }

      setState({ ...INITIAL_STATE, isLoading: false });
    } catch (err) {
      log.error("Logout error:", err);
      // Clear state anyway
      setState({ ...INITIAL_STATE, isLoading: false });
    }
  }, [state.accessToken, cancelExpiryWarning]);

  /**
   * Submit a password change against POST /api/admin/auth/change-password.
   * Returns the rotated access token so the credentials popup can chain
   * a username PATCH against the fresh session.
   */
  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<string> => {
      if (!state.accessToken) throw new Error("Not authenticated");
      const response = await fetch("/api/admin/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.accessToken}`,
          "X-CSRF-Token": readCsrfFromCookie(),
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!response.ok) {
        const error = await response.json().catch((parseErr) => {
          log.debug("[adminAuth] Failed to parse error response:", parseErr);
          return {};
        });
        throw new Error(error.error || "Failed to change password");
      }

      const data = await response.json();
      const nextToken = data.accessToken ?? state.accessToken;
      setState((prev) => ({
        ...prev,
        accessToken: nextToken,
        user: data.user
          ? { ...(prev.user ?? { id: "", name: "", email: "", role: "" }), ...data.user }
          : prev.user,
        mustChangePassword: false,
        usingDefaultCredentials: false,
        error: null,
      }));
      return nextToken;
    },
    [state.accessToken]
  );

  const dismissDefaultCredentialsPrompt = useCallback(() => {
    setState((prev) => ({ ...prev, defaultCredentialsDismissed: true }));
  }, []);

  /**
   * PATCH /api/admin/system/admin-accounts/:id for the currently
   * authenticated admin. The backend clears `defaultCredentials` on
   * self-edit so the popup never reopens after the user picks a custom
   * username.
   */
  const updateOwnProfile = useCallback(
    async (input: { username?: string; name?: string }) => {
      const adminId = state.user?.id;
      if (!adminId) {
        setState((prev) => ({
          ...prev,
          error: "Not authenticated",
        }));
        throw new Error("Not authenticated");
      }
      if (!state.accessToken) {
        setState((prev) => ({
          ...prev,
          error: "Not authenticated",
        }));
        throw new Error("Not authenticated");
      }

      const response = await fetch(`/api/admin/system/admin-accounts/${adminId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.accessToken}`,
          "X-CSRF-Token": readCsrfFromCookie(),
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json().catch((parseErr) => {
          log.debug("[adminAuth] Failed to parse error response:", parseErr);
          return {};
        });
        throw new Error(error.error || "Failed to update profile");
      }

      const data = await response.json();
      const updated = data?.account ?? data;

      // Validate response data is not completely empty
      if (!updated) {
        throw new Error("Server returned empty response when updating profile");
      }

      setState((prev) => ({
        ...prev,
        user: prev.user
          ? {
              ...prev.user,
              ...(updated?.username !== undefined ? { username: updated.username } : {}),
              ...(updated?.name !== undefined ? { name: updated.name } : {}),
            }
          : prev.user,
        usingDefaultCredentials: false,
      }));
    },
    [state.user?.id, state.accessToken]
  );

  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        state,
        login,
        logout,
        refreshAccessToken,
        changePassword,
        dismissDefaultCredentialsPrompt,
        updateOwnProfile,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 */
export function useAdminAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return context;
}

/**
 * Read CSRF token from cookie. Defensive against:
 * - document being undefined (SSR / build-time evaluation)
 * - malformed cookies (decodeURIComponent throws on bad %-escapes)
 * - cookies that contain '=' in their value
 */
export function readCsrfFromCookie(): string {
  if (typeof document === "undefined" || !document.cookie) return "";
  try {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const trimmed = cookie.trim();
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const rawValue = trimmed.slice(eqIdx + 1);
      if (key === "csrf_token") {
        try {
          return decodeURIComponent(rawValue);
        } catch (_e) {
          return rawValue;
        }
      }
    }
  } catch (_e) {
    /* ignore - fall through to empty string */
  }
  return "";
}

/* ─────────────────────────────────────────────────────────────────
 * Selector hooks
 *
 * Components that only need a slice of auth state should use these
 * narrow selectors instead of `useAdminAuth()` so they don't re-render
 * on unrelated context changes (e.g. token rotation refreshing
 * `accessToken` should not re-render a component that only reads the
 * current admin's display name).
 *
 * This is the lightweight, incremental form of the broader
 * "Context-Based State Architecture" refactor in `bugs.md` —
 * selector hooks now exist for the highest-traffic slices and pages
 * can opt in without touching the provider.
 * ───────────────────────────────────────────────────────────────── */

/** Returns the current admin user (or `null` when logged out). */
export function useAdminUser(): AdminUser | null {
  return useAdminAuth().state.user;
}

/** Returns just the access token; `null` when not authenticated. */
export function useAdminAccessToken(): string | null {
  return useAdminAuth().state.accessToken;
}

/** Returns the auth-ready boolean (true once bootstrap is no longer loading). */
export function useAdminAuthReady(): boolean {
  return !useAdminAuth().state.isLoading;
}

/** Returns true when the user is authenticated and ready to make calls. */
export function useIsAdminAuthenticated(): boolean {
  const { state } = useAdminAuth();
  return !!state.accessToken && !!state.user;
}
