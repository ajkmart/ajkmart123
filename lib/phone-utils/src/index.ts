/**
 * Canonical Pakistani mobile phone number utilities.
 *
 * This is a pure, dependency-free module importable by any package —
 * including the API server — without pulling in React or browser APIs.
 *
 * The same logic is re-exported by @workspace/auth-utils for frontend packages.
 */

/**
 * Normalizes a Pakistani mobile number to 10-digit bare format: `3xxxxxxxxx`
 * (no leading zero, no country code).
 *
 * Accepts all common formats:
 *   - 03001234567   (local with zero)
 *   - 3001234567    (bare 10-digit)
 *   - +923001234567 (E.164)
 *   - 923001234567  (country code without +)
 */
export function canonicalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-()+]/g, "");
  const e164Match = cleaned.match(/^(?:\+?92)(3\d{9})$/);
  if (e164Match) return e164Match[1]!;
  const localMatch = cleaned.match(/^0(3\d{9})$/);
  if (localMatch) return localMatch[1]!;
  const bareMatch = cleaned.match(/^(3\d{9})$/);
  if (bareMatch) return bareMatch[1]!;
  return cleaned;
}

/**
 * Returns the number in local `03xxxxxxxxx` format (with leading zero)
 * suitable for SMS gateway calls.
 */
export function formatPhoneForApi(localDigits: string): string {
  const canonical = canonicalizePhone(localDigits);
  if (canonical.startsWith("3") && canonical.length === 10) return `0${canonical}`;
  const digits = localDigits.replace(/\D/g, "");
  if (digits.startsWith("0")) return digits;
  return `0${digits}`;
}

/** Returns true iff the input normalizes to a valid 10-digit Pakistani mobile. */
export function isValidPhone(phone: string): boolean {
  return /^3\d{9}$/.test(canonicalizePhone(phone));
}

/**
 * Regex for Pakistani mobile numbers.
 * Accepts `03XXXXXXXXX` (with leading zero) or `3XXXXXXXXX` (bare 10-digit).
 * Single source of truth — import this everywhere instead of re-defining inline.
 */
export const PHONE_REGEX = /^0?3\d{9}$/;

/**
 * Regex for Pakistani CNIC numbers in the formatted display form: XXXXX-XXXXXXX-X
 * Single source of truth — import this everywhere instead of re-defining inline.
 */
export const CNIC_REGEX = /^\d{5}-\d{7}-\d{1}$/;

/**
 * Returns true iff the input is a valid Pakistani CNIC in the formatted
 * display form: `XXXXX-XXXXXXX-X` (13 digits separated by two hyphens).
 */
export function isValidCnic(cnic: string): boolean {
  return CNIC_REGEX.test(cnic.trim());
}
