import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  NotoNastaliqUrdu_400Regular,
  NotoNastaliqUrdu_500Medium,
  NotoNastaliqUrdu_600SemiBold,
  NotoNastaliqUrdu_700Bold,
} from "@expo-google-fonts/noto-nastaliq-urdu";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import * as Font from "expo-font";
import * as Linking from "expo-linking";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import { PlatformConfigProvider, usePlatformConfig } from "@/context/PlatformConfigContext";
import { ToastProvider } from "@/context/ToastContext";
import { tDual, type TranslationKey } from "@workspace/i18n";

const _domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
if (_domain) setBaseUrl(`https://${_domain}/api`);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.floor(1500 * Math.pow(1.5, attempt - 1)),
    },
  },
});

function AuthGuard() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === "auth";
    const inTabsGroup = segments[0] === "(tabs)";
    const inRootIndex = (segments as string[]).length === 0;

    // Guests can browse home (tabs) freely; only block deep protected routes
    const isPublicRoute = inAuthGroup || inTabsGroup || inRootIndex;

    if (!user && !isPublicRoute) {
      router.replace("/auth");
    } else if (user && (inAuthGroup || inRootIndex)) {
      router.replace("/(tabs)");
    }
  }, [user, isLoading, segments]);

  return null;
}

function SuspendedScreen() {
  const { suspendedMessage, clearSuspended } = useAuth();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  return (
    <View style={{ flex: 1, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <Text style={{ fontSize: 44 }}>🚫</Text>
      </View>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#991B1B", textAlign: "center", marginBottom: 12 }}>{T("accountSuspended")}</Text>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#7F1D1D", textAlign: "center", lineHeight: 22, marginBottom: 32 }}>
        {suspendedMessage || T("accountSuspendedMsg")}
      </Text>
      <Pressable onPress={clearSuspended} style={{ backgroundColor: "#DC2626", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center" }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>{T("signOutLabel")}</Text>
      </Pressable>
    </View>
  );
}

function MaintenanceScreen() {
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  return (
    <View style={{ flex: 1, backgroundColor: "#FFF7ED", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <Text style={{ fontSize: 44 }}>🔧</Text>
      </View>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#92400E", textAlign: "center", marginBottom: 12 }}>{T("underMaintenance")}</Text>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#78350F", textAlign: "center", lineHeight: 22, marginBottom: 16 }}>
        {config.content.maintenanceMsg || T("maintenanceApology")}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF3C7", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "#B45309" }}>
          Support: {config.platform.supportPhone || config.platform.supportEmail}
        </Text>
      </View>
    </View>
  );
}

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}/api`;

function MagicLinkHandler() {
  const { login, setTwoFactorPending } = useAuth();

  useEffect(() => {
    const handleUrl = async (url: string) => {
      try {
        const parsed = new URL(url);
        const token = parsed.searchParams.get("magic_token") || parsed.searchParams.get("token");
        if (!token) return;
        if (!parsed.pathname.includes("magic-link") && !parsed.pathname.includes("auth")) return;

        const res = await fetch(`${API_BASE}/auth/magic-link/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          const errMsg: string = data.error || data.message || "";
          let userMessage: string;
          if (errMsg.toLowerCase().includes("expired") || data.code === "EXPIRED") {
            userMessage = "This magic link has expired. Please request a new login link.";
          } else if (errMsg.toLowerCase().includes("used") || data.code === "USED") {
            userMessage = "This magic link has already been used. Please request a new one.";
          } else if (errMsg.toLowerCase().includes("invalid") || data.code === "INVALID") {
            userMessage = "This magic link is invalid. Please request a new login link.";
          } else {
            userMessage = errMsg || "Invalid or expired magic link. Please request a new one.";
          }
          Alert.alert("Sign-In Failed", userMessage, [{ text: "OK" }]);
          return;
        }
        if (data.requires2FA) {
          setTwoFactorPending({ tempToken: data.tempToken, userId: data.userId });
          router.replace("/auth");
          return;
        }
        if (data.token && data.user) {
          await login(data.user as any, data.token, data.refreshToken);
          router.replace("/(tabs)");
        }
      } catch (err: any) {
        console.warn("MagicLinkHandler error:", err.message || err);
      }
    };

    const sub = Linking.addEventListener("url", (event) => handleUrl(event.url));
    Linking.getInitialURL().then(url => { if (url) handleUrl(url); });
    return () => sub.remove();
  }, []);

  return null;
}

function MisconfigScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: "#0f172a" }}>
      <Text style={{ fontSize: 48 }}>⚙️</Text>
      <Text style={{ color: "#f1f5f9", fontSize: 20, fontWeight: "700", marginTop: 16, textAlign: "center" }}>
        App Not Configured
      </Text>
      <Text style={{ color: "#94a3b8", fontSize: 14, marginTop: 10, textAlign: "center", lineHeight: 22 }}>
        {"EXPO_PUBLIC_DOMAIN is not set.\nPlease configure the environment and rebuild the app."}
      </Text>
    </View>
  );
}

function RootLayoutNav() {
  const { isSuspended, user } = useAuth();
  const { config } = usePlatformConfig();

  if (isSuspended) return <SuspendedScreen />;
  if (config.appStatus === "maintenance" && user) return <MaintenanceScreen />;

  return (
    <>
      <AuthGuard />
      <MagicLinkHandler />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index"          options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)"         options={{ headerShown: false }} />
        <Stack.Screen name="auth"           options={{ headerShown: false }} />
        <Stack.Screen name="mart/index"     options={{ headerShown: false }} />
        <Stack.Screen name="food/index"     options={{ headerShown: false }} />
        <Stack.Screen name="ride/index"     options={{ headerShown: false }} />
        <Stack.Screen name="cart/index"     options={{ headerShown: false }} />
        <Stack.Screen name="pharmacy/index" options={{ headerShown: false }} />
        <Stack.Screen name="parcel/index"   options={{ headerShown: false }} />
        <Stack.Screen name="categories/index" options={{ headerShown: false }} />
        <Stack.Screen name="order/index"    options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let webFontErrorCleanup: (() => void) | null = null;

    if (Platform.OS === "web") {
      const suppressFontRejection = (e: PromiseRejectionEvent) => {
        const msg = String(e.reason?.message || e.reason || "").toLowerCase();
        const stack = String(e.reason?.stack || "").toLowerCase();
        const isFontError =
          msg.includes("fontfaceobserver") ||
          msg.includes("fontface") ||
          msg.includes("is not loaded after waiting") ||
          (msg.includes("timeout") && (msg.includes("font") || msg.includes("nastaliq"))) ||
          stack.includes("fontfaceobserver") ||
          msg.includes("noto") ||
          msg.includes("nastaliq");
        if (isFontError) e.preventDefault();
      };
      window.addEventListener("unhandledrejection", suppressFontRejection);
      webFontErrorCleanup = () => window.removeEventListener("unhandledrejection", suppressFontRejection);
    }

    const loadAllFonts = async () => {
      const allFonts = {
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
        NotoNastaliqUrdu_400Regular,
        NotoNastaliqUrdu_500Medium,
        NotoNastaliqUrdu_600SemiBold,
        NotoNastaliqUrdu_700Bold,
      };

      try {
        if (Platform.OS === "web") {
          await Promise.race([
            Font.loadAsync(allFonts),
            new Promise<void>((resolve) => setTimeout(resolve, 3000)),
          ]);
        } else {
          await Promise.race([
            Font.loadAsync(allFonts),
            new Promise<void>((resolve) => setTimeout(resolve, 10000)),
          ]);
        }
      } catch {
      }

      if (!cancelled) {
        setReady(true);
        SplashScreen.hideAsync().catch(() => {});

        if (Platform.OS === "web") {
          setTimeout(() => {
            webFontErrorCleanup?.();
            webFontErrorCleanup = null;
          }, 5000);
        }
      }
    };

    loadAllFonts();

    return () => {
      cancelled = true;
      webFontErrorCleanup?.();
      webFontErrorCleanup = null;
    };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0047B3", alignItems: "center", justifyContent: "center", gap: 20 }}>
        <View style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          backgroundColor: "rgba(255,255,255,0.15)",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <Text style={{ fontSize: 36 }}>🛒</Text>
        </View>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  if (!_domain) {
    return <MisconfigScreen />;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <PlatformConfigProvider>
                <LanguageProvider>
                  <AuthProvider>
                    <CartProvider>
                      <ToastProvider>
                        <RootLayoutNav />
                      </ToastProvider>
                    </CartProvider>
                  </AuthProvider>
                </LanguageProvider>
              </PlatformConfigProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
