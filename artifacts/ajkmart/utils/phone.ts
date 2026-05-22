/**
 * Normalizes a Pakistani phone number to canonical 10-digit format: `3xxxxxxxxx`
 * (no leading zero, no country code).
 *
 * Accepted inputs:
 *   03001234567  →  3001234567  (local format with leading zero)
 *   3001234567   →  3001234567  (already canonical)
 *   +923001234567 → 3001234567  (E.164 with plus)
 *   923001234567  → 3001234567  (E.164 without plus)
 *
 * Returns the cleaned string as-is if it does not match any known pattern.
 */
export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  if (/^\+?92(3\d{9})$/.test(cleaned)) {
    const match = cleaned.match(/^\+?92(3\d{9})$/);
    return match![1]!;
  }
  if (/^0(3\d{9})$/.test(cleaned)) {
    const match = cleaned.match(/^0(3\d{9})$/);
    return match![1]!;
  }
  return cleaned;
}

/**
 * Returns true if the raw input represents a valid Pakistani mobile number
 * that normalizes to a 10-digit `3xxxxxxxxx` string.
 */
export function isValidPakistaniPhone(raw: string): boolean {
  return /^3\d{9}$/.test(normalizePhone(raw));
}

export function buildPhoneValidator(
  _format?: string,
): (raw: string) => string | null {
  return (raw: string) => {
    if (!raw || raw.trim() === "") return "Phone number is required";
    if (!isValidPakistaniPhone(raw)) return "Enter a valid Pakistani mobile number (e.g. 03001234567)";
    return null;
  };
}
