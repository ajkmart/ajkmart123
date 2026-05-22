import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { SERVICE_REGISTRY, type ServiceKey } from "@/constants/serviceRegistry";

export type { ServiceKey };

export function useServiceEnabled(serviceKey: ServiceKey): boolean {
  const { config } = usePlatformConfig();
  return config.features[serviceKey] ?? false;
}

function ServiceUnavailableScreen({ serviceKey }: { serviceKey: ServiceKey }) {
  const insets = useSafeAreaInsets();
  const serviceLabel = SERVICE_REGISTRY[serviceKey]?.label ?? serviceKey;

  return (
    <View style={[s.root, { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 20 }]}>
      <Pressable onPress={() => router.back()} style={s.backBtn}>
        <Ionicons name="arrow-back" size={22} color="#475569" />
      </Pressable>

      <View style={s.content}>
        <View style={s.iconWrap}>
          <Ionicons name="time-outline" size={56} color="#94A3B8" />
        </View>
        <Text style={s.title}>Not Available Yet</Text>
        <Text style={s.desc}>
          {serviceLabel} is not yet available in your area.{"\n"}We'll notify you when it launches!
        </Text>
        <Pressable onPress={() => router.replace("/")} style={s.homeBtn}>
          <Ionicons name="home-outline" size={18} color="#fff" />
          <Text style={s.homeBtnTxt}>Go to Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function withServiceGuard<P extends object>(
  serviceKey: ServiceKey,
  WrappedComponent: React.ComponentType<P>,
) {
  return function GuardedScreen(props: P) {
    const enabled = useServiceEnabled(serviceKey);
    if (!enabled) return <ServiceUnavailableScreen serviceKey={serviceKey} />;
    return <WrappedComponent {...props} />;
  };
}

export { ServiceUnavailableScreen };

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  backBtn: { marginLeft: 16, width: 40, height: 40, borderRadius: 12, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, marginTop: -40 },
  iconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#0F172A", marginBottom: 12, textAlign: "center" },
  desc: { fontFamily: "Inter_400Regular", fontSize: 15, color: "#64748B", textAlign: "center", lineHeight: 22, marginBottom: 28 },
  homeBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1A56DB", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  homeBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
});
