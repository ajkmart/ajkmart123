/**
 * jwtUtils.ts — @workspace/auth-react
 *
 * Re-exports canonical JWT decode utilities from @workspace/auth-utils.
 * @workspace/auth-utils is the single source of truth for JWT decoding across
 * all web apps and the shared SDK. auth-react re-exports for backward compat
 * so existing imports inside this package continue to work unchanged.
 */
export { decodeJwt, isTokenExpired } from "@workspace/auth-utils";
export type { JwtPayload } from "@workspace/auth-utils";

import { decodeJwt } from "@workspace/auth-utils";

/**
 * Returns the number of seconds until the token expires.
 * Returns 0 for expired or unparseable tokens.
 * UI-specific helper — not in auth-utils since it's only needed for display countdowns.
 */
export function getTokenExpiryRemaining(token: string): number {
  const payload = decodeJwt(token);
  if (!payload || typeof payload.exp !== "number") return 0;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.max(0, payload.exp - nowSeconds);
}
