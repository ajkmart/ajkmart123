/**
 * Centralized typed error extraction from unknown error types.
 * Used throughout the app to safely handle catch (e: unknown) blocks.
 */
export function getErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;

    // Check for API response error structure
    const response = obj["response"];
    if (typeof response === "object" && response !== null) {
      const data = (response as Record<string, unknown>)["data"];
      if (typeof data === "object" && data !== null) {
        const apiErr = (data as Record<string, unknown>)["error"];
        if (typeof apiErr === "string" && apiErr) return apiErr;
      }
    }

    // Check for direct error field
    const data = obj["data"];
    if (typeof data === "object" && data !== null) {
      const apiErr = (data as Record<string, unknown>)["error"];
      if (typeof apiErr === "string" && apiErr) return apiErr;
    }

    // Check for message field
    const msg = obj["message"];
    if (typeof msg === "string" && msg) return msg;

    // Check for error field
    const err = obj["error"];
    if (typeof err === "string" && err) return err;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return fallback;
}
