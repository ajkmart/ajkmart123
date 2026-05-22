import { createLogger } from "@/lib/logger";
import { createResilientFetcher } from "@workspace/api-client-react";
import { createAuthClient } from "@workspace/auth-react";
import { getRiderApiBase } from "./envValidation";
const log = createLogger("[api]");

const BASE = getRiderApiBase();

/* PWA4: Centralized base URL getter used by socket.tsx and error-reporter.ts to ensure sync */
export function getApiBase(): string {
  return BASE;
}

const TOKEN_KEY = "ajkmart_rider_token";
const REFRESH_KEY = "ajkmart_rider_refresh_token";

/* ── Secure token storage ──────────────────────────────────────────────────────
   Access tokens are stored in @capacitor/preferences (secure plugin) on native.
   In-memory cache avoids repeated async reads during a session.

   Migration: on first boot, if an existing token is found in localStorage,
   it is moved to Preferences and deleted from localStorage.

   Refresh tokens are carried by an HttpOnly cookie (no localStorage). */

let _inMemoryAccessToken = "";
let _inMemoryRefreshToken = "";

/* One-time purge of legacy refresh-token persistence. */
try {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(REFRESH_KEY);
  }
} catch (err) {
  log.warn(
    { err: err instanceof Error ? err.message : String(err) },
    "[api] legacy localStorage purge failed — non-critical"
  );
}

/* ── Preferences-backed async token storage ── */
async function preferencesSet(key: string, value: string): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
  } catch (err) {
    log.warn(
      { key, err: err instanceof Error ? err.message : String(err) },
      "[api] preferencesSet failed — token persistence unavailable"
    );
  }
}

async function preferencesGet(key: string): Promise<string> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key });
    return value ?? "";
  } catch (err) {
    log.warn(
      { key, err: err instanceof Error ? err.message : String(err) },
      "[api] preferencesGet failed — returning empty string"
    );
    return "";
  }
}

async function preferencesRemove(key: string): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key });
  } catch (err) {
    log.warn(
      { key, err: err instanceof Error ? err.message : String(err) },
      "[api] preferencesRemove failed — non-critical"
    );
  }
}

/* One-time migration: move any token from localStorage → Preferences at boot.
   Exported as a promise so AuthProvider can await it before reading the token —
   avoids treating a valid persisted session as "no token" when the async load
   hasn't completed yet (critical on app restart).
   Errors propagate to the caller so the AuthProvider can surface a visible
   auth failure rather than silently treating the session as unauthenticated. */
export const tokenStoreReady: Promise<void> = (async () => {
  if (typeof localStorage === "undefined") return;
  const legacy = localStorage.getItem(TOKEN_KEY);
  if (legacy) {
    _inMemoryAccessToken = legacy;
    await preferencesSet(TOKEN_KEY, legacy);
    localStorage.removeItem(TOKEN_KEY);
  } else {
    _inMemoryAccessToken = await preferencesGet(TOKEN_KEY);
  }
  /* Restore persisted refresh token (stored by localSet on every login/refresh).
     Without this, a page reload/app restart would lose the refresh token from
     memory — forcing the user to re-authenticate even with a valid session. */
  _inMemoryRefreshToken = await preferencesGet(REFRESH_KEY);
})();

/* Access token helpers — Preferences-backed, with in-memory cache */
function sessionGet(): string {
  return _inMemoryAccessToken;
}
function sessionSet(value: string): void {
  _inMemoryAccessToken = value;
  preferencesSet(TOKEN_KEY, value).catch((err) => {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[api] sessionSet persistence failed"
    );
  });
}
function sessionRemove(): void {
  _inMemoryAccessToken = "";
  preferencesRemove(TOKEN_KEY).catch((err) => {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[api] sessionRemove persistence failed"
    );
  });
}

/* Refresh token helpers — Preferences-backed (identical to access token approach).
   Persisting the refresh token via Capacitor Preferences ensures sessions survive
   app restarts/PWA reload. The server also delivers it as an HttpOnly cookie, but
   the Preferences copy is the source of truth for the POST-body refresh call.   */
function localGet(): string {
  return _inMemoryRefreshToken;
}
function localSet(value: string): void {
  _inMemoryRefreshToken = value;
  preferencesSet(REFRESH_KEY, value).catch((err) => {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[api] localSet persistence failed"
    );
  });
}
function localRemove(): void {
  _inMemoryRefreshToken = "";
  preferencesRemove(REFRESH_KEY).catch((err) => {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[api] localRemove persistence failed"
    );
  });
}

/* ── Rider token storage — Preferences-backed with in-memory cache ───────────
   Exported so rider-auth.tsx can pass it to useTokenRefresh (SDK hook) without
   duplicating the Preferences integration. */
export const riderTokenStorage = {
  getAccessToken: sessionGet,
  setAccessToken: sessionSet,
  removeAccessToken: sessionRemove,
  getRefreshToken: localGet,
  setRefreshToken: localSet,
  removeRefreshToken: localRemove,
  clear: () => {
    sessionRemove();
    localRemove();
  },
};

/** Returns the shared rider token storage instance for use in SDK hooks. */
export function getRiderTokenStorage() {
  return riderTokenStorage;
}

/* ── Shared SDK auth client (typed HTTP client from @workspace/auth-react) ── */
export const authClient = createAuthClient({
  baseURL: BASE,
  tokenStorage: riderTokenStorage,
});

/* Read the access token from Preferences-backed in-memory cache. */
function getToken(): string {
  return sessionGet();
}

function getRefreshToken(): string {
  return localGet();
}

/* Sweep localStorage for any stale rider auth keys from older app versions. */
function sweepLegacyTokens(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key === TOKEN_KEY || key === REFRESH_KEY) continue;
      if (key.startsWith("rider_") || key.startsWith("ajkmart_rider")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch (err) {
        log.warn(
          { key: k, err: err instanceof Error ? err.message : String(err) },
          "[api] sweepLegacyTokens removeItem failed"
        );
      }
    });
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[api] sweepLegacyTokens failed — non-critical"
    );
  }
}

function clearTokens(): void {
  sessionRemove();
  localRemove();
  sweepLegacyTokens();
  _inMemoryAccessToken = "";
  _inMemoryRefreshToken = "";
}

/* ── Module-level token-refresh callbacks ─────────────────────────────────────
   Registered by socket.tsx (and any other consumer) to be notified immediately
   when a token refresh succeeds — enabling instant socket reconnection rather
   than waiting for the next polling tick. */
const _tokenRefreshCallbacks = new Set<() => void>();

export function registerTokenRefreshCallback(fn: () => void): () => void {
  _tokenRefreshCallbacks.add(fn);
  return () => {
    _tokenRefreshCallbacks.delete(fn);
  };
}

/* ── Module-level logout callback ─────────────────────────────────────────────
   The auth context registers this callback at mount time. Using a module-level
   reference avoids coupling to React's event system and guarantees the logout
   fires regardless of which component is mounted or whether the CustomEvent
   listener has been attached yet. */
let _logoutCallback: (() => void) | null = null;

export function registerLogoutCallback(fn: () => void): () => void {
  _logoutCallback = fn;
  return () => {
    if (_logoutCallback === fn) _logoutCallback = null;
  };
}

function triggerLogout(reason: string) {
  clearTokens();
  if (_logoutCallback) {
    _logoutCallback();
  }
  /* Also dispatch CustomEvent for components that still listen to it */
  try {
    window.dispatchEvent(new CustomEvent("ajkmart:logout", { detail: { reason } }));
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[api] dispatchEvent(ajkmart:logout) failed — non-critical"
    );
  }
}

export interface ApiError extends Error {
  status?: number;
  responseData?: { existingAccount?: boolean; [key: string]: unknown };
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof Error && ("status" in e || "responseData" in e);
}

/* ── Configurable network settings ────────────────────────────────────────────
   These are updated at startup by the platform config. Defaults match the
   hardcoded values that were previously used so existing behaviour is preserved
   when the platform config cannot be fetched. */
let _apiTimeoutMs = 30_000;

export function setApiTimeoutMs(ms: number): void {
  if (Number.isFinite(ms) && ms > 0) _apiTimeoutMs = Math.min(ms, 300_000);
}

/* ── Resilient API fetcher (createResilientFetcher from @workspace/api-client-react) ──
   Single instance providing: Bearer injection, timeout, 401→refresh (mutex)→retry,
   per-endpoint circuit breaker, and 5xx exponential-backoff retry.
   No manual circuit-breaker or retry loop needed in apiFetch — all handled here.
   setToken fires _tokenRefreshCallbacks (socket reconnect) and sweeps stale localStorage.
   _resiClient.refresh() exposes the mutex-guarded refresh for api.refreshToken.        */
const CB_DEFAULT_RETRIES = 3;
/* Captures the raw JSON envelope (before data-unwrapping) for the most recent
   successful response. Used by apiFetch's _returnEnvelope mode so callers that
   need top-level envelope fields (e.g. _serverTime) can retrieve them without
   a second request.  Safe for rider's single-context, one-at-a-time usage. */
let _lastRawJson: unknown = undefined;
const _resiClient = createResilientFetcher({
  baseUrl: BASE,
  getToken: () => sessionGet() || null,
  setToken: (token: string | null) => {
    if (token) sessionSet(token);
    sweepLegacyTokens();
    _tokenRefreshCallbacks.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[api] tokenRefreshCallback threw — non-critical"
        );
      }
    });
  },
  getRefreshToken: localGet,
  setRefreshToken: localSet,
  onRefreshFailed: (isTransient: boolean) => {
    if (!isTransient) triggerLogout("session_expired");
  },
  refreshEndpoint: `${BASE}/auth/refresh`,
  timeoutMs: () => _apiTimeoutMs,
  credentialsMode: "include",
  maxRetries: CB_DEFAULT_RETRIES,
  failureThreshold: 3,
  cooldownMs: 30_000,
  onRawJson: (json: unknown) => {
    _lastRawJson = json;
    /* Capture CSRF token from every auth response so Preferences stays current.
       storeCsrfToken is a hoisted function declaration — safe to call here. */
    const csrfInBody = (json as Record<string, unknown>).csrfToken;
    if (typeof csrfInBody === "string" && csrfInBody) {
      storeCsrfToken(csrfInBody).catch((err: unknown) => {
        log.debug("[api] CSRF token store failed:", err);
      });
    }
  },
});

interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
}

/* T1: Rider request-feed types are imported from @workspace/api-zod (generated
   from the OpenAPI spec). RiderOrder / RiderRide have all rider-facing fields
   with monetary values typed as string for precision safety. They are re-exported
   here as `Order` / `Ride` so existing consumers (Home.tsx etc.) need no changes. */
export interface Order {
  id: string;
  status: string;
  total?: string | number | null;
  type?: string | null;
  createdAt: string;
  itemCount?: number | null;
  item_count?: number | null;
  distanceKm?: string | number | null;
  distance_km?: string | number | null;
  deliveryAddress?: string | null;
  delivery_address?: string | null;
  vendorStoreName?: string | null;
  vendor_store_name?: string | null;
  vendorLat?: string | number | null;
  vendorLng?: string | number | null;
  deliveryLat?: string | number | null;
  deliveryLng?: string | number | null;
}
export interface Ride {
  id: string;
  status: string;
  fare?: string | number | null;
  type?: string | null;
  createdAt: string;
  offeredFare?: number | string | null;
  bargainNote?: string | null;
  distance?: string | number | null;
  pickupAddress?: string | null;
  dropAddress?: string | null;
  pickupLat?: string | number | null;
  pickupLng?: string | number | null;
  dropLat?: string | number | null;
  dropLng?: string | number | null;
  riderDistanceKm?: number | null;
  riderEtaMin?: number | null;
  dispatchedRiderId?: string | null;
  vehicleType?: string | null;
  isParcel?: boolean | null;
  isPoolRide?: boolean | null;
  myBid?: { fare: number | string } | null;
  paymentMethod?: string | null;
}
export interface RiderRequestsResponse {
  orders: Order[];
  rides: Ride[];
  _serverTime: string | null;
}

/* ── CSRF token — Preferences-backed ──────────────────────────────────────────
   Capacitor does not expose HttpOnly cookies to JavaScript, so document.cookie
   is not a reliable source of the CSRF token in native contexts. Instead, we
   read the `csrfToken` field that the server returns in auth response bodies,
   persist it in @capacitor/preferences, and hold an in-memory copy for fast
   synchronous access in `apiFetch`. Falls back to document.cookie on web builds
   where the HttpOnly cookie is readable by XHR but Preferences is unavailable. */
const CSRF_KEY = "ajkmart_rider_csrf_token";
let _inMemoryCsrfToken = "";

export async function storeCsrfToken(token: string): Promise<void> {
  if (!token) return;
  _inMemoryCsrfToken = token;
  await preferencesSet(CSRF_KEY, token).catch((err: unknown) => {
    log.debug("[api] CSRF prefs store failed:", err);
  });
}

/* Load persisted CSRF token from Preferences into memory (called from tokenStoreReady). */
export const csrfStoreReady: Promise<void> = (async () => {
  try {
    _inMemoryCsrfToken = await preferencesGet(CSRF_KEY);
  } catch {
    /* Fall back to document.cookie on failure */
    try {
      const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
      if (match) _inMemoryCsrfToken = decodeURIComponent(match[1]);
    } catch (e) {
      log.debug("[api] document.cookie unavailable:", e);
    }
  }
})();

function readCsrfFromCookie(): string {
  /* Primary: in-memory value sourced from auth response body via storeCsrfToken */
  if (_inMemoryCsrfToken) return _inMemoryCsrfToken;
  /* Fallback: document.cookie (web-only; unreliable in Capacitor) */
  try {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

export async function apiFetch(
  path: string,
  opts: RequestInit = {},
  _returnEnvelope = false
): Promise<any> {
  /* Ensure the token store has been seeded from Preferences before any request fires.
     tokenStoreReady resolves once the persisted access + refresh tokens are loaded.
     Without this guard, the first request after a cold restart fires without a token. */
  await tokenStoreReady;

  const isFormData = opts.body instanceof FormData;
  const method = (opts.method ?? "GET").toUpperCase();
  const isStateMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const csrfToken = isStateMutating ? readCsrfFromCookie() : "";
  const mergedOpts: RequestInit = {
    ...opts,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...((opts.headers as Record<string, string>) || {}),
    },
  };

  try {
    const result = await _resiClient.fetch(path, mergedOpts);
    /* _returnEnvelope: caller wants the full server envelope (e.g. _serverTime).
       _lastRawJson is populated by the onRawJson callback before data-unwrapping. */
    return _returnEnvelope ? _lastRawJson : result;
  } catch (err: unknown) {
    /* Custom 403 handling: distinguish auth denials (force logout) from
       business-rule blocks (approval pending, feature disabled, etc.).
       _resiClient throws { status, responseData } on non-ok responses. */
    const e = err as { status?: number; responseData?: Record<string, unknown> };
    if (e.status === 403 && e.responseData) {
      const body = e.responseData;
      const msg = (body.error as string) || "";
      /* code and rejectionReason may live at top level OR inside body.data */
      const code =
        (body.code as string) ||
        ((body.data as Record<string, unknown> | undefined)?.code as string) ||
        "";
      const rejectionReason =
        body.rejectionReason ??
        (body.data as Record<string, unknown> | undefined)?.rejectionReason ??
        null;
      const approvalStatus =
        body.approvalStatus ??
        (body.data as Record<string, unknown> | undefined)?.approvalStatus ??
        null;
      /* APPROVAL_PENDING and APPROVAL_REJECTED are NOT auth failures — do not force logout */
      const AUTH_DENY_CODES = [
        "AUTH_REQUIRED",
        "ROLE_DENIED",
        "TOKEN_INVALID",
        "TOKEN_EXPIRED",
        "ACCOUNT_BANNED",
      ];
      const AUTH_DENY_PHRASES = [
        "access denied",
        "forbidden",
        "unauthorized",
        "authentication required",
        "token invalid",
        "token expired",
      ];
      const isAuthDenial =
        AUTH_DENY_CODES.includes(code) ||
        AUTH_DENY_PHRASES.some((p) => msg.toLowerCase().startsWith(p));
      if (isAuthDenial) triggerLogout("access_denied");
      throw Object.assign(new Error(msg || "Access denied"), {
        status: 403,
        code,
        rejectionReason,
        approvalStatus,
      });
    }
    /* For non-auth errors, fire the error reporter then re-throw unchanged. */
    const status = e.status ?? 0;
    if (status && status !== 401) {
      try {
        const { reportApiError } = await import("./error-reporter");
        reportApiError(path, status, (err as Error).message || "Request failed");
      } catch (reportErr) {
        log.warn(
          { err: reportErr instanceof Error ? reportErr.message : String(reportErr) },
          "[api] error reporter threw — non-critical"
        );
      }
    }
    throw err;
  }
}

export const api = {
  /* Auth */
  sendOtp: (
    phone: string,
    captchaToken?: string,
    preferredChannel?: string,
    signal?: AbortSignal
  ) =>
    apiFetch("/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({
        phone,
        captchaToken,
        ...(preferredChannel ? { preferredChannel } : {}),
      }),
      ...(signal ? { signal } : {}),
    }),
  verifyOtp: (phone: string, otp: string, deviceFingerprint?: string, captchaToken?: string) =>
    apiFetch("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, otp, role: "rider", deviceFingerprint, captchaToken }),
    }),
  sendEmailOtp: (email: string, captchaToken?: string) =>
    apiFetch("/auth/send-email-otp", {
      method: "POST",
      body: JSON.stringify({ email, captchaToken }),
    }),
  verifyEmailOtp: (email: string, otp: string, deviceFingerprint?: string, captchaToken?: string) =>
    apiFetch("/auth/verify-email-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp, role: "rider", deviceFingerprint, captchaToken }),
    }),
  loginUsername: (
    identifier: string,
    password: string,
    captchaToken?: string,
    deviceFingerprint?: string
  ) =>
    apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        identifier,
        password,
        role: "rider",
        captchaToken,
        deviceFingerprint,
      }),
    }),
  checkAvailable: (
    data: { phone?: string; email?: string; username?: string },
    signal?: AbortSignal
  ) =>
    apiFetch("/auth/check-available", {
      method: "POST",
      body: JSON.stringify(data),
      ...(signal ? { signal } : {}),
    }),
  logout: (refreshToken?: string) =>
    apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }).finally(
      clearTokens
    ),

  registerRider: (data: {
    name: string;
    phone?: string;
    email?: string;
    cnic: string;
    vehicleType: string;
    vehicleRegistration: string;
    drivingLicense: string;
    password?: string;
    captchaToken?: string;
    username?: string;
    address?: string;
    city?: string;
    emergencyContact?: string;
    vehiclePlate?: string;
    vehiclePhoto?: string;
    documents?: string;
    deviceMeta?: Record<string, unknown>;
  }) =>
    apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ ...data, role: "rider", vehicleRegNo: data.vehicleRegistration }),
    }),
  emailRegisterRider: (data: {
    name: string;
    phone?: string;
    email?: string;
    cnic: string;
    vehicleType: string;
    vehicleRegistration: string;
    drivingLicense: string;
    password: string;
    captchaToken?: string;
    username?: string;
    address?: string;
    city?: string;
    emergencyContact?: string;
    vehiclePlate?: string;
    vehiclePhoto?: string;
    documents?: string;
  }) =>
    apiFetch("/auth/email-register", {
      method: "POST",
      body: JSON.stringify({ ...data, role: "rider", vehicleRegNo: data.vehicleRegistration }),
    }),
  verifyTotpCode: (code: string, phone: string, captchaToken?: string) =>
    apiFetch("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, otp: code, role: "rider", captchaToken }),
    }),
  uploadFile: (data: { file: string; filename?: string; mimeType?: string }) =>
    apiFetch("/uploads", { method: "POST", body: JSON.stringify(data) }),
  /* Multipart/form-data upload — avoids large base64 payload; used for delivery proof.
     Calls /uploads/proof which is gated by riderAuth and handles multipart parsing. */
  uploadProof: (file: File) => {
    const form = new FormData();
    form.append("file", file, file.name || "proof.jpg");
    form.append("purpose", "delivery_proof");
    return apiFetch("/uploads/proof", { method: "POST", body: form });
  },
  /* Pre-fetch a registration upload session token once and reuse across multiple uploads. */
  getRegistrationUploadToken: async (): Promise<string> => {
    const tokenRes = await apiFetch("/uploads/register-token", { method: "POST" });
    const token: string = tokenRes?.token ?? "";
    if (!token) throw new Error("Failed to obtain upload session token");
    return token;
  },
  /* Upload a single document using a pre-fetched token (avoids fetching a new token per file). */
  uploadRegistrationDocWithToken: async (file: File, uploadToken: string) => {
    const form = new FormData();
    form.append("file", file, file.name || "document.jpg");
    return apiFetch("/uploads/register", {
      method: "POST",
      body: form,
      headers: { "x-upload-token": uploadToken },
    });
  },
  /* XHR-based upload that reports real byte-level upload progress (0–100).
     Uses XMLHttpRequest instead of fetch because the Fetch API does not
     expose upload progress events. Auth and CSRF headers are attached manually. */
  uploadRegistrationDocWithProgress: async (
    file: File,
    uploadToken: string,
    onProgress?: (pct: number) => void
  ): Promise<{ url?: string; downloadToken?: string; filename?: string; size?: number }> => {
    await tokenStoreReady;
    const accessToken = sessionGet();
    const csrfToken = readCsrfFromCookie();
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file, file.name || "document.jpg");
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE}/uploads/register`, true);
      xhr.withCredentials = true;
      if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      if (csrfToken) xhr.setRequestHeader("X-CSRF-Token", csrfToken);
      xhr.setRequestHeader("x-upload-token", uploadToken);
      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable && ev.total > 0) {
            onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
          }
        };
      }
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.onload = () => {
        if (onProgress) onProgress(100);
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = xhr.responseText
            ? (JSON.parse(xhr.responseText) as Record<string, unknown>)
            : null;
        } catch {
          parsed = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          const body = parsed?.data ? (parsed.data as Record<string, unknown>) : (parsed ?? {});
          resolve(
            body as { url?: string; downloadToken?: string; filename?: string; size?: number }
          );
        } else {
          const msg =
            (parsed as { error?: string } | null)?.error ?? `Upload failed (${xhr.status})`;
          reject(Object.assign(new Error(msg), { status: xhr.status }));
        }
      };
      xhr.send(form);
    });
  },
  uploadRegistrationDoc: async (file: File) => {
    /* Obtain a short-lived upload session token (required by the server
       to bind the upload to an active onboarding flow). */
    const fetchToken = async () => {
      const tokenRes = await apiFetch("/uploads/register-token", { method: "POST" });
      const token: string = tokenRes?.token ?? "";
      if (!token) throw new Error("Failed to obtain upload session token");
      return token;
    };
    const doUpload = async (uploadToken: string) => {
      const form = new FormData();
      form.append("file", file, file.name || "document.jpg");
      return apiFetch("/uploads/register", {
        method: "POST",
        body: form,
        headers: { "x-upload-token": uploadToken },
      });
    };
    const firstToken = await fetchToken();
    try {
      return await doUpload(firstToken);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      /* Retry on 401 (expired JWT) and 403 (consumed/invalid nonce). */
      if (status === 401 || status === 403) {
        const freshToken = await fetchToken();
        return doUpload(freshToken);
      }
      throw e;
    }
  },
  /* Request a KYC review from the rider's already-uploaded registration documents. */
  requestKycReview: () => apiFetch("/rider/kyc/request", { method: "POST" }),
  forgotPassword: (data: {
    method: "phone" | "email";
    phone?: string;
    email?: string;
    captchaToken?: string;
  }) => apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify(data) }),
  resetPassword: (data: {
    phone?: string;
    email?: string;
    otp: string;
    newPassword: string;
    totpCode?: string;
    captchaToken?: string;
  }) => apiFetch("/auth/reset-password", { method: "POST", body: JSON.stringify(data) }),
  socialGoogle: (data: { idToken: string; deviceMeta?: Record<string, unknown> }) =>
    apiFetch("/auth/social/google", {
      method: "POST",
      body: JSON.stringify({ ...data, role: "rider" }),
    }),
  socialFacebook: (data: { accessToken: string; deviceMeta?: Record<string, unknown> }) =>
    apiFetch("/auth/social/facebook", {
      method: "POST",
      body: JSON.stringify({ ...data, role: "rider" }),
    }),
  magicLinkVerify: (data: { token: string }) =>
    apiFetch("/auth/magic-link/verify", { method: "POST", body: JSON.stringify(data) }),
  twoFactorSetup: () => apiFetch("/auth/2fa/setup"),
  twoFactorEnable: (data: { code: string }) =>
    apiFetch("/auth/2fa/verify-setup", { method: "POST", body: JSON.stringify(data) }),
  twoFactorVerify: (data: {
    code: string;
    tempToken?: string;
    deviceFingerprint?: string;
    trustDevice?: boolean;
  }) => apiFetch("/auth/2fa/verify", { method: "POST", body: JSON.stringify(data) }),
  twoFactorRecovery: (data: {
    backupCode: string;
    tempToken?: string;
    deviceFingerprint?: string;
  }) => apiFetch("/auth/2fa/recovery", { method: "POST", body: JSON.stringify(data) }),
  twoFactorDisable: (data: { code: string }) =>
    apiFetch("/auth/2fa/disable", { method: "POST", body: JSON.stringify(data) }),
  sendMagicLink: (email: string, deviceMeta?: Record<string, unknown>) =>
    apiFetch("/auth/magic-link/send", {
      method: "POST",
      body: JSON.stringify({ email, ...(deviceMeta ? { deviceMeta } : {}) }),
    }),

  /* Token helpers */
  storeTokens: (token: string, refreshToken?: string) => {
    /* Store access token in Preferences; refresh token in-memory only */
    sessionSet(token);
    if (refreshToken) localSet(refreshToken);
    /* Sweep all stale legacy rider access keys from localStorage */
    sweepLegacyTokens();
  },
  clearTokens,
  getToken,
  getRefreshToken,
  /* Mutex-guarded token refresh — all callers share a single in-flight promise
     so concurrent refresh attempts never race each other. */
  refreshToken: () => _resiClient.refresh(),
  registerLogoutCallback,

  /* Rider */
  getMe: (signal?: AbortSignal) => apiFetch("/riders/me?appRole=rider", signal ? { signal } : {}),
  setOnline: (isOnline: boolean): Promise<{ isOnline: boolean; serviceZoneWarning?: string }> =>
    apiFetch("/riders/online", { method: "PATCH", body: JSON.stringify({ isOnline }) }),
  updateProfile: (
    data: Record<string, unknown>
  ): Promise<{ success: boolean; pendingVerification?: boolean }> =>
    apiFetch("/riders/profile", { method: "PATCH", body: JSON.stringify(data) }),
  getRequests: (): Promise<RiderRequestsResponse> =>
    apiFetch("/riders/requests", {}, true).then(
      (env: ApiEnvelope<{ orders: Order[]; rides: Ride[] }> & { serverTime?: string }) => {
        const payload = env.data ?? { orders: [], rides: [] };
        return {
          orders: payload.orders ?? [],
          rides: payload.rides ?? [],
          _serverTime: env.serverTime ?? null,
        };
      }
    ),
  getActive: () => apiFetch("/riders/active"),
  acceptOrder: (id: string) =>
    apiFetch(`/riders/orders/${id}/accept`, { method: "POST", body: "{}" }),
  rejectOrder: (id: string, reason?: string) =>
    apiFetch(`/riders/orders/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: reason || "not_interested" }),
    }),
  updateOrder: (id: string, status: string, proofPhoto?: string) =>
    apiFetch(`/riders/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, ...(proofPhoto ? { proofPhoto } : {}) }),
    }),
  acceptRide: (id: string) =>
    apiFetch(`/riders/rides/${id}/accept`, { method: "POST", body: "{}" }),
  updateRide: (id: string, status: string, loc?: { lat: number; lng: number }) =>
    apiFetch(`/riders/rides/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, ...(loc || {}) }),
    }),
  verifyRideOtp: (id: string, otp: string): Promise<{ success: boolean }> =>
    apiFetch(`/riders/rides/${id}/verify-otp`, { method: "POST", body: JSON.stringify({ otp }) }),
  counterRide: (id: string, data: { counterFare: number; note?: string }) =>
    apiFetch(`/riders/rides/${id}/counter`, { method: "POST", body: JSON.stringify(data) }),
  rejectOffer: (id: string) =>
    apiFetch(`/riders/rides/${id}/reject-offer`, { method: "POST", body: "{}" }),
  ignoreRide: (id: string) =>
    apiFetch(`/riders/rides/${id}/ignore`, { method: "POST", body: "{}" }),
  getCancelStats: () => apiFetch("/riders/cancel-stats"),
  getIgnoreStats: () => apiFetch("/riders/ignore-stats"),
  getPenaltyHistory: () => apiFetch("/riders/penalty-history"),
  getHistory: (
    opts: { limit?: number; offset?: number } = {}
  ): Promise<{
    history: Array<{
      id: string;
      kind: "order" | "ride";
      type: string;
      status: string;
      earnings: number;
      amount: number;
      address?: string;
      createdAt: string;
      proofPhoto?: string;
      origin?: string;
      destination?: string;
      fare?: number;
      distance?: string | number;
      duration?: number;
    }>;
    hasMore: boolean;
    limit: number;
    offset: number;
  }> => {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts.offset !== undefined) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return apiFetch(`/riders/history${qs ? `?${qs}` : ""}`);
  },
  getEarnings: (): Promise<{
    today: {
      earnings: number;
      deliveries: number;
      breakdown?: {
        food: { earnings: number; count: number };
        parcel: { earnings: number; count: number };
        rides: { earnings: number; count: number };
      };
    };
    week: {
      earnings: number;
      deliveries: number;
      breakdown?: {
        food: { earnings: number; count: number };
        parcel: { earnings: number; count: number };
        rides: { earnings: number; count: number };
      };
    };
    month: {
      earnings: number;
      deliveries: number;
      breakdown?: {
        food: { earnings: number; count: number };
        parcel: { earnings: number; count: number };
        rides: { earnings: number; count: number };
      };
    };
    dailyGoal: number | null;
  }> => apiFetch("/riders/earnings"),
  getMyReviews: () => apiFetch("/riders/reviews"),

  /* Location */
  updateLocation: (data: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    batteryLevel?: number;
    mockProvider?: boolean;
    rideId?: string;
  }) => apiFetch("/riders/location", { method: "PATCH", body: JSON.stringify(data) }),
  batchLocation: (
    pings: Array<{
      timestamp: string;
      latitude: number;
      longitude: number;
      accuracy?: number;
      speed?: number;
      heading?: number;
      batteryLevel?: number;
      mockProvider?: boolean;
      action?: string | null;
    }>
  ) =>
    apiFetch("/riders/location/batch", {
      method: "POST",
      body: JSON.stringify({ locations: pings }),
    }),

  /* Wallet */
  /* getWallet — kept for backward compatibility. Calls the legacy non-paged
     endpoint shape `{ balance, transactions }` via `?legacy=1`. New code
     should use `getWalletPage` for cursor pagination. */
  getWallet: () => apiFetch("/riders/wallet/transactions?legacy=1"),
  /* getWalletPage — cursor-paginated. Returns `{ balance, items, nextCursor, limit }`.
     Pass `cursor` (opaque string from the previous response) to fetch the
     next page. Pass `limit` (1–200) to control page size; default 50. */
  getWalletPage: (
    opts: { cursor?: string | null; limit?: number } = {}
  ): Promise<{
    balance: number;
    items: Array<{
      id: string;
      type: string;
      amount: number;
      description?: string | null;
      reference?: string | null;
      createdAt: string;
      [k: string]: unknown;
    }>;
    nextCursor: string | null;
    limit: number;
  }> => {
    const params = new URLSearchParams();
    if (opts.limit != null) params.set("limit", String(opts.limit));
    if (opts.cursor != null) params.set("cursor", opts.cursor);
    const qs = params.toString();
    return apiFetch(`/riders/wallet/transactions${qs ? `?${qs}` : ""}`);
  },
  getMinBalance: () => apiFetch("/riders/wallet/min-balance"),
  withdrawWallet: (data: {
    amount: number;
    bankName: string;
    accountNumber: string;
    accountTitle: string;
    paymentMethod?: string;
    note?: string;
  }) => apiFetch("/riders/wallet/withdraw", { method: "POST", body: JSON.stringify(data) }),
  submitDeposit: (data: {
    amount: number;
    paymentMethod: string;
    transactionId: string;
    accountNumber?: string;
    note?: string;
  }) => apiFetch("/riders/wallet/deposit", { method: "POST", body: JSON.stringify(data) }),
  getDeposits: () => apiFetch("/riders/wallet/deposits"),

  /* COD Remittance */
  getPopularCities: (): Promise<{ cities: string[] }> => apiFetch("/maps/popular-cities"),
  getCodSummary: () => apiFetch("/riders/cod-summary"),
  submitCodRemittance: (data: {
    amount: number;
    paymentMethod: string;
    accountNumber: string;
    transactionId?: string;
    note?: string;
  }) => apiFetch("/riders/cod/remit", { method: "POST", body: JSON.stringify(data) }),

  /* Notifications */
  getNotifications: () => apiFetch("/riders/notifications"),
  markAllRead: () => apiFetch("/riders/notifications/read-all", { method: "PATCH", body: "{}" }),
  markOneRead: (id: string) =>
    apiFetch(`/riders/notifications/${id}/read`, { method: "PATCH", body: "{}" }),

  /* Settings */
  getSettings: () => apiFetch("/settings"),
  updateSettings: (data: Record<string, unknown>) =>
    apiFetch("/settings", { method: "PUT", body: JSON.stringify(data) }),

  /* AI Assistant */
  aiChat: (message: string, history?: Array<{ role: "user" | "assistant"; content: string }>) =>
    apiFetch("/riders/ai-chat", { method: "POST", body: JSON.stringify({ message, history }) }),

  /* Generic fetch — exposed on the api object so Chat (and other surfaces that
     migrated off their own apiFetch copy) can call api.apiFetch(...) and
     transparently get the auth refresh, timeout, and error-reporter integration.
     Closes C1/C3 by removing all parallel apiFetch implementations. */
  apiFetch,
};
