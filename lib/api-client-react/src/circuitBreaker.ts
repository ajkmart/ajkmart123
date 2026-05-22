import { createLogger } from "@workspace/logger";
const log = createLogger("[circuit-breaker]");

/**
 * Lightweight per-endpoint circuit breaker.
 *
 * States
 * ──────
 * CLOSED   — normal operation; failures are counted.
 * OPEN     — all requests rejected immediately; cooldown timer running.
 * HALF_OPEN — cooldown elapsed; one probe request is allowed through.
 *             Success → CLOSED.  Failure → OPEN (cooldown resets).
 *
 * Usage
 * ──────
 *   const cb = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 30_000 });
 *
 *   // Before request:
 *   cb.check(path);          // throws CircuitOpenError when OPEN
 *
 *   // After successful response (res.ok):
 *   cb.onSuccess(path);
 *
 *   // After ALL retries exhausted on a 5xx response:
 *   cb.onFailure(path);
 */

export interface CircuitBreakerConfig {
  /** Consecutive 5xx failures before the circuit opens. Default: 3. */
  failureThreshold?: number;
  /** Milliseconds to wait before allowing a probe request. Default: 30 000. */
  cooldownMs?: number;
}

export class CircuitOpenError extends Error {
  readonly endpoint: string;
  readonly retryAfterMs: number;
  constructor(endpoint: string, retryAfterMs: number) {
    super(
      `Circuit open for "${endpoint}" — server overloaded. ` +
        `Retry in ${Math.ceil(retryAfterMs / 1000)}s.`
    );
    this.name = "CircuitOpenError";
    this.endpoint = endpoint;
    this.retryAfterMs = retryAfterMs;
  }
}

type CircuitState = "closed" | "open" | "half_open";

interface EndpointRecord {
  failures: number;
  state: CircuitState;
  openedAt: number;
}

export function createCircuitBreaker(config: CircuitBreakerConfig = {}) {
  const failureThreshold = config.failureThreshold ?? 3;
  const cooldownMs = config.cooldownMs ?? 30_000;

  const _map = new Map<string, EndpointRecord>();

  function _getOrCreate(endpoint: string): EndpointRecord {
    let rec = _map.get(endpoint);
    if (!rec) {
      rec = { failures: 0, state: "closed", openedAt: 0 };
      _map.set(endpoint, rec);
    }
    return rec;
  }

  /** Strip query string so `/orders?status=pending` and `/orders` share a record. */
  function _normalize(path: string): string {
    const q = path.indexOf("?");
    return q >= 0 ? path.slice(0, q) : path;
  }

  return {
    /**
     * Call BEFORE making a request (only on the initial attempt, not retries).
     * - CLOSED / HALF_OPEN after cooldown elapsed → returns normally.
     * - OPEN within cooldown → throws CircuitOpenError.
     */
    check(path: string): void {
      const endpoint = _normalize(path);
      const rec = _getOrCreate(endpoint);
      if (rec.state === "closed") return;

      const elapsed = Date.now() - rec.openedAt;
      if (elapsed >= cooldownMs) {
        // Cooldown elapsed — allow one probe through in half-open state.
        rec.state = "half_open";
        return;
      }
      throw new CircuitOpenError(endpoint, cooldownMs - elapsed);
    },

    /**
     * Call when the response is successful (res.ok).
     * Resets the failure count and closes the circuit.
     */
    onSuccess(path: string): void {
      const endpoint = _normalize(path);
      const rec = _getOrCreate(endpoint);
      if (rec.failures > 0 || rec.state !== "closed") {
        rec.failures = 0;
        rec.state = "closed";
      }
    },

    /**
     * Call when ALL retries for a 5xx response are exhausted.
     * Increments the failure counter; opens the circuit once the threshold
     * is reached (or immediately when in half-open state).
     */
    onFailure(path: string): void {
      const endpoint = _normalize(path);
      const rec = _getOrCreate(endpoint);
      rec.failures += 1;
      if (rec.failures >= failureThreshold || rec.state === "half_open") {
        rec.state = "open";
        rec.openedAt = Date.now();
        log.warn(
          `OPEN — "${endpoint}" failed ${rec.failures}× consecutively. ` +
            `Cooling down for ${cooldownMs / 1000}s.`
        );
      }
    },

    /** Expose current state — useful for debug panels or toast messages. */
    getState(path: string): { state: CircuitState; failures: number; retryAfterMs: number } {
      const endpoint = _normalize(path);
      const rec = _getOrCreate(endpoint);
      const retryAfterMs =
        rec.state === "open" ? Math.max(0, cooldownMs - (Date.now() - rec.openedAt)) : 0;
      return { state: rec.state, failures: rec.failures, retryAfterMs };
    },

    /** Reset one endpoint (or all) — useful for testing or manual recovery UI. */
    reset(path?: string): void {
      if (path) {
        _map.delete(_normalize(path));
      } else {
        _map.clear();
      }
    },
  };
}

export type ApiCircuitBreaker = ReturnType<typeof createCircuitBreaker>;
