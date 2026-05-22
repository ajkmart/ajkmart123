import React, { useEffect, useRef, useState } from "react";
import { Platform, TouchableOpacity, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DISMISSED_KEY = "ajkmart_pwa_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // eslint-disable-next-line ajk-local/no-silent-catch -- PWA install prompt is a progressive enhancement; failure on non-PWA contexts is acceptable
    AsyncStorage.getItem(DISMISSED_KEY).then((v) => {
      if (v === "1") return;

      const ua = navigator.userAgent.toLowerCase();
      const iosDevice = /iphone|ipad|ipod/.test(ua);
      setIsIOS(iosDevice);

      if (iosDevice) {
        setVisible(true);
        return;
      }

      const onPrompt = (e: Event) => {
        e.preventDefault();
        deferredPrompt.current = e as BeforeInstallPromptEvent;
        setVisible(true);
      };
      window.addEventListener("beforeinstallprompt", onPrompt);

      // If beforeinstallprompt never fires within 5 s (sandboxed preview,
      // already-installed, or unsupported browser) keep the banner hidden.
      const timeout = setTimeout(() => {
        if (!deferredPrompt.current) setVisible(false);
      }, 5000);

      return () => {
        window.removeEventListener("beforeinstallprompt", onPrompt);
        clearTimeout(timeout);
      };
    }).catch(() => {});
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt.current) return;
    try {
      await deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      if (outcome === "accepted") dismiss();
    } catch {
      // Prompt unavailable (sandboxed iframe or event already consumed) — hide gracefully.
      dismiss();
    }
    deferredPrompt.current = null;
  };

  const dismiss = () => {
    setVisible(false);
    // eslint-disable-next-line ajk-local/no-silent-catch -- dismiss preference write failure is non-critical; banner may reappear on next session
    AsyncStorage.setItem(DISMISSED_KEY, "1").catch(() => {});
  };

  if (!visible || Platform.OS !== "web") return null;

  return (
    <View style={s.wrapper} accessibilityRole="header">
      <View style={s.left}>
        <View style={s.iconBox}>
          <Text style={{ fontSize: 20 }}>🛒</Text>
        </View>
        <View style={s.textWrap}>
          <Text style={s.title}>Install AJKMart</Text>
          <Text style={s.subtitle} numberOfLines={1}>
            {isIOS ? "Share → Add to Home Screen" : "Quick access & works offline"}
          </Text>
        </View>
      </View>
      <View style={s.actions}>
        {!isIOS && (
          <TouchableOpacity activeOpacity={0.7} style={s.installBtn} onPress={handleInstall} accessibilityRole="button">
            <Text style={s.installTxt}>Install</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity activeOpacity={0.7} style={s.closeBtn} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0047B3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
    zIndex: 9999,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: { flex: 1 },
  title: { color: "#fff", fontSize: 13, fontWeight: "700" },
  subtitle: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  installBtn: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  installTxt: { color: "#0047B3", fontSize: 13, fontWeight: "700" },
  closeBtn: { padding: 6 },
});
