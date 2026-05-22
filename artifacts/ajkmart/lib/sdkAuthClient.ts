/**
 * @workspace/auth-react SDK bridge for the AJKMart customer app.
 *
 * This file wires the shared @workspace/auth-react SDK into the customer app
 * without replacing the existing AuthContext.  The approach:
 *
 * 1. Creates a lightweight in-memory TokenStorage that is kept in-sync by
 *    AuthContext via the exported sync helpers (syncAccessToken, etc.).
 * 2. Creates a shared authClient (retry, 401-refresh, backoff) that any
 *    screen can import instead of writing raw fetch calls.
 * 3. Re-exports SDK hooks/utils that are safe to use in React Native:
 *    - useSessionManager (active devices + login history)
 *    - JWT decode / expiry utilities
 *
 * Usage
 * ─────
 * Call `bootstrapSdkAuth()` near the top of the AuthContext provider effect,
 * before the first API call.  Then call syncAccessToken / syncRefreshToken /
 * clearSdkTokens whenever the AuthContext token state changes.
 *
 * Example (in AuthContext.tsx):
 *   import { bootstrapSdkAuth, syncAccessToken, clearSdkTokens } from '@/lib/sdkAuthClient';
 *
 *   // Inside loadAuth effect:
 *   await bootstrapSdkAuth();
 *
 *   // Whenever token changes (login / refresh):
 *   syncAccessToken(newToken);
 *   syncRefreshToken(newRefreshToken);
 *
 *   // On logout:
 *   clearSdkTokens();
 */

import * as SecureStore from 'expo-secure-store';
import { createAuthClient } from '@workspace/auth-react';
import type { TokenStorage } from '@workspace/auth-react';
import { API_BASE } from '@/utils/api';
import { createLogger } from '@/utils/logger';

const log = createLogger('[sdkAuthClient]');

// ── Customer app's own SecureStore key names ───────────────────────────────
// These match the TOKEN_KEY / REFRESH_TOKEN_KEY in AuthContext.tsx so the
// bootstrap step can pre-seed the in-memory cache from the persisted values.
const CUSTOMER_ACCESS_KEY = 'ajkmart_token';
const CUSTOMER_REFRESH_KEY = 'ajkmart_refresh_token';

// ── In-memory token storage ────────────────────────────────────────────────
// We intentionally do NOT use NativeStorage from the SDK here because its
// SecureStore key names differ from the customer app's persisted keys.
// AuthContext owns the SecureStore writes; we just keep an in-memory mirror
// that it keeps in sync via the sync helpers below.

let _accessToken: string | null = null;
let _refreshToken: string | null = null;

export const syncedStorage: TokenStorage = {
  getAccessToken: () => _accessToken,
  setAccessToken: (t) => { _accessToken = t; },
  removeAccessToken: () => { _accessToken = null; },
  getRefreshToken: () => _refreshToken,
  setRefreshToken: (t) => { _refreshToken = t; },
  removeRefreshToken: () => { _refreshToken = null; },
  clear: () => { _accessToken = null; _refreshToken = null; },
};

// ── Singletons ─────────────────────────────────────────────────────────────

let _authClient: ReturnType<typeof createAuthClient> | null = null;
let _bootstrapped = false;

/**
 * Initialise the SDK auth client.
 *
 * Call this once at the start of AuthContext's loadAuth effect so the client
 * is ready before the first authenticated API call.  Safe to call multiple
 * times — subsequent calls are no-ops.
 *
 * On first call it also seeds the in-memory token cache from SecureStore so
 * that getAuthClient() is immediately usable even before the first login.
 */
export async function bootstrapSdkAuth(): Promise<void> {
  if (_bootstrapped) return;
  _bootstrapped = true;

  // Seed in-memory cache from the customer app's SecureStore persisted tokens.
  try {
    const [access, refresh] = await Promise.all([
      SecureStore.getItemAsync(CUSTOMER_ACCESS_KEY).catch(() => null),
      SecureStore.getItemAsync(CUSTOMER_REFRESH_KEY).catch(() => null),
    ]);
    if (access) _accessToken = access;
    if (refresh) _refreshToken = refresh;
  } catch (err) {
    log.warn("[sdkAuthClient] SecureStore unavailable, starting empty:", err);
  }

  _authClient = createAuthClient({
    baseURL: API_BASE,
    tokenStorage: syncedStorage,
    refreshEndpoint: `${API_BASE}/auth/refresh`,
    onUnauthorized: () => {
      // Intentionally empty: AuthContext's setOnUnauthorized already owns
      // the full logout sequence (socket disconnect, SecureStore wipe, etc.).
      // Duplicate handling here would cause a double-logout race condition.
    },
  });
}

/**
 * Get the shared auth client.  Throws if called before bootstrapSdkAuth().
 */
export function getAuthClient(): ReturnType<typeof createAuthClient> {
  if (!_authClient) {
    throw new Error(
      '[sdkAuthClient] Called before bootstrapSdkAuth() resolved. ' +
        'Await bootstrapSdkAuth() in AuthContext loadAuth before using getAuthClient().'
    );
  }
  return _authClient;
}

// ── Token sync helpers ─────────────────────────────────────────────────────
// AuthContext calls these whenever it changes the token state so the SDK
// client always sends the correct Bearer header.

/** Sync a new access token into the SDK in-memory storage. */
export function syncAccessToken(token: string | null): void {
  if (token) {
    _accessToken = token;
  } else {
    _accessToken = null;
  }
}

/** Sync a new refresh token into the SDK in-memory storage. */
export function syncRefreshToken(token: string | null): void {
  if (token) {
    _refreshToken = token;
  } else {
    _refreshToken = null;
  }
}

/** Clear all tokens (call on logout). */
export function clearSdkTokens(): void {
  _accessToken = null;
  _refreshToken = null;
}

// ── Re-export React Native-safe SDK hooks / utilities ─────────────────────

export { useSessionManager } from '@workspace/auth-react';
export type {
  UseSessionManagerOptions,
  UseSessionManagerResult,
  Session,
  LoginHistoryEntry,
} from '@workspace/auth-react';

export { decodeJwt, isTokenExpired, getTokenExpiryRemaining } from '@workspace/auth-react';
