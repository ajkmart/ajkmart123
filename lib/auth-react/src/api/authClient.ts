import { isTokenExpired } from "../utils/jwtUtils";
import type { TokenStorage } from "./tokenStorage";

export interface AuthClientOptions {
  baseURL: string;
  tokenStorage: TokenStorage;
  onUnauthorized?: () => void;
  refreshEndpoint?: string;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

interface AuthClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
}

/**
 * Thrown when a 401 response cannot be recovered by a token refresh.
 * `withRetry` checks for this type and does NOT retry — 401 is not transient.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Thrown when the server returns a 2xx response but the body is not valid JSON.
 * `withRetry` checks for this type and does NOT retry — a parse failure is not transient.
 */
export class JsonParseError extends Error {
  constructor(cause?: unknown) {
    super(
      `Response body is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`
    );
    this.name = "JsonParseError";
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNonRetryableError(err: unknown): boolean {
  return err instanceof UnauthorizedError || err instanceof JsonParseError;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 300): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Non-transient errors must not be retried
      if (isNonRetryableError(err)) throw err;
      if (attempt < maxRetries) {
        await sleep(baseDelayMs * 2 ** attempt);
      }
    }
  }
  throw lastError;
}

export function createAuthClient(options: AuthClientOptions): AuthClient {
  const { baseURL, tokenStorage, onUnauthorized, refreshEndpoint = "/api/auth/refresh" } = options;

  let isRefreshing = false;
  let refreshPromise: Promise<string | null> | null = null;

  async function refreshAccessToken(): Promise<string | null> {
    if (isRefreshing && refreshPromise) return refreshPromise;

    isRefreshing = true;
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${baseURL}${refreshEndpoint}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) return null;
        const text = await res.text();
        let data: { accessToken?: string } = {};
        try {
          data = JSON.parse(text) as { accessToken?: string };
        } catch {
          return null;
        }
        if (data.accessToken) {
          tokenStorage.setAccessToken(data.accessToken);
          return data.accessToken;
        }
        return null;
      } catch {
        return null;
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options: RequestOptions = {}
  ): Promise<T> {
    const doRequest = async (token: string | null): Promise<Response> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...options.headers,
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      return fetch(`${baseURL}${path}`, {
        method,
        headers,
        credentials: "include",
        signal: options.signal,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    };

    return withRetry(async () => {
      let token = tokenStorage.getAccessToken();

      if (token && isTokenExpired(token)) {
        token = await refreshAccessToken();
      }

      let res = await doRequest(token);

      if (res.status === 401) {
        const newToken = await refreshAccessToken();
        if (!newToken) {
          onUnauthorized?.();
          throw new UnauthorizedError();
        }
        res = await doRequest(newToken);
        if (res.status === 401) {
          onUnauthorized?.();
          throw new UnauthorizedError();
        }
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status}: ${errBody}`);
      }

      const text = await res.text();
      if (!text) return null as T;

      try {
        return JSON.parse(text) as T;
      } catch (err) {
        throw new JsonParseError(err);
      }
    });
  }

  return {
    get: (path, options) => request("GET", path, undefined, options),
    post: (path, body, options) => request("POST", path, body, options),
    put: (path, body, options) => request("PUT", path, body, options),
    patch: (path, body, options) => request("PATCH", path, body, options),
    delete: (path, options) => request("DELETE", path, undefined, options),
  };
}
