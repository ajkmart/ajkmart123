import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthContext } from "../AuthProvider";

/* ── Shape types (mirror the backend response exactly) ─────────────────── */

export interface Session {
  id: string;
  deviceName: string | null;
  browser: string | null;
  os: string | null;
  ip: string | null;
  location: string | null;
  lastActiveAt: string;
  createdAt: string;
}

export interface LoginHistoryEntry {
  id: string;
  ip: string | null;
  deviceName: string | null;
  browser: string | null;
  os: string | null;
  location: string | null;
  success: boolean;
  method: string | null;
  createdAt: string;
}

/* ── Hook options ──────────────────────────────────────────────────────── */

export interface UseSessionManagerOptions {
  /**
   * Override the API base URL.  Defaults to the value in AuthProvider.
   */
  baseURL?: string;
  /**
   * Automatically fetch active sessions when the hook mounts.
   * Default: true
   */
  autoFetchSessions?: boolean;
  /**
   * Automatically fetch login history when the hook mounts.
   * Default: false  (call refreshHistory() on demand instead)
   */
  autoFetchHistory?: boolean;
}

/* ── Return type ───────────────────────────────────────────────────────── */

export interface UseSessionManagerResult {
  /** Currently active sessions for this user */
  sessions: Session[];
  /** Last 20 login-history entries (empty until refreshHistory is called) */
  history: LoginHistoryEntry[];
  /** True while the sessions list is being fetched or refreshed */
  loadingSessions: boolean;
  /** True while login history is being fetched */
  loadingHistory: boolean;
  /**
   * ID of the session currently being revoked, or null when idle.
   * Useful for showing a per-row spinner.
   */
  revokingId: string | null;
  /** Last error message, or null when everything is fine */
  error: string | null;
  /** Re-fetch the active sessions list */
  refreshSessions: () => Promise<void>;
  /** Fetch (or re-fetch) the login history */
  refreshHistory: () => Promise<void>;
  /**
   * Revoke a single session by ID.
   * The sessions list is refreshed automatically on success.
   */
  revokeSession: (sessionId: string) => Promise<void>;
  /**
   * Revoke every session except the most-recently-active one.
   * Useful for "log out all other devices".
   * The sessions list is refreshed automatically on success.
   */
  revokeAllOthers: () => Promise<void>;
  /**
   * Revoke ALL sessions (including the current one).
   * Calls AuthProvider.logout() automatically so the app redirects to login.
   */
  revokeAll: () => Promise<void>;
  /** Clear the current error message */
  clearError: () => void;
}

/* ── Internal helpers ──────────────────────────────────────────────────── */

interface ApiSuccess<T = undefined> {
  success: true;
  data?: T;
  message?: string;
}

interface ApiError {
  success: false;
  error: string;
}

type ApiResponse<T = undefined> = ApiSuccess<T> | ApiError;

async function apiFetch<T = undefined>(
  url: string,
  token: string | null,
  init?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { ...init, headers });
  const json = (await res.json()) as ApiResponse<T>;

  if (!res.ok || !json.success) {
    throw new Error((json as ApiError).error ?? `Request failed with status ${res.status}`);
  }
  return (json as ApiSuccess<T>).data as T;
}

/* ── Hook implementation ───────────────────────────────────────────────── */

export function useSessionManager(options: UseSessionManagerOptions = {}): UseSessionManagerResult {
  const ctx = useAuthContext();
  const base = options.baseURL ?? ctx.baseURL;
  const autoFetchSessions = options.autoFetchSessions ?? true;
  const autoFetchHistory = options.autoFetchHistory ?? false;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [history, setHistory] = useState<LoginHistoryEntry[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Keep a stable ref to the token so callbacks don't re-create on every render */
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = ctx.tokenStorage.getAccessToken();

  const clearError = useCallback(() => setError(null), []);

  /* ── refreshSessions ───────────────────────────────────────────────── */
  const refreshSessions = useCallback(async () => {
    setLoadingSessions(true);
    setError(null);
    try {
      const data = await apiFetch<{ sessions: Session[] }>(
        `${base}/api/auth/sessions`,
        tokenRef.current
      );
      setSessions(data?.sessions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoadingSessions(false);
    }
  }, [base]);

  /* ── refreshHistory ────────────────────────────────────────────────── */
  const refreshHistory = useCallback(async () => {
    setLoadingHistory(true);
    setError(null);
    try {
      const data = await apiFetch<{ history: LoginHistoryEntry[] }>(
        `${base}/api/auth/login-history`,
        tokenRef.current
      );
      setHistory(data?.history ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoadingHistory(false);
    }
  }, [base]);

  /* ── revokeSession ─────────────────────────────────────────────────── */
  const revokeSession = useCallback(
    async (sessionId: string) => {
      setRevokingId(sessionId);
      setError(null);
      try {
        await apiFetch(
          `${base}/api/auth/sessions/${encodeURIComponent(sessionId)}`,
          tokenRef.current,
          { method: "DELETE" }
        );
        /* Optimistic remove — replace from server to stay consistent */
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        /* Background refresh to sync server state */
        void refreshSessions();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to revoke session");
      } finally {
        setRevokingId(null);
      }
    },
    [base, refreshSessions]
  );

  /* ── revokeAllOthers ───────────────────────────────────────────────── */
  const revokeAllOthers = useCallback(async () => {
    setRevokingId("__others__");
    setError(null);
    try {
      await apiFetch(`${base}/api/auth/sessions/revoke`, tokenRef.current, {
        method: "POST",
        body: JSON.stringify({ revokeAllExceptCurrent: true }),
      });
      void refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke other sessions");
    } finally {
      setRevokingId(null);
    }
  }, [base, refreshSessions]);

  /* ── revokeAll ─────────────────────────────────────────────────────── */
  const revokeAll = useCallback(async () => {
    setRevokingId("__all__");
    setError(null);
    try {
      await apiFetch(`${base}/api/auth/sessions`, tokenRef.current, { method: "DELETE" });
      setSessions([]);
      setHistory([]);
      /* All sessions gone — clear loading state then log out */
      setRevokingId(null);
      ctx.logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke all sessions");
      setRevokingId(null);
    }
  }, [base, ctx]);

  /* ── Auto-fetch on mount ───────────────────────────────────────────── */
  useEffect(() => {
    if (autoFetchSessions && ctx.isAuthenticated) {
      void refreshSessions();
    }
    // Run once when authenticated state is confirmed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.isAuthenticated]);

  useEffect(() => {
    if (autoFetchHistory && ctx.isAuthenticated) {
      void refreshHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.isAuthenticated]);

  return {
    sessions,
    history,
    loadingSessions,
    loadingHistory,
    revokingId,
    error,
    refreshSessions,
    refreshHistory,
    revokeSession,
    revokeAllOthers,
    revokeAll,
    clearError,
  };
}
