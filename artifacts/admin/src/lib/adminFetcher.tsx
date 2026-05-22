import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { createLogger } from "@/lib/logger";
import { createApiFetcher, FetchTimeoutError, RefreshError } from "@workspace/api-client-react";
import { readCsrfFromCookie } from "./adminAuthContext";
import { safeSessionSet } from "./safeStorage";
const log = createLogger("[adminFetcher]");

/**
 * Typed Error for non-2xx admin fetcher responses. Replaces the previous
 * `(error as any).status = …` pattern so callers can `instanceof`
 * narrow and read the HTTP status without `any`.
 */
export class AdminFetchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminFetchError";
    this.status = status;
  }
}

/**
 * Typed error for requests that exceeded the timeout window.
 * Callers can `instanceof TimeoutError` to show specific UX.
 */
export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

/** Abort requests that take longer than this (milliseconds). */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * API base URL.  Empty string = same origin (Replit reverse proxy handles
 * routing — admin on :3000 and API on :5000 share the same public domain).
 * Set VITE_API_BASE_URL only when admin and API are on different domains
 * (e.g. VITE_API_BASE_URL=https://api.yourdomain.com in external production).
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/**
 * Returns an AbortSignal that fires after `ms` milliseconds.
 * Sets the abort reason to a TimeoutError so callers can distinguish
 * our timeout from external aborts (e.g. component unmount).
 * Merges with an optional external signal so either side can abort.
 */
function timeoutSignal(ms: number, externalSignal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  let timerId: ReturnType<typeof setTimeout> | null = null;

  // Set up internal timeout
  timerId = setTimeout(() => controller.abort(new TimeoutError()), ms);

  // Clean up timer on internal abort
  const internalAbortListener = () => {
    if (timerId != null) clearTimeout(timerId);
  };
  controller.signal.addEventListener("abort", internalAbortListener, { once: true });

  // Merge with external signal if provided
  if (externalSignal) {
    if (externalSignal.aborted) {
      // External signal already aborted, abort immediately
      if (timerId != null) {
        clearTimeout(timerId);
        timerId = null;
      }
      controller.abort(externalSignal.reason);
    } else {
      // Listen for external signal abort
      const externalAbortListener = () => {
        if (timerId != null) {
          clearTimeout(timerId);
          timerId = null;
        }
        controller.abort(externalSignal.reason);
      };
      externalSignal.addEventListener("abort", externalAbortListener, { once: true });
    }
  }

  return controller.signal;
}

/**
 * If the error is specifically a TimeoutError thrown by our internal timer,
 * show a toast so the user knows the request hung.
 * External aborts (e.g. component unmount via AbortController) are silently
 * swallowed — they are not user-facing errors.
 */
function handleTimeoutError(err: unknown, retry?: () => void): void {
  if (!(err instanceof TimeoutError)) return;
  toast({
    title: "Request timed out",
    description: "The server took too long to respond. Check your connection and try again.",
    variant: "destructive",
    action: retry ? (
      <ToastAction altText="Retry" onClick={retry}>
        Retry
      </ToastAction>
    ) : undefined,
  });
}

// ── Module-level handlers set by the app ────────────────────────────────────
let getAccessToken: (() => string | null) | null = null;
let refreshToken: (() => Promise<string>) | null = null;

/**
 * Set up global token handlers.
 * Called from the App component to connect the fetcher to the auth context.
 */
export function setupAdminFetcherHandlers(
  tokenGetter: () => string | null,
  tokenRefresher: () => Promise<string>
) {
  getAccessToken = tokenGetter;
  refreshToken = tokenRefresher;
}

// ── Shared onRefreshFailed handler ──────────────────────────────────────────
function onAdminRefreshFailed(_isTransient: boolean): void {
  safeSessionSet("admin_session_expired", "Your session has expired. Please log in again.");
  // Dispatch a custom event so the React router can navigate softly without
  // a full page reload (which loses unsaved form state). The event is handled
  // by GlobalAuthRedirect inside the WouterRouter context in App.tsx.
  window.dispatchEvent(new CustomEvent("admin:force-redirect-to-login"));
}

// ── Factory instances ────────────────────────────────────────────────────────
// Created at module load; callbacks close over module-level vars so they
// always use the latest handlers set by setupAdminFetcherHandlers.

const [_adminScopedFetcher] = createApiFetcher({
  baseUrl: `${API_BASE}/api/admin`,
  getToken: () => getAccessToken?.() ?? null,
  setToken: () => {
    /* no-op: refreshFn (auth context) manages in-memory state */
  },
  onRefreshFailed: onAdminRefreshFailed,
  refreshFn: () => {
    if (!refreshToken) throw new Error("Admin fetcher not initialized");
    return refreshToken();
  },
  extraHeaders: () => ({
    "Content-Type": "application/json",
    "X-CSRF-Token": readCsrfFromCookie(),
  }),
  timeoutMs: FETCH_TIMEOUT_MS,
  credentialsMode: "include",
});

const [_adminAbsoluteFetcher] = createApiFetcher({
  baseUrl: API_BASE,
  getToken: () => getAccessToken?.() ?? null,
  setToken: () => {
    /* no-op: refreshFn (auth context) manages in-memory state */
  },
  onRefreshFailed: onAdminRefreshFailed,
  refreshFn: () => {
    if (!refreshToken) throw new Error("Admin fetcher not initialized");
    return refreshToken();
  },
  extraHeaders: () => ({
    "Content-Type": "application/json",
    "X-CSRF-Token": readCsrfFromCookie(),
  }),
  timeoutMs: FETCH_TIMEOUT_MS,
  credentialsMode: "include",
});

// ── Internal helper ──────────────────────────────────────────────────────────

/**
 * Pre-refresh when there is no access token, to avoid a redundant request
 * roundtrip. Falls back to the factory's automatic 401-refresh when the
 * pre-refresh itself fails.
 */
async function ensureToken(context: string): Promise<void> {
  if (getAccessToken?.()) return;
  try {
    await refreshToken!();
  } catch (err) {
    log.error(`Token refresh failed (no token, ${context}):`, err);
    safeSessionSet("admin_session_expired", "Your session has expired. Please log in again.");
    /* Use the same soft-navigation event as onAdminRefreshFailed so the React
       router handles the redirect — no hard page reload, no unsaved state loss. */
    window.dispatchEvent(new CustomEvent("admin:force-redirect-to-login"));
    throw err;
  }
}

// ── Public fetch functions ───────────────────────────────────────────────────

/**
 * Admin API fetcher scoped to `/api/admin/*`.
 * Handles: Bearer token, CSRF, 30-second timeout (with toast), auto-refresh.
 */
export async function fetchAdmin(endpoint: string, options: RequestInit = {}): Promise<any> {
  if (!getAccessToken || !refreshToken) {
    throw new Error("Admin fetcher not initialized. Call setupAdminFetcherHandlers first.");
  }

  await ensureToken("fetchAdmin");

  const signal = timeoutSignal(FETCH_TIMEOUT_MS, options.signal as AbortSignal | undefined);
  try {
    const res = await _adminScopedFetcher(endpoint, { ...options, signal });
    if (!res.ok) {
      const errorData = await res.json().catch((parseErr: unknown) => {
        log.debug("[adminFetcher] Failed to parse error response:", parseErr);
        return {};
      });
      throw new AdminFetchError(errorData.error || `HTTP ${res.status}`, res.status);
    }
    return res.json();
  } catch (err) {
    if (err instanceof RefreshError) {
      throw new Error("Session expired. Please log in again.");
    }
    const reason = (signal as AbortSignal & { reason?: unknown }).reason;
    // FetchTimeoutError = factory's own timer fired (retry or parallel race).
    // TimeoutError = admin's own timer fired (initial request signal).
    const isTimeout =
      err instanceof TimeoutError ||
      err instanceof FetchTimeoutError ||
      reason instanceof TimeoutError;
    if (isTimeout) {
      handleTimeoutError(new TimeoutError(), () => {
        fetchAdmin(endpoint, options).catch((retryErr) => {
          log.warn("[adminFetcher] timeout retry failed:", retryErr);
        });
      });
      throw new TimeoutError();
    }
    throw err;
  }
}

/**
 * Same as fetchAdmin but takes an absolute API path (e.g. `/api/kyc/…`,
 * `/api/payments/…`) instead of being scoped to `/api/admin`.
 * Use this for admin-authenticated routes that live outside `/api/admin/*`.
 */
export async function fetchAdminAbsolute(path: string, options: RequestInit = {}): Promise<any> {
  if (!getAccessToken || !refreshToken) {
    throw new Error("Admin fetcher not initialized. Call setupAdminFetcherHandlers first.");
  }
  if (!path.startsWith("/")) {
    throw new Error(`fetchAdminAbsolute requires an absolute path starting with "/", got: ${path}`);
  }

  await ensureToken("fetchAdminAbsolute");

  const signal = timeoutSignal(FETCH_TIMEOUT_MS, options.signal as AbortSignal | undefined);
  try {
    const res = await _adminAbsoluteFetcher(path, { ...options, signal });
    if (!res.ok) {
      const errorData = await res.json().catch((parseErr: unknown) => {
        log.debug("[adminFetcher] Failed to parse error response:", parseErr);
        return {};
      });
      throw new AdminFetchError(errorData.error || `HTTP ${res.status}`, res.status);
    }
    return res.json();
  } catch (err) {
    if (err instanceof RefreshError) {
      throw new Error("Session expired. Please log in again.");
    }
    const reason = (signal as AbortSignal & { reason?: unknown }).reason;
    const isTimeout =
      err instanceof TimeoutError ||
      err instanceof FetchTimeoutError ||
      reason instanceof TimeoutError;
    if (isTimeout) {
      handleTimeoutError(new TimeoutError(), () => {
        fetchAdminAbsolute(path, options).catch((retryErr) => {
          log.warn("[adminFetcher] absolute timeout retry failed:", retryErr);
        });
      });
      throw new TimeoutError();
    }
    throw err;
  }
}

/**
 * Same as fetchAdminAbsolute but returns the raw Response (not parsed JSON).
 * Use for binary downloads (blobs, CSV exports) while still benefiting from
 * Bearer + CSRF + auto-refresh.
 */
export async function fetchAdminAbsoluteResponse(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!getAccessToken || !refreshToken) {
    throw new Error("Admin fetcher not initialized. Call setupAdminFetcherHandlers first.");
  }
  if (!path.startsWith("/")) {
    throw new Error(
      `fetchAdminAbsoluteResponse requires an absolute path starting with "/", got: ${path}`
    );
  }

  await ensureToken("fetchAdminAbsoluteResponse");

  const signal = timeoutSignal(FETCH_TIMEOUT_MS, options.signal as AbortSignal | undefined);
  try {
    return await _adminAbsoluteFetcher(path, { ...options, signal });
  } catch (err) {
    if (err instanceof RefreshError) {
      throw new Error("Session expired. Please log in again.");
    }
    const reason = (signal as AbortSignal & { reason?: unknown }).reason;
    const isTimeout =
      err instanceof TimeoutError ||
      err instanceof FetchTimeoutError ||
      reason instanceof TimeoutError;
    if (isTimeout) {
      handleTimeoutError(new TimeoutError(), () => {
        fetchAdminAbsoluteResponse(path, options).catch((retryErr) => {
          log.warn("[adminFetcher] response timeout retry failed:", retryErr);
        });
      });
      throw new TimeoutError();
    }
    throw err;
  }
}

/**
 * Read the current in-memory access token (or null). Useful for non-fetch
 * call sites such as Socket.IO `auth` payloads.
 */
export function getAdminAccessToken(): string | null {
  return getAccessToken ? getAccessToken() : null;
}

// ============================================================================
// Drop-in replacements for legacy api.ts helpers
// These mirror the exact data-unwrapping behaviour of the old `fetcher` and
// `apiAbsoluteFetch` so every page can be migrated with a pure import swap.
// ============================================================================

/**
 * Authenticated admin fetch scoped to `/api/admin/*`.
 * Unwraps `response.data` when present — identical to the old `fetcher()`.
 */
export async function adminFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const result = await fetchAdmin(endpoint, options);
  return result?.data !== undefined ? result.data : result;
}

/**
 * Authenticated admin fetch against an absolute API path (e.g. `/api/kyc/…`).
 * Unwraps `response.data` when present — identical to the old `apiAbsoluteFetch()`.
 */
export async function adminAbsoluteFetch(path: string, options: RequestInit = {}): Promise<any> {
  const result = await fetchAdminAbsolute(path, options);
  return result?.data !== undefined ? result.data : result;
}

/**
 * Convenience methods for common HTTP verbs
 */
export async function adminGet(endpoint: string): Promise<any> {
  return fetchAdmin(endpoint, { method: "GET" });
}

export async function adminPost(
  endpoint: string,
  data?: Record<string, unknown>
): Promise<unknown> {
  return fetchAdmin(endpoint, {
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function adminPut(endpoint: string, data?: Record<string, unknown>): Promise<unknown> {
  return fetchAdmin(endpoint, {
    method: "PUT",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function adminDelete(endpoint: string): Promise<unknown> {
  return fetchAdmin(endpoint, { method: "DELETE" });
}

export async function adminPatch(
  endpoint: string,
  data?: Record<string, unknown>
): Promise<unknown> {
  return fetchAdmin(endpoint, {
    method: "PATCH",
    body: data ? JSON.stringify(data) : undefined,
  });
}

// ============================================================================
// File Upload — XHR-based (fetch cannot expose upload progress)
// ============================================================================

/**
 * Upload an admin image with optional progress reporting.
 * Uses XMLHttpRequest because the Fetch API cannot expose upload progress.
 * Calls onProgress(percent) with values 0–100 as bytes are transmitted.
 * Automatically retries once after a token refresh on 401.
 */
export async function uploadAdminImageWithProgress(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (!getAccessToken || !refreshToken) {
    throw new Error("Admin fetcher not initialized. Call setupAdminFetcherHandlers first.");
  }

  const doUpload = (): Promise<{ ok: boolean; status: number; body: unknown }> => {
    const formData = new FormData();
    formData.append("file", file);
    const token = getAccessToken?.() ?? null;
    const csrf = readCsrfFromCookie();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/api/admin/uploads/admin`, true);
      xhr.withCredentials = true;
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      if (csrf) xhr.setRequestHeader("X-CSRF-Token", csrf);
      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
          }
        };
      }
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.onload = () => {
        let parsed: unknown = null;
        try {
          parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          parsed = null;
        }
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: parsed });
      };
      xhr.send(formData);
    });
  };

  let result = await doUpload();

  // One retry after token refresh on 401
  if (result.status === 401) {
    try {
      await refreshToken!();
      result = await doUpload();
    } catch (err) {
      log.error("Token refresh failed during image upload:", err);
      throw err;
    }
  }

  if (!result.ok) {
    const errorMsg =
      (result.body as { error?: string } | null)?.error ??
      `Upload failed with status ${result.status}`;
    throw new Error(errorMsg);
  }

  const json = result.body as { data?: { url?: string }; url?: string } | null;
  const url = json?.data?.url ?? json?.url;
  if (typeof url !== "string") throw new Error("Upload response did not include a URL");
  return url;
}
