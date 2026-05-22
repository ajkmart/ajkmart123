import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastCtx {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

const COLORS: Record<ToastType, { bg: string; icon: string; text: string }> = {
  success: { bg: "#065F46", icon: "checkmark-circle",     text: "#ffffff" },
  error:   { bg: "#991B1B", icon: "alert-circle",         text: "#ffffff" },
  info:    { bg: "#1E40AF", icon: "information-circle",   text: "#ffffff" },
  warning: { bg: "#92400E", icon: "warning",              text: "#ffffff" },
};

function ToastBanner({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const c = COLORS[item.type];

  React.useEffect(() => {
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, bounciness: 6 }),
      Animated.delay(2800),
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(onDone);
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] });
  const opacity = anim;

  return (
    <Animated.View style={[ts.banner, { backgroundColor: c.bg, opacity, transform: [{ translateY }], top: Platform.OS === "web" ? 72 : insets.top + 10 }]}>
      <Ionicons name={c.icon as any} size={20} color={c.text} />
      <Text style={[ts.bannerTxt, { color: c.text }]} numberOfLines={3}>{item.message}</Text>
      <Pressable onPress={onDone} style={ts.closeBtn}>
        <Ionicons name="close" size={16} color={c.text} />
      </Pressable>
    </Animated.View>
  );
}

let _id = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++_id;
    setToasts(prev => [...prev.slice(-1), { id, message, type }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.map(t => (
        <ToastBanner key={t.id} item={t} onDone={() => remove(t.id)} />
      ))}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const ts = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    elevation: 10,
    ...Platform.select({
      web: { boxShadow: "0 4px 12px rgba(0,0,0,0.25)" },
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
    }),
  },
  bannerTxt: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    lineHeight: 20,
  },
  closeBtn: {
    padding: 2,
  },
});
