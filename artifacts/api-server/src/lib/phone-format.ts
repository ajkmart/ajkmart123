import { logger } from "./logger.js";

const DEFAULT_PHONE_FORMAT = "^0?3\\d{9}$";

export function normalizePhoneFormatPattern(raw?: string | null): string {
  const candidate = raw?.trim() ?? "";

  if (!candidate) {
    return DEFAULT_PHONE_FORMAT;
  }

  try {
    new RegExp(candidate);
    return candidate;
  } catch (err) {
    logger.warn(
      {
        pattern: candidate,
        error: err instanceof Error ? err.message : String(err),
      },
      "[phone-format] invalid regex pattern detected; using default"
    );
    return DEFAULT_PHONE_FORMAT;
  }
}

export function isValidPhoneFormatPattern(raw?: string | null): boolean {
  return normalizePhoneFormatPattern(raw) === (raw?.trim() ?? "");
}
