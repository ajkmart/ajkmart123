import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  setAuthTokenGetter,
  setOnUnauthorized,
  setRefreshTokenGetter,
  setOnTokenRefreshed,
} from "@workspace/api-client-react";
import { useLanguage } from "./LanguageContext";
import { io, type Socket } from "socket.io-client";

export type UserRole = "customer" | "rider" | "vendor";

export interface AppUser {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  username?: string;
  role: UserRole;
  roles?: string[];
  avatar?: string;
  walletBalance: number;
  isActive: boolean;
  createdAt: string;
  cnic?: string;
  city?: string;
  area?: string;
  address?: string;
  latitude?: string;
  longitude?: string;
  accountLevel?: string;
  kycStatus?: string;
  totpEnabled?: boolean;
}

interface TwoFactorPending {
  tempToken: string;
  userId: string;
}

interface AuthContextType {
  user: AppUser | null;
  token: string | null;
  refreshToken: () => Promise<string | null>;
  isLoading: boolean;
  isSuspended: boolean;
  suspendedMessage: string;
  sessionExpired: boolean;
  biometricEnabled: boolean;
  twoFactorPending: TwoFactorPending | null;
  login: (user: AppUser, token: string, refreshToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AppUser>) => void;
  clearSuspended: () => void;
  clearSessionExpired: () => void;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  setTwoFactorPending: (pending: TwoFactorPending | null) => void;
  completeTwoFactorLogin: (user: AppUser, token: string, refreshToken?: string) => Promise<void>;
  attemptBiometricLogin: () => Promise<boolean>;
  socket: Socket | null;
}

const TOKEN_KEY         = "ajkmart_token";
const REFRESH_TOKEN_KEY = "ajkmart_refresh_token";
const USER_KEY          = "@ajkmart_user";
const BIOMETRIC_KEY     = "@ajkmart_biometric_enabled";
const BIOMETRIC_TOKEN   = "ajkmart_biometric_token";

const LEGACY_TOKEN_KEY = "@ajkmart_token";
const LEGACY_REFRESH_KEY = "@ajkmart_refresh_token";

async function secureSet(key: string, value: string) {
  try { await SecureStore.setItemAsync(key, value); } catch { await AsyncStorage.setItem(key, value); }
}
async function secureGet(key: string): Promise<string | null> {
  try {
    const val = await SecureStore.getItemAsync(key);
    if (val) return val;
  } catch {}
  return AsyncStorage.getItem(key);
}
async function secureDelete(key: string) {
  try { await SecureStore.deleteItemAsync(key); } catch {}
  try { await AsyncStorage.removeItem(key); } catch {}
}

async function migrateTokensToSecureStore() {
  try {
    const [[, legacyToken], [, legacyRefresh]] = await AsyncStorage.multiGet([LEGACY_TOKEN_KEY, LEGACY_REFRESH_KEY]);
    if (legacyToken) {
      await secureSet(TOKEN_KEY, legacyToken);
      await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
    }
    if (legacyRefresh) {
      await secureSet(REFRESH_TOKEN_KEY, legacyRefresh);
      await AsyncStorage.removeItem(LEGACY_REFRESH_KEY);
    }
  } catch {}
}

const AuthContext = createContext<AuthContextType | null>(null);

function decodeJwtExp(tok: string): number | null {
  try {
    const parts = tok.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    let jsonStr: string;
    if (typeof atob === "function") {
      jsonStr = atob(b64);
    } else {
      jsonStr = (globalThis as unknown as { Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } } }).Buffer?.from(b64, "base64")?.toString("binary") ?? "";
    }
    const payload = JSON.parse(jsonStr);
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspendedMessage, setSuspendedMessage] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [twoFactorPending, setTwoFactorPending] = useState<TwoFactorPending | null>(null);
  const [socketState, setSocketState] = useState<Socket | null>(null);
  const { syncToServer, setAuthToken } = useLanguage();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* FIX 4: Refs so callbacks always see the latest user/token without stale closure */
  const userRef  = useRef<AppUser | null>(null);
  const tokenRef = useRef<string | null>(null);
  useEffect(() => { userRef.current  = user;  }, [user]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  /* Ref to doLogout so registerAuth (empty-deps useCallback) can always call latest version */
  const doLogoutRef = useRef<() => Promise<void>>(async () => {});

  const clearRefreshTimer = () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  const scheduleProactiveRefresh = (tok: string) => {
    clearRefreshTimer();
    const exp = decodeJwtExp(tok);
    if (!exp) return;
    const expiresAt = exp * 1000;
    const refreshIn = Math.max((expiresAt - Date.now()) - 60_000, 10_000);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const refreshToken = await secureGet(REFRESH_TOKEN_KEY);
        if (!refreshToken) {
          /* FIX 4: Use ref so we always call the latest doLogout */
          await doLogoutRef.current();
          return;
        }
        const base = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;
        const res = await fetch(`${base}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          await doLogoutRef.current();
          setSessionExpired(true);
          return;
        }
        const data = await res.json() as { token?: string; refreshToken?: string };
        if (!data.token) {
          await doLogoutRef.current();
          setSessionExpired(true);
          return;
        }
        const meRes = await fetch(`${base}/api/users/profile`, {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          const freshUser: AppUser = meData.user || meData;
          setUser(freshUser);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(freshUser));
        }
        setToken(data.token);
        await secureSet(TOKEN_KEY, data.token);
        if (data.refreshToken) {
          await secureSet(REFRESH_TOKEN_KEY, data.refreshToken);
          setRefreshTokenGetter(() => data.refreshToken!);
        }
        setAuthTokenGetter(() => data.token!);
        scheduleProactiveRefresh(data.token!);
      } catch {
        await doLogoutRef.current();
        setSessionExpired(true);
      }
    }, refreshIn);
  };

  const clearCustomerLocation = async (userId: string, userToken: string) => {
    try {
      const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;
      await fetch(`${API_BASE}/locations/clear`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ userId }),
      });
    } catch {}
  };

  const doLogout = async () => {
    /* FIX 4: Use refs to always read current values, not stale closure */
    const tok = tokenRef.current;
    const u   = userRef.current;
    if (u?.role === "customer" && tok) {
      clearCustomerLocation(u.id, tok).catch(() => {});
    }
    clearRefreshTimer();
    await AsyncStorage.multiRemove([USER_KEY]);
    await secureDelete(TOKEN_KEY);
    await secureDelete(REFRESH_TOKEN_KEY);
    await secureDelete(BIOMETRIC_TOKEN);
    setBiometricEnabledState(false);
    await AsyncStorage.setItem(BIOMETRIC_KEY, "false");
    setUser(null);
    setToken(null);
    setTwoFactorPending(null);
    setAuthToken(null);
    setAuthTokenGetter(null);
    setRefreshTokenGetter(null);
    setOnTokenRefreshed(null);
    setOnUnauthorized(null);
  };

  /* FIX 4: Keep doLogoutRef always pointing to the latest doLogout */
  useEffect(() => { doLogoutRef.current = doLogout; });

  const registerAuth = useCallback((tok: string, refreshTok: string | null) => {
    setAuthTokenGetter(() => tok);
    setRefreshTokenGetter(refreshTok ? () => refreshTok : null);

    setOnTokenRefreshed(async (newToken: string, newRefreshToken: string) => {
      setToken(newToken);
      await secureSet(TOKEN_KEY, newToken);
      if (newRefreshToken) {
        await secureSet(REFRESH_TOKEN_KEY, newRefreshToken);
        setRefreshTokenGetter(() => newRefreshToken);
      }
      setAuthTokenGetter(() => newToken);
      scheduleProactiveRefresh(newToken);
    });

    /* FIX 4 + FIX 8: Use doLogoutRef so we always call the latest doLogout, and await it */
    setOnUnauthorized(async (statusCode?: number, errorMsg?: string) => {
      if (statusCode === 403) {
        setIsSuspended(true);
        setSuspendedMessage(errorMsg || "Your account has been suspended. Contact support.");
        return;
      }
      /* 401 or any other unauthorized response — session truly expired */
      await doLogoutRef.current();
      setSessionExpired(true);
    });

    scheduleProactiveRefresh(tok);
  }, []);

  useEffect(() => {
    const loadAuth = async () => {
      try {
        await migrateTokensToSecureStore();
        const [[, storedUser], [, bioPref]] = await AsyncStorage.multiGet([
          USER_KEY,
          BIOMETRIC_KEY,
        ]);
        const storedToken = await secureGet(TOKEN_KEY);
        const storedRefresh = await secureGet(REFRESH_TOKEN_KEY);
        if (bioPref === "true") setBiometricEnabledState(true);
        if (storedUser && storedToken) {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          setToken(storedToken);
          setAuthToken(storedToken);
          registerAuth(storedToken, storedRefresh);
          syncToServer(storedToken).catch(() => {});
        }
      } catch (err) { console.error("[AuthContext] loadAuth failed:", err); }
      setIsLoading(false);
    };
    loadAuth();
  }, [registerAuth]);

  const captureCustomerLocation = async (userId: string, userToken: string) => {
    try {
      const Location = await import("expo-location");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;
      await fetch(`${API_BASE}/locations/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({
          userId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          role: "customer",
        }),
      });
    } catch {}
  };

  const doRefreshToken = async (): Promise<string | null> => {
    try {
      const stored = await secureGet(REFRESH_TOKEN_KEY);
      if (!stored) return null;
      const base = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;
      const res = await fetch(`${base}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: stored }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { token?: string; refreshToken?: string };
      if (data.token) {
        setToken(data.token);
        await secureSet(TOKEN_KEY, data.token);
        if (data.refreshToken) {
          await secureSet(REFRESH_TOKEN_KEY, data.refreshToken);
          setRefreshTokenGetter(() => data.refreshToken!);
        }
        setAuthTokenGetter(() => data.token!);
        scheduleProactiveRefresh(data.token!);
        return data.token;
      }
      return null;
    } catch { return null; }
  };

  const login = async (userData: AppUser, userToken: string, refreshToken?: string) => {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
    await secureSet(TOKEN_KEY, userToken);
    if (refreshToken) await secureSet(REFRESH_TOKEN_KEY, refreshToken);
    setUser(userData);
    setToken(userToken);
    setTwoFactorPending(null);
    setAuthToken(userToken);
    registerAuth(userToken, refreshToken ?? null);
    syncToServer(userToken).catch(() => {});
    /* Capture customer location on login (foreground only) */
    if (userData.role === "customer") {
      captureCustomerLocation(userData.id, userToken).catch(() => {});
    }
  };

  const completeTwoFactorLogin = async (userData: AppUser, userToken: string, refreshToken?: string) => {
    setTwoFactorPending(null);
    await login(userData, userToken, refreshToken);
  };

  const logout = async () => {
    await doLogout();
  };

  const updateUser = (updates: Partial<AppUser>) => {
    if (user) {
      const updated = { ...user, ...updates };
      setUser(updated);
      AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
    }
  };

  const clearSuspended = async () => {
    setIsSuspended(false);
    setSuspendedMessage("");
    await doLogout();
  };

  const clearSessionExpired = () => {
    setSessionExpired(false);
  };

  const setBiometricEnabled = async (enabled: boolean) => {
    setBiometricEnabledState(enabled);
    await AsyncStorage.setItem(BIOMETRIC_KEY, enabled ? "true" : "false");
    /* biometric pref is non-sensitive — stays in AsyncStorage */
    if (enabled && token) {
      try {
        const refreshTok = await secureGet(REFRESH_TOKEN_KEY);
        if (refreshTok) {
          await secureSet(BIOMETRIC_TOKEN, refreshTok);
        }
      } catch {}
    } else if (!enabled) {
      try {
        await secureDelete(BIOMETRIC_TOKEN);
      } catch {}
    }
  };

  const attemptBiometricLogin = async (): Promise<boolean> => {
    if (!biometricEnabled) return false;
    try {
      const LocalAuth = await import("expo-local-authentication");
      const hasHardware = await LocalAuth.hasHardwareAsync();
      if (!hasHardware) return false;
      const isEnrolled = await LocalAuth.isEnrolledAsync();
      if (!isEnrolled) return false;

      const result = await LocalAuth.authenticateAsync({
        promptMessage: "Login with Biometrics",
        cancelLabel: "Cancel",
        fallbackLabel: "Use password",
        disableDeviceFallback: false,
      });
      if (!result.success) {
        /* FIX 7: Only permanently disable biometric on actual hardware/lockout failures.
           User cancel or fallback should NOT disable it. */
        const nonFatalErrors = ["user_cancel", "system_cancel", "user_fallback", "app_cancel"];
        const isFatal = !result.error || !nonFatalErrors.includes(result.error as string);
        if (isFatal) {
          await setBiometricEnabled(false);
        }
        return false;
      }

      const storedRefreshToken = await secureGet(BIOMETRIC_TOKEN);
      if (!storedRefreshToken) return false;

      const base = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;
      const res = await fetch(`${base}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });
      if (!res.ok) {
        await secureDelete(BIOMETRIC_TOKEN);
        setBiometricEnabledState(false);
        await AsyncStorage.setItem(BIOMETRIC_KEY, "false");
        return false;
      }
      const data = await res.json() as { token?: string; refreshToken?: string };
      if (!data.token) return false;

      const meRes = await fetch(`${base}/api/users/profile`, {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      if (!meRes.ok) return false;
      const meData = await meRes.json();
      const freshUser: AppUser = meData.user || meData;

      await login(freshUser, data.token, data.refreshToken);
      if (data.refreshToken) {
        await secureSet(BIOMETRIC_TOKEN, data.refreshToken);
      }
      return true;
    } catch {
      return false;
    }
  };

  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!token || !user?.id) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }
    const base = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;
    const socket = io(base, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    setSocketState(socket);

    const handleWalletBalance = (payload: { balance: number }) => {
      if (typeof payload?.balance === "number") {
        setUser(prev => prev ? { ...prev, walletBalance: payload.balance } : prev);
        AsyncStorage.getItem(USER_KEY).then(stored => {
          if (!stored) return;
          try {
            const parsed = JSON.parse(stored);
            AsyncStorage.setItem(USER_KEY, JSON.stringify({ ...parsed, walletBalance: payload.balance }));
          } catch {}
        });
      }
    };

    socket.on("wallet:update", handleWalletBalance);
    socket.on("wallet:balance", handleWalletBalance);

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketState(null);
    };
  }, [token, user?.id]);

  return (
    <AuthContext.Provider value={{
      user, token, refreshToken: doRefreshToken, isLoading, isSuspended, suspendedMessage,
      sessionExpired,
      biometricEnabled, twoFactorPending,
      login, logout, updateUser, clearSuspended, clearSessionExpired,
      setBiometricEnabled, setTwoFactorPending,
      completeTwoFactorLogin, attemptBiometricLogin,
      socket: socketState,
    }}>
      {children}
      <Modal
        visible={sessionExpired}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={sessionExpiredStyles.overlay}>
          <View style={sessionExpiredStyles.card}>
            <View style={sessionExpiredStyles.iconWrap}>
              <Text style={sessionExpiredStyles.iconText}>🔒</Text>
            </View>
            <Text style={sessionExpiredStyles.title}>Session Expired</Text>
            <Text style={sessionExpiredStyles.subtitle}>
              Your session has expired. Please log in again to continue.
            </Text>
            <Pressable
              style={sessionExpiredStyles.btn}
              onPress={() => {
                clearSessionExpired();
                router.replace("/auth");
              }}
            >
              <Text style={sessionExpiredStyles.btnTxt}>Go to Login</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </AuthContext.Provider>
  );
}

const sessionExpiredStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  iconText: {
    fontSize: 34,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  btn: {
    backgroundColor: "#0066FF",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: "center",
    width: "100%",
  },
  btnTxt: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function hasRole(user: AppUser | null | undefined, role: UserRole): boolean {
  if (!user) return false;
  if (Array.isArray((user as unknown as { roles?: unknown[] }).roles)) {
    return (user as unknown as { roles: string[] }).roles.includes(role);
  }
  const rolesStr = String((user as unknown as { roles?: unknown }).roles ?? user.role ?? "");
  return rolesStr.split(",").map((r) => r.trim()).includes(role);
}
