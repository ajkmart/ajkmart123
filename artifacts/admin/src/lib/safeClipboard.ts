/**
 * safeClipboard — surfaces clipboard failures instead of swallowing them.
 *
 * Returns an `ok` flag so callers can show a toast on failure. Always logs
 * the underlying error with a consistent prefix for diagnostics.
 */
import { createLogger } from "@/lib/logger";
const log = createLogger("[safeClipboard]");

export interface ClipboardResult {
  ok: boolean;
  error?: unknown;
}

export async function safeCopyToClipboard(text: string): Promise<ClipboardResult> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      const err = new Error("Clipboard API unavailable");
      log.error("writeText failed:", err);
      return { ok: false, error: err };
    }
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch (err) {
    log.error("writeText failed:", err);
    return { ok: false, error: err };
  }
}
