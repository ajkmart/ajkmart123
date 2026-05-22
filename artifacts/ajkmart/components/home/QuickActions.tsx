import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { spacing } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { usePerformance } from "@/context/PerformanceContext";
import { tDual } from "@workspace/i18n";

const H_PAD = spacing.lg;

export function GuestSignInStrip() {
  const { language } = useLanguage();
  const perf = usePerformance();
  const T = (key: Parameters<typeof tDual>[0]) => tDual(key, language);
  return (
    <Link href="/auth" asChild>
      <TouchableOpacity activeOpacity={0.8} style={gi.wrap} accessibilityRole="button">
        {perf.useGradients ? (
          <LinearGradient colors={["#0047B3", "#0066FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={gi.card}>
            <View style={gi.iconWrap}>
              <Ionicons name="person-circle-outline" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={gi.title}>{T("signInRegister")}</Text>
              <Text style={gi.sub}>{T("signInPlaceOrders")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        ) : (
          <View style={[gi.card, { backgroundColor: "#0047B3" }]}>
            <View style={gi.iconWrap}>
              <Ionicons name="person-circle-outline" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={gi.title}>{T("signInRegister")}</Text>
              <Text style={gi.sub}>{T("signInPlaceOrders")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
          </View>
        )}
      </TouchableOpacity>
    </Link>
  );
}

const gi = StyleSheet.create({
  wrap: { marginHorizontal: H_PAD, marginTop: 6, borderRadius: 14, overflow: "hidden" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14 },
  iconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: Font.bold, fontSize: 14, color: "#fff" },
  sub: { fontFamily: Font.regular, fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 1 },
});
