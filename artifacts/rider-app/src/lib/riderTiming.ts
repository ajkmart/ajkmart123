/**
 * riderTiming — typed timing-override registry for the Rider app.
 *
 * Built on the shared `@workspace/admin-timing-shared` factory so the
 * rider, vendor, customer, and admin apps all share identical
 * apply/reset/get semantics. The admin panel is the source of truth
 * for runtime overrides — it pushes them through the platform config
 * endpoint and each app calls `riderTiming.apply(overrides)` on boot.
 */

import { createTimingRegistry } from "@workspace/admin-timing-shared";

export interface RiderTimingConfig extends Record<string, number> {
  /** GPS sample interval while the rider is actively delivering. */
  gpsActiveIntervalMs: number;
  /** GPS sample interval when the rider is idle. */
  gpsIdleIntervalMs: number;
  /** Maximum entries kept in the IndexedDB GPS queue (Rider GPS Queue Max). */
  gpsQueueMax: number;
  /** Time-to-live for a dismissed delivery request before it can re-appear. */
  dismissedRequestTtlMs: number;
  /** API timeout for rider-side requests. */
  apiTimeoutMs: number;
  /** Maximum retry attempts for rider mutations. */
  maxRetryAttempts: number;
  /** Base backoff between retries (linear or exponential, see consumer). */
  retryBackoffBaseMs: number;
}

const DEFAULTS: RiderTimingConfig = {
  gpsActiveIntervalMs: 5_000,
  gpsIdleIntervalMs: 30_000,
  gpsQueueMax: 500,
  dismissedRequestTtlMs: 90_000,
  apiTimeoutMs: 30_000,
  maxRetryAttempts: 3,
  retryBackoffBaseMs: 1_000,
};

export const riderTiming = createTimingRegistry<RiderTimingConfig>(DEFAULTS);

export function getRiderTiming(): RiderTimingConfig {
  return riderTiming.get();
}
