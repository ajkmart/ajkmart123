/**
 * Defines and implements the logout sequence for the rider app.
 *
 * Security invariant: local tokens MUST be cleared BEFORE the network
 * revocation request is issued.  This ensures that even if the revocation
 * call is slow, blocked, or fails entirely, the local session is already
 * dead and cannot be reused.
 */
import { createLogger } from "@/lib/logger";
const log = createLogger("[logoutSequence]");

export interface LogoutApi {
  getRefreshToken(): string;
  clearTokens(): void;
  logout(refreshToken: string): Promise<unknown>;
}

/**
 * Executes the secure logout sequence.
 *
 * Order is guaranteed:
 *   1. Capture the refresh token (before clearing).
 *   2. Clear all local tokens immediately.
 *   3. Run any caller-supplied state-clearing callbacks (React state, cache…).
 *   4. Fire the server-side revocation request (non-blocking, errors ignored).
 */
export function executeLogoutSequence(apiClient: LogoutApi, clearAppState: () => void): void {
  const refreshTok = apiClient.getRefreshToken();
  apiClient.clearTokens();
  clearAppState();
  if (refreshTok) {
    /* Token is already cleared locally — server revocation is fire-and-forget */
    apiClient.logout(refreshTok).catch((err) => {
      log.warn("server token revocation failed (local session already cleared):", err);
    });
  }
}
