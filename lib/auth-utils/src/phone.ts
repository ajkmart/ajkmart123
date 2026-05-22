/**
 * Phone normalization utilities — canonical Pakistani mobile number handling.
 *
 * Re-exported from @workspace/phone-utils, which is the single authoritative source.
 * Import this from @workspace/auth-utils for frontend packages; import directly
 * from @workspace/phone-utils in server-only packages.
 */
export { canonicalizePhone, formatPhoneForApi, isValidPhone } from "@workspace/phone-utils";
