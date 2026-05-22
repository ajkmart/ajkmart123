export interface TokenStorage {
  getAccessToken(): string | null;
  setAccessToken(token: string): void;
  removeAccessToken(): void;
  getRefreshToken(): string | null;
  setRefreshToken(token: string): void;
  removeRefreshToken(): void;
  clear(): void;
}

const ACCESS_TOKEN_KEY = "ajk_access_token";
const REFRESH_TOKEN_KEY = "ajk_refresh_token";

class MemoryStorage implements TokenStorage {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  removeAccessToken(): void {
    this.accessToken = null;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  setRefreshToken(token: string): void {
    this.refreshToken = token;
  }

  removeRefreshToken(): void {
    this.refreshToken = null;
  }

  clear(): void {
    this.accessToken = null;
    this.refreshToken = null;
  }
}

class WebStorage implements TokenStorage {
  private store: Storage;

  constructor(type: "session" | "local" = "session") {
    if (typeof window === "undefined") {
      throw new Error("WebStorage is only available in browser environments");
    }
    this.store = type === "local" ? window.localStorage : window.sessionStorage;
  }

  getAccessToken(): string | null {
    return this.store.getItem(ACCESS_TOKEN_KEY);
  }

  setAccessToken(token: string): void {
    this.store.setItem(ACCESS_TOKEN_KEY, token);
  }

  removeAccessToken(): void {
    this.store.removeItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return this.store.getItem(REFRESH_TOKEN_KEY);
  }

  setRefreshToken(token: string): void {
    this.store.setItem(REFRESH_TOKEN_KEY, token);
  }

  removeRefreshToken(): void {
    this.store.removeItem(REFRESH_TOKEN_KEY);
  }

  clear(): void {
    this.store.removeItem(ACCESS_TOKEN_KEY);
    this.store.removeItem(REFRESH_TOKEN_KEY);
  }
}

type ExpoSecureStoreApi = {
  getItemAsync: (k: string) => Promise<string | null>;
  setItemAsync: (k: string, v: string) => Promise<void>;
  deleteItemAsync: (k: string) => Promise<void>;
};

type CapacitorPreferencesApi = {
  get: (opts: { key: string }) => Promise<{ value: string | null }>;
  set: (opts: { key: string; value: string }) => Promise<void>;
  remove: (opts: { key: string }) => Promise<void>;
};

function getCapacitorPreferences(): CapacitorPreferencesApi | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const cap = (globalThis as Record<string, unknown>)["Capacitor"] as
    | { Plugins?: { Preferences?: CapacitorPreferencesApi } }
    | undefined;
  return cap?.Plugins?.Preferences;
}

function getSecureStore(): ExpoSecureStoreApi | undefined {
  if (typeof globalThis === "undefined") return undefined;
  return (globalThis as Record<string, unknown>)["__ExpoSecureStore"] as
    | ExpoSecureStoreApi
    | undefined;
}

class NativeStorage implements TokenStorage {
  private mem = new MemoryStorage();

  /**
   * Restore tokens from the available secure store (Capacitor Preferences or
   * expo-secure-store) into the in-memory cache.
   *
   * Detection order:
   *   1. Capacitor Preferences (web/hybrid Capacitor apps)
   *   2. expo-secure-store (Expo native apps via `globalThis.__ExpoSecureStore`)
   *   3. Memory-only fallback (test environments, unsupported platforms)
   *
   * Call this once at app startup before any synchronous getAccessToken /
   * getRefreshToken calls so the in-memory cache is pre-populated.
   * Safe to call multiple times — no-op if tokens are already cached.
   */
  async restoreFromSecureStore(): Promise<void> {
    const cap = getCapacitorPreferences();
    if (cap) {
      try {
        const [accessResult, refreshResult] = await Promise.all([
          cap.get({ key: ACCESS_TOKEN_KEY }).catch((_e) => ({ value: null })),
          cap.get({ key: REFRESH_TOKEN_KEY }).catch((_e) => ({ value: null })),
        ]);
        if (accessResult.value && !this.mem.getAccessToken())
          this.mem.setAccessToken(accessResult.value);
        if (refreshResult.value && !this.mem.getRefreshToken())
          this.mem.setRefreshToken(refreshResult.value);
      } catch (_e) {
        // Capacitor Preferences unavailable — fall through to memory
      }
      return;
    }

    const ss = getSecureStore();
    if (!ss) return;
    try {
      const [access, refresh] = await Promise.all([
        ss.getItemAsync(ACCESS_TOKEN_KEY).catch((_e) => null),
        ss.getItemAsync(REFRESH_TOKEN_KEY).catch((_e) => null),
      ]);
      if (access && !this.mem.getAccessToken()) this.mem.setAccessToken(access);
      if (refresh && !this.mem.getRefreshToken()) this.mem.setRefreshToken(refresh);
    } catch (_e) {
      // SecureStore unavailable on this device — memory-only fallback is fine
    }
  }

  getAccessToken(): string | null {
    return this.mem.getAccessToken();
  }

  setAccessToken(token: string): void {
    this.mem.setAccessToken(token);
    const cap = getCapacitorPreferences();
    if (cap) {
      cap.set({ key: ACCESS_TOKEN_KEY, value: token }).catch((_e) => {});
      return;
    }
    getSecureStore()
      ?.setItemAsync(ACCESS_TOKEN_KEY, token)
      .catch((_e) => {});
  }

  removeAccessToken(): void {
    this.mem.removeAccessToken();
    const cap = getCapacitorPreferences();
    if (cap) {
      cap.remove({ key: ACCESS_TOKEN_KEY }).catch((_e) => {});
      return;
    }
    getSecureStore()
      ?.deleteItemAsync(ACCESS_TOKEN_KEY)
      .catch((_e) => {});
  }

  getRefreshToken(): string | null {
    return this.mem.getRefreshToken();
  }

  setRefreshToken(token: string): void {
    this.mem.setRefreshToken(token);
    const cap = getCapacitorPreferences();
    if (cap) {
      cap.set({ key: REFRESH_TOKEN_KEY, value: token }).catch((_e) => {});
      return;
    }
    getSecureStore()
      ?.setItemAsync(REFRESH_TOKEN_KEY, token)
      .catch((_e) => {});
  }

  removeRefreshToken(): void {
    this.mem.removeRefreshToken();
    const cap = getCapacitorPreferences();
    if (cap) {
      cap.remove({ key: REFRESH_TOKEN_KEY }).catch((_e) => {});
      return;
    }
    getSecureStore()
      ?.deleteItemAsync(REFRESH_TOKEN_KEY)
      .catch((_e) => {});
  }

  clear(): void {
    this.mem.clear();
    const cap = getCapacitorPreferences();
    if (cap) {
      cap.remove({ key: ACCESS_TOKEN_KEY }).catch((_e) => {});
      cap.remove({ key: REFRESH_TOKEN_KEY }).catch((_e) => {});
      return;
    }
    getSecureStore()
      ?.deleteItemAsync(ACCESS_TOKEN_KEY)
      .catch((_e) => {});
    getSecureStore()
      ?.deleteItemAsync(REFRESH_TOKEN_KEY)
      .catch((_e) => {});
  }
}

export type StorageType = "web" | "web-local" | "native" | "memory";

export function createTokenStorage(type: StorageType = "web"): TokenStorage {
  switch (type) {
    case "web":
      return new WebStorage("session");
    case "web-local":
      return new WebStorage("local");
    case "native":
      return new NativeStorage();
    case "memory":
    default:
      return new MemoryStorage();
  }
}

/**
 * Create a NativeStorage instance and immediately restore persisted tokens
 * from the available secure store (Capacitor Preferences or expo-secure-store)
 * into the in-memory cache.
 *
 * Use this in Expo / Capacitor apps instead of `createTokenStorage('native')`
 * so that synchronous `getAccessToken()` / `getRefreshToken()` calls return
 * the correct values from the very first render.
 *
 * @example
 *   const storage = await createNativeTokenStorage();
 *   // storage.getAccessToken() now returns the persisted token (if any)
 */
export async function createNativeTokenStorage(): Promise<TokenStorage> {
  const storage = new NativeStorage();
  await storage.restoreFromSecureStore();
  return storage;
}

export function getTokenStorage(type: StorageType = "web"): TokenStorage {
  return createTokenStorage(type);
}

export { NativeStorage as SecureStorage };
