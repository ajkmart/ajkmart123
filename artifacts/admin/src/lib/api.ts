/**
 * Admin API — thin re-export layer.
 *
 * All real implementation lives in adminFetcher.tsx.
 * This file exists only for backward-compatibility of any imports that
 * still reference "@/lib/api". New code should import from
 * "@/lib/adminFetcher" directly.
 *
 * Deprecated no-op functions (getToken, setToken, clearToken, isTokenExpired,
 * setTokenHandlers) have been removed. If something broke, replace the call
 * site with the adminAuthContext equivalent:
 *   getToken()   → useAdminAuth().state.accessToken
 *   logout       → useAdminAuth().logout()
 */

export {
  // Error class
  AdminFetchError,
  adminAbsoluteFetch,
  adminDelete,
  adminFetch,
  // HTTP verb helpers
  adminGet,
  adminPatch,
  adminPost,
  adminPut,
  // Core fetch helpers
  fetchAdmin,
  fetchAdminAbsolute,
  fetchAdminAbsoluteResponse,
  // Token accessor (read-only, for non-fetch call sites like Socket.IO auth)
  getAdminAccessToken,
  // File upload
  uploadAdminImageWithProgress,
} from "./adminFetcher";

/**
 * Returns the admin API base URL for the current origin.
 * Prefer using fetchAdmin / adminFetch directly; this is kept only for
 * legacy callers that build URLs manually.
 */
export const getApiBase = (): string => `${window.location.origin}/api/admin`;
