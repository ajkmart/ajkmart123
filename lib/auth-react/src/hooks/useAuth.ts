import { useAuthContext } from "../AuthProvider";
import { useTokenRefresh } from "./useTokenRefresh";

/**
 * Primary hook for consuming auth state in any component.
 *
 * Automatically wires up proactive token refresh based on the current
 * access token's expiry. Call logout() to clear session and token.
 *
 * Must be used inside <AuthProvider>.
 */
export function useAuth() {
  const ctx = useAuthContext();

  const { refreshToken } = useTokenRefresh({
    tokenStorage: ctx.tokenStorage,
    baseURL: ctx.baseURL,
    onLogout: ctx.logout,
    onRefresh: (newToken) => {
      // Keep token storage up-to-date — AuthProvider.login() would
      // also accept a user object, but here we only have a new token.
      ctx.tokenStorage.setAccessToken(newToken);
    },
  });

  return {
    user: ctx.user,
    isLoading: ctx.isLoading,
    isAuthenticated: ctx.isAuthenticated,
    twoFactorPending: ctx.twoFactorPending,
    storageError: ctx.storageError,
    login: ctx.login,
    logout: ctx.logout,
    refreshToken,
  };
}
