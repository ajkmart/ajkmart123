import { createLogger } from "@/lib/logger";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
const log = createLogger("[vendor-auth]");

export interface StoreHours {
  [day: string]: { open: string; close: string; closed?: boolean };
}

export interface AuthUser {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  avatar?: string;
  walletBalance: number;
  storeName?: string;
  storeCategory?: string;
  storeBanner?: string;
  storeDescription?: string;
  storeHours?: StoreHours | null;
  storeAnnouncement?: string;
  storeMinOrder?: number;
  storeDeliveryTime?: string;
  storeIsOpen: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  stats: { todayOrders: number; todayRevenue: number; totalOrders: number; totalRevenue: number };
  cnic?: string;
  city?: string;
  address?: string;
  businessType?: string;
  bankName?: string;
  bankAccount?: string;
  bankAccountTitle?: string;
  isVerified?: boolean;
  status?: string;
}

interface AuthCtx {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: AuthUser, refreshToken?: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /* api.ts module-init already migrated any localStorage token → sessionStorage
       and wiped it from localStorage, so we must read from the api module's own
       token storage (sessionStorage-backed + in-memory cache) rather than
       directly from localStorage to avoid always appearing logged-out on refresh. */
    const t = api.getToken();
    if (t) {
      setToken(t);
      api
        .getMe()
        .then((u) => {
          setUser(u);
        })
        .catch((_e: Error & { pendingApproval?: boolean }) => {
          api.clearTokens();
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    /* Listen for session-expired events from apiFetch */
    const handleLogout = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener("ajkmart:logout", handleLogout);
    return () => window.removeEventListener("ajkmart:logout", handleLogout);
  }, []);

  const login = (t: string, u: AuthUser, refreshToken?: string) => {
    api.storeTokens(t, refreshToken);
    setToken(t);
    setUser(u);
  };

  const logout = () => {
    const refreshTok = api.getRefreshToken();
    if (refreshTok)
      api.logout(refreshTok).catch((err: unknown) => {
        log.debug("[vendor-auth] Server logout failed (token expired/network):", err);
      });
    else api.clearTokens();
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const u = await api.getMe();
      setUser(u);
    } catch (e) {
      log.warn("[vendor-auth] refreshUser failed (non-critical):", (e as Error)?.message ?? e);
    }
  };

  return (
    <Ctx.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </Ctx.Provider>
  );
}
