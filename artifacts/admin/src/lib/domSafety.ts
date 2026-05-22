/**
 * domSafety — narrow helpers for the very small number of admin call
 * sites that still touch the DOM directly. Each helper snapshots the
 * value it overrides so cleanup restores the original instead of
 * forcing it to "" and clobbering whatever the host page set.
 */
import { createLogger } from "@/lib/logger";
const log = createLogger("[domSafety]");

/**
 * Lock document.body scroll while a modal/drawer is open. Returns a
 * disposer that restores the previous overflow value. Safe in SSR (no
 * window/document) — the disposer is a no-op.
 */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined" || !document.body) return () => {};
  const previous = document.body.style.overflow;
  try {
    document.body.style.overflow = "hidden";
  } catch (err) {
    log.warn("lockBodyScroll failed:", err);
    return () => {};
  }
  return () => {
    try {
      document.body.style.overflow = previous;
    } catch (err) {
      log.warn("restoreBodyScroll failed:", err);
    }
  };
}
