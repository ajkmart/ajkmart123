/**
 * AuthProvider.tsx — @workspace/auth-react
 *
 * Shared base auth provider consumed by all three web apps (rider, vendor, customer-web).
 * Responsibilities:
 *   - Persist access token via the injected TokenStorage (web localStorage, Capacitor Preferences,
 *     or sessionStorage depending on the app's storageType).
 *   - Silently restore session on mount: decode valid token → hydrate user, or attempt refresh.
 *   - When `role` prop is supplied, enforce it during restore: tokens whose role claim doesn't
 *     match are cleared immediately rather than silently restoring to the wrong app.
 *   - Expose login / logout helpers that downstream providers (rider-auth, vendor-auth) delegate to.
 *
 * Integration smoke-test checklist (verify after each auth refactor):
 *   [ ] OTP send → verify → register succeeds and token is persisted in the correct storage
 *   [ ] Page reload restores session without re-login (for rider/vendor localStorage storage types)
 *   [ ] Token expiry triggers silent refresh via refreshEndpoint before user sees a 401
 *   [ ] Logout clears both access and refresh tokens and redirects to /login
 *   [ ] Wrong-role token (e.g. vendor token used in rider app) is rejected on restore with role mismatch log
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { StorageType, TokenStorage } from "./api/tokenStorage";
import { createTokenStorage } from "./api/tokenStorage";
import { decodeJwt, isTokenExpired } from "./utils/jwtUtils";

export interface AuthUser {
  id: string;
  phone?: string;
  email?: string;
  role: "customer" | "rider" | "vendor" | "admin";
  approvalStatus?: string;
  rejectionReason?: string | null;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isInitializing: boolean;
  twoFactorPending: boolean;
  storageError: string | null;
  tokenStorage: TokenStorage;
  baseURL: string;
  refreshEndpoint: string;
  login: (user: AuthUser, accessToken: string) => void;
  logout: () => void;
  setTwoFactorPending: (pending: boolean) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  role?: AuthUser["role"];
  baseURL?: string;
  storageType?: StorageType;
  tokenStorage?: TokenStorage;
  refreshEndpoint?: string;
}

export function AuthProvider({
  children,
  role: expectedRole,
  baseURL = "",
  storageType = "web",
  tokenStorage: externalStorage,
  refreshEndpoint = "/api/auth/refresh",
}: AuthProviderProps) {
  const [tokenStorage] = useState<TokenStorage>(
    () => externalStorage ?? createTokenStorage(storageType)
  );

  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const hasMounted = useRef(false);

  const login = useCallback(
    (authUser: AuthUser, accessToken: string) => {
      try {
        tokenStorage.setAccessToken(accessToken);
        setStorageError(null);
      } catch (err) {
        setStorageError(err instanceof Error ? err.message : "Failed to persist token");
      }
      setUser(authUser);
      setTwoFactorPending(false);
      setIsLoading(false);
    },
    [tokenStorage]
  );

  const logout = useCallback(() => {
    try {
      tokenStorage.removeAccessToken();
    } catch (_e) {
      // best-effort
    }
    try {
      tokenStorage.removeRefreshToken();
    } catch (_e) {
      // best-effort
    }
    setUser(null);
    setTwoFactorPending(false);
    setIsLoading(false);
  }, [tokenStorage]);

  // Silent session restore on mount — avoids logged-out flicker on page reload
  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;

    async function restore() {
      try {
        const existingToken = tokenStorage.getAccessToken();

        if (!existingToken) {
          setIsInitializing(false);
          return;
        }

        // Token exists and is still valid — decode and restore user
        if (!isTokenExpired(existingToken)) {
          const payload = decodeJwt(existingToken);
          if (payload && payload.sub) {
            const tokenRole = (payload.role as AuthUser["role"]) ?? "customer";

            // Role enforcement gate: when the provider declares an expected role,
            // reject any stored token whose role claim doesn't match. This prevents
            // a vendor token from silently restoring a session inside the rider app
            // (or vice-versa) after a user switches accounts in another tab.
            // Role claim may be a comma-separated string (e.g. "customer,vendor").
            // Use includes() so multi-role users are not rejected.
            const tokenRoles = tokenRole.split(",").map((r) => r.trim());
            if (expectedRole && !tokenRoles.includes(expectedRole)) {
              console.warn(
                `[AuthProvider] Stored token roles "${tokenRole}" do not include expected role "${expectedRole}". Clearing session.`
              );
              tokenStorage.removeAccessToken();
              tokenStorage.removeRefreshToken();
              setIsInitializing(false);
              return;
            }

            const restoredUser: AuthUser = {
              id: String(payload.sub),
              phone: payload.phone as string | undefined,
              email: payload.email as string | undefined,
              role: tokenRole,
              approvalStatus: payload.approvalStatus as string | undefined,
              rejectionReason: payload.rejectionReason as string | null | undefined,
            };
            setUser(restoredUser);
            setIsInitializing(false);
            return;
          }
        }

        // Token expired — attempt a silent refresh
        try {
          const res = await fetch(`${baseURL}${refreshEndpoint}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          });

          if (res.ok) {
            const text = await res.text();
            let data: {
              accessToken?: string;
              user?: AuthUser;
              data?: { accessToken?: string; user?: AuthUser };
            } = {};
            try {
              data = JSON.parse(text);
            } catch (_e) {
              /* ignore */
            }

            const newToken = data.accessToken ?? data.data?.accessToken ?? null;
            const refreshedUser = data.user ?? data.data?.user ?? null;

            if (newToken) {
              // Role enforcement gate on the refreshed token too —
              // same logic as the non-expired restore path above.
              const newPayload = decodeJwt(newToken);
              const newTokenRoleRaw = (newPayload?.role as string) ?? "customer";
              // Role claim may be comma-separated (e.g. "customer,vendor") — use includes() for multi-role users.
              const newTokenRoles = newTokenRoleRaw.split(",").map((r) => r.trim());
              // Resolve primary role: prefer expectedRole if it matches, else first role in token.
              const newTokenRole = (
                expectedRole && newTokenRoles.includes(expectedRole)
                  ? expectedRole
                  : (newTokenRoles[0] ?? "customer")
              ) as AuthUser["role"];
              if (expectedRole && !newTokenRoles.includes(expectedRole)) {
                console.warn(
                  `[AuthProvider] Refreshed token roles "${newTokenRole}" do not include expected role "${expectedRole}". Clearing session.`
                );
                tokenStorage.removeAccessToken();
                tokenStorage.removeRefreshToken();
              } else {
                tokenStorage.setAccessToken(newToken);
                if (refreshedUser) {
                  // If the server returned a full user object, also validate its role before accepting it.
                  const serverRoleRaw = (refreshedUser.role as string) ?? newTokenRole;
                  const serverRoles = serverRoleRaw.split(",").map((r) => r.trim());
                  if (expectedRole && !serverRoles.includes(expectedRole)) {
                    console.warn(
                      `[AuthProvider] Refresh response user roles "${serverRoleRaw}" do not include expected role "${expectedRole}". Clearing session.`
                    );
                    tokenStorage.removeAccessToken();
                    tokenStorage.removeRefreshToken();
                  } else {
                    setUser(refreshedUser);
                  }
                } else if (newPayload?.sub) {
                  setUser({
                    id: String(newPayload.sub),
                    phone: newPayload.phone as string | undefined,
                    email: newPayload.email as string | undefined,
                    role: newTokenRole,
                    approvalStatus: newPayload.approvalStatus as string | undefined,
                    rejectionReason: newPayload.rejectionReason as string | null | undefined,
                  });
                }
              }
            } else {
              // Refresh returned nothing valid — clear both tokens
              tokenStorage.removeAccessToken();
              tokenStorage.removeRefreshToken();
            }
          } else {
            // Refresh failed — clear both tokens
            tokenStorage.removeAccessToken();
            tokenStorage.removeRefreshToken();
          }
        } catch (_e) {
          // Network error during silent refresh — stay logged out
          tokenStorage.removeAccessToken();
          tokenStorage.removeRefreshToken();
        }
      } finally {
        setIsInitializing(false);
      }
    }

    void restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: user != null,
    isInitializing,
    twoFactorPending,
    storageError,
    tokenStorage,
    baseURL,
    refreshEndpoint,
    login,
    logout,
    setTwoFactorPending,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Low-level hook — prefer the `useAuth` hook from hooks/useAuth.ts */
export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used inside <AuthProvider>");
  }
  return ctx;
}
