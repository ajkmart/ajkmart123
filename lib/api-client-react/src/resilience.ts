/**
 * createResilientFetcher — shared resilience factory for api-client-react.
 *
 * Encapsulates circuit-breaker + 5xx exponential-backoff retry so that
 * rider-app/api.ts and vendor-app/api.ts do not need to duplicate the logic.
 *
 * Usage:
 *   import { createResilientFetcher } from '@workspace/api-client-react';
 *   const fetcher = createResilientFetcher({ baseUrl, getToken, ... });
 *   const data = await fetcher('/some/path', { method: 'GET' });
 */

import { CircuitOpenError, createCircuitBreaker } from "./circuitBreaker";
import type { CreateApiFetcherConfig } from "./createApiFetcher";
import { createApiFetcher, RefreshError } from "./createApiFetcher";

export interface ResilientFetcherConfig extends CreateApiFetcherConfig {
  /** Number of 5xx retries before giving up (default: 3). Delays: 1s, 2s, 4s. */
  maxRetries?: number;
  /** Circuit-breaker failure threshold before opening (default: 3). */
  failureThreshold?: number;
  /** Circuit-breaker cooldown in ms (default: 30 000). */
  cooldownMs?: number;
  /**
   * Called with the raw parsed JSON object on every successful response, before
   * the server envelope is unwrapped ({data}) and returned to the caller.
   * Use this to capture top-level envelope fields (e.g. csrfToken) that would
   * otherwise be stripped by the data-unwrapping step.
   */
  onRawJson?: (json: unknown) => void;
}

export interface ResilientFetcher {
  fetch(path: string, opts?: RequestInit, retries?: number): Promise<unknown>;
  refresh(): Promise<"refreshed" | "auth_failed" | "transient">;
}

/**
 * Creates a fetch function that includes:
 *  - Per-endpoint circuit breaker (opens after `failureThreshold` 5xx failures)
 *  - 5xx exponential-backoff retry (up to `maxRetries` attempts: 1s / 2s / 4s)
 *  - Automatic 401 → token refresh → retry via createApiFetcher
 *  - Graceful translation of RefreshError into typed results
 */
export function createResilientFetcher(config: ResilientFetcherConfig): ResilientFetcher {
  const {
    maxRetries = 3,
    failureThreshold = 3,
    cooldownMs = 30_000,
    onRawJson,
    ...fetcherConfig
  } = config;

  const circuitBreaker = createCircuitBreaker({ failureThreshold, cooldownMs });
  const [_fetcher, _refresh] = createApiFetcher(fetcherConfig);

  async function fetch(
    path: string,
    opts: RequestInit = {},
    retries: number = maxRetries
  ): Promise<unknown> {
    if (retries === maxRetries) {
      try {
        circuitBreaker.check(path);
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          const retryS = Math.ceil((err as CircuitOpenError).retryAfterMs / 1000);
          throw Object.assign(
            new Error(`Service temporarily unavailable. Please try again in ${retryS}s.`),
            { status: 503, transient: true, circuitOpen: true }
          );
        }
        throw err;
      }
    }

    let res: Response;
    try {
      res = await _fetcher(path, opts);
    } catch (err) {
      if (err instanceof RefreshError) {
        const re = err as RefreshError;
        if (re.isTransient) {
          throw Object.assign(
            new Error("Connection issue. Please check your network and try again."),
            { status: 0, transient: true }
          );
        }
        throw Object.assign(new Error("Session expired. Please log in again."), { status: 401 });
      }
      if (err instanceof Error && err.name === "AbortError") throw err;
      throw Object.assign(new Error("Network error. Please check your connection and try again."), {
        status: 0,
        transient: true,
      });
    }

    if (res.status >= 500 && retries > 0) {
      const attempt = maxRetries - retries + 1;
      const delayMs = 1000 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delayMs));
      return fetch(path, opts, retries - 1);
    }

    if (!res.ok) {
      if (res.status >= 500) circuitBreaker.onFailure(path);
      const body = await res.json().catch((_e) => ({ error: res.statusText }));
      throw Object.assign(new Error((body as { error?: string }).error ?? "Request failed"), {
        status: res.status,
        responseData: body,
      });
    }

    circuitBreaker.onSuccess(path);
    const json = await res.json().catch((_e) => ({}));
    /* Notify the caller about the raw envelope before unwrapping.
       Consumers can use this to capture top-level fields (e.g. csrfToken). */
    if (onRawJson) onRawJson(json);
    return (json as { data?: unknown }).data !== undefined
      ? (json as { data: unknown }).data
      : json;
  }

  return { fetch, refresh: _refresh };
}
