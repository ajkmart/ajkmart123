import { useToast } from "@/hooks/use-toast";
import { isApiErr } from "./adminApiTypes";
import { AdminFetchError, TimeoutError } from "./adminFetcher";

/**
 * Maps any thrown error value to a human-readable string.
 * Handles:
 *  - AdminFetchError  (non-2xx HTTP response from the admin fetcher)
 *  - TimeoutError     (request exceeded 30-second timeout)
 *  - ApiErr envelope  ({ ok: false, error: string })
 *  - plain Error objects
 *  - unknown / primitive fallback
 */
export function parseApiError(err: unknown): string {
  if (err instanceof TimeoutError) {
    return "The request timed out. Check your connection and try again.";
  }

  if (err instanceof AdminFetchError) {
    if (err.status === 401) return "Your session has expired. Please log in again.";
    if (err.status === 403) return "You do not have permission to perform this action.";
    if (err.status === 404) return "The requested resource was not found.";
    if (err.status === 409)
      return err.message || "A conflict occurred. The item may already exist.";
    if (err.status === 422) return err.message || "The submitted data is invalid.";
    if (err.status >= 500) return "A server error occurred. Please try again later.";
    return err.message || `Request failed (HTTP ${err.status}).`;
  }

  if (isApiErr(err)) {
    return err.error || "An unexpected error occurred.";
  }

  if (err instanceof Error) {
    if (err.name === "AbortError") return "The request was cancelled.";
    if (
      err.message.toLowerCase().includes("network") ||
      err.message.toLowerCase().includes("failed to fetch")
    ) {
      return "Network error. Check your connection and try again.";
    }
    return err.message || "An unexpected error occurred.";
  }

  if (typeof err === "string" && err.length > 0) return err;

  return "An unexpected error occurred.";
}

/**
 * Convenience hook — call parseApiError then fire a destructive toast.
 * Returns a stable `showError(err)` callback.
 */
export function useApiErrorToast() {
  const { toast } = useToast();

  function showError(err: unknown, title = "Something went wrong") {
    const description = parseApiError(err);
    toast({ title, description, variant: "destructive" });
  }

  return { showError };
}
