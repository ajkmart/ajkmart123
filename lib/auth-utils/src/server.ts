/**
 * Server-safe auth utilities (no React, no DOM).
 *
 * Single source of truth for parsing per-role auth-method toggles stored in
 * the `platform_settings` table. Used by the API server and any future
 * server-side helpers (e.g. background workers, scripts).
 *
 * Setting values are one of:
 *   - "on" / "off"               — global flag
 *   - JSON role map              — e.g. {"customer":"on","rider":"off","vendor":"on"}
 *   - undefined / null / ""      — treat as documented default ("off") unless
 *                                  caller provides a different fallback
 *                                  through `isAuthMethodEnabledStrict`.
 */

export type Role = "customer" | "rider" | "vendor" | "admin" | string;

/**
 * Returns true if the given auth method is enabled for the role.
 *
 * Behaviour:
 *   - missing / empty value           → false
 *   - "on" / "off"                    → boolean
 *   - JSON role map + role given      → that role's value === "on"
 *   - JSON role map + no role given   → true if ANY role has it enabled
 */
export function isAuthMethodEnabled(
  settings: Record<string, string>,
  key: string,
  role?: Role
): boolean {
  const val = settings[key];
  if (!val) return false;
  if (val === "on") return true;
  if (val === "off") return false;
  try {
    const parsed = JSON.parse(val) as Record<string, string>;
    if (role) return (parsed[role] ?? "off") === "on";
    return Object.values(parsed).some((v) => v === "on");
  } catch {
    return val === "on";
  }
}

/**
 * Strict variant used by /auth/social/* endpoints where we still need to
 * honour an older, single-value setting key (e.g. `auth_social_google`)
 * while transitioning to the new role-aware key (e.g. `auth_google_enabled`).
 *
 * Behaviour:
 *   - new key present + role given  → that role's value === "on"
 *   - new key present + no role     → false (per-role keys must be queried with a role)
 *   - new key absent + legacy key   → legacy value === "on"
 *   - everything absent              → false
 */
export function isAuthMethodEnabledStrict(
  settings: Record<string, string>,
  newKey: string,
  legacyKey: string,
  role?: Role
): boolean {
  const newVal = settings[newKey];
  if (newVal) {
    try {
      const parsed = JSON.parse(newVal) as Record<string, string>;
      if (role && role in parsed) return parsed[role] === "on";
      return false;
    } catch {
      return newVal === "on";
    }
  }
  const legacyVal = settings[legacyKey];
  if (legacyVal) return legacyVal === "on";
  return false;
}
