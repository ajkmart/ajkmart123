/**
 * vendorTiming — typed timing-override registry for the Vendor app.
 *
 * Built on the shared `@workspace/admin-timing-shared` factory so the
 * vendor, rider, customer, and admin apps all share identical
 * apply/reset/get semantics. The admin panel is the source of truth
 * for runtime overrides — it pushes them through the platform config
 * endpoint and each app calls `vendorTiming.apply(overrides)` on boot.
 */

import { createTimingRegistry } from "@workspace/admin-timing-shared";

export interface VendorTimingConfig extends Record<string, number> {
  /** Poll interval for new orders. */
  newOrderPollMs: number;
  /** Auto-accept window before the order is offered to another vendor. */
  autoAcceptWindowMs: number;
  /** Max retry attempts for vendor-side mutations. */
  maxRetryAttempts: number;
  /** Base backoff between retries. */
  retryBackoffBaseMs: number;
  /** API timeout for vendor-side requests. */
  apiTimeoutMs: number;
}

const DEFAULTS: VendorTimingConfig = {
  newOrderPollMs: 15_000,
  autoAcceptWindowMs: 60_000,
  maxRetryAttempts: 3,
  retryBackoffBaseMs: 1_000,
  apiTimeoutMs: 30_000,
};

export const vendorTiming = createTimingRegistry<VendorTimingConfig>(DEFAULTS);

export function getVendorTiming(): VendorTimingConfig {
  return vendorTiming.get();
}
