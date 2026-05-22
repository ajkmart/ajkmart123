import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type RelativePathString } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";

import Colors, { spacing, shadows } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useTheme } from "@/context/ThemeContext";
import { usePerformance } from "@/context/PerformanceContext";
import { useToast } from "@/context/ToastContext";
import type { ServiceDefinition } from "@/constants/serviceRegistry";

const H_PAD = spacing.lg;

type ViewMode = "grid" | "list";
const SVC_VIEW_KEY = "svc_view_mode";

export type ServiceItemProps = ServiceDefinition & { isEnabled?: boolean };

const shortLabel: Record<string, string> = {
  mart: "Mart", food: "Food", rides: "Ride", pharmacy: "Pharma", parcel: "Parcel",
};

function makeSgStyles(C: typeof Colors.light, itemW: number) {
  return StyleSheet.create({
    wrap: { paddingHorizontal: H_PAD, paddingTop: 12, paddingBottom: 4 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    headerTitle: { fontFamily: Font.semiBold, fontSize: 13, color: C.textSecondary },
    toggleRow: { flexDirection: "row", gap: 4, backgroundColor: C.surfaceSecondary, borderRadius: 8, padding: 2 },
    toggleBtn: { width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" },
    toggleBtnActive: { backgroundColor: C.primary },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 0 },
    item: {
      alignItems: "center", gap: 6,
      width: itemW,
      paddingVertical: 8,
    },
    iconWrap: { position: "relative" },
    circle: {
      width: 48, height: 48, borderRadius: 16,
      alignItems: "center", justifyContent: "center",
      ...shadows.sm,
    },
    circleDisabled: { opacity: 0.75 },
    label: { fontFamily: Font.semiBold, color: C.text, fontSize: 11, textAlign: "center" },
    labelDisabled: { color: C.textMuted },
    comingSoonBadge: {
      position: "absolute",
      top: -5,
      right: -8,
      backgroundColor: "#FF9500",
      borderRadius: 6,
      paddingHorizontal: 4,
      paddingVertical: 1,
      zIndex: 1,
    },
    comingSoonText: {
      fontFamily: Font.bold,
      fontSize: 7,
      color: "#fff",
      letterSpacing: 0.2,
    },
  });
}

function makeSlStyles(C: typeof Colors.light) {
  return StyleSheet.create({
    list: { gap: 6 },
    row: {
      flexDirection: "row", alignItems: "center", gap: 14,
      backgroundColor: C.surface, borderRadius: 14,
      paddingHorizontal: 14, paddingVertical: 12,
      borderWidth: 1, borderColor: C.borderLight,
      ...shadows.sm,
    },
    rowDisabled: { opacity: 0.6 },
    circle: {
      width: 44, height: 44, borderRadius: 14,
      alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    },
    textWrap: { flex: 1 },
    name: { fontFamily: Font.semiBold, fontSize: 14, color: C.text, marginBottom: 2 },
    nameDisabled: { color: C.textMuted },
    desc: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted },
    comingSoonPill: {
      backgroundColor: "#FF9500",
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    comingSoonPillText: {
      fontFamily: Font.semiBold,
      fontSize: 9,
      color: "#fff",
    },
  });
}

function ServiceGridView({ services, sg }: { services: ServiceItemProps[]; sg: ReturnType<typeof makeSgStyles> }) {
  const { colors: C } = useTheme();
  const perf = usePerformance();
  const { showToast } = useToast();
  return (
    <View style={sg.grid}>
      {services.map((svc) => {
        const label = shortLabel[svc.key] ?? svc.label;
        const href = String(svc.route) as RelativePathString;
        const disabled = svc.isEnabled === false;
        return (
          <TouchableOpacity
            key={svc.key}
            activeOpacity={disabled ? 0.6 : 0.7}
            onPress={() => {
              if (disabled) {
                showToast(`${label} — Coming Soon`, "info");
                return;
              }
              router.push(href);
            }}
            style={[sg.item]}
            accessibilityRole="button"
            accessibilityLabel={disabled ? `${label} — Coming Soon` : label}
            accessibilityHint={disabled ? "This service is coming soon" : `Tap to open ${label}`}
          >
            <View style={sg.iconWrap}>
              {perf.useGradients ? (
                <LinearGradient
                  colors={disabled ? ["#C8C8C8", "#ADADAD"] as [string, string] : svc.iconGradient as [string, string]}
                  style={[sg.circle, disabled && sg.circleDisabled]}
                >
                  <Ionicons name={svc.iconFocused} size={22} color={disabled ? "#888" : "#fff"} />
                </LinearGradient>
              ) : (
                <View style={[sg.circle, { backgroundColor: disabled ? "#C8C8C8" : svc.iconGradient[0] }, disabled && sg.circleDisabled]}>
                  <Ionicons name={svc.iconFocused} size={22} color={disabled ? "#888" : "#fff"} />
                </View>
              )}
              {disabled && (
                <View style={sg.comingSoonBadge}>
                  <Text style={sg.comingSoonText}>Soon</Text>
                </View>
              )}
            </View>
            <Text style={[sg.label, disabled && sg.labelDisabled]} numberOfLines={1}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ServiceListView({ services, sl }: { services: ServiceItemProps[]; sl: ReturnType<typeof makeSlStyles> }) {
  const { colors: C } = useTheme();
  const perf = usePerformance();
  const { showToast } = useToast();
  return (
    <View style={sl.list}>
      {services.map((svc) => {
        const label = shortLabel[svc.key] ?? svc.label;
        const href = String(svc.route) as RelativePathString;
        const disabled = svc.isEnabled === false;
        return (
          <TouchableOpacity
            key={svc.key}
            activeOpacity={disabled ? 0.6 : 0.7}
            onPress={() => {
              if (disabled) {
                showToast(`${label} — Coming Soon`, "info");
                return;
              }
              router.push(href);
            }}
            style={[sl.row, disabled && sl.rowDisabled]}
            accessibilityRole="button"
            accessibilityLabel={disabled ? `${label} — Coming Soon` : label}
            accessibilityHint={disabled ? "This service is coming soon" : `Tap to open ${label}`}
          >
            {perf.useGradients ? (
              <LinearGradient
                colors={disabled ? ["#C8C8C8", "#ADADAD"] as [string, string] : svc.iconGradient as [string, string]}
                style={sl.circle}
              >
                <Ionicons name={svc.iconFocused} size={20} color={disabled ? "#888" : "#fff"} />
              </LinearGradient>
            ) : (
              <View style={[sl.circle, { backgroundColor: disabled ? "#C8C8C8" : svc.iconGradient[0] }]}>
                <Ionicons name={svc.iconFocused} size={20} color={disabled ? "#888" : "#fff"} />
              </View>
            )}
            <View style={sl.textWrap}>
              <Text style={[sl.name, disabled && sl.nameDisabled]}>{label}</Text>
              <Text style={sl.desc} numberOfLines={1}>
                {disabled ? "Coming Soon" : svc.description}
              </Text>
            </View>
            {disabled ? (
              <View style={sl.comingSoonPill}>
                <Text style={sl.comingSoonPillText}>Coming Soon</Text>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ServiceSection({ services, isGuest }: {
  services: ServiceItemProps[];
  isGuest: boolean;
}) {
  const { colors: C } = useTheme();
  const { width: winW } = useWindowDimensions();
  const effectiveW = Math.min(winW, Platform.OS === "web" ? 430 : winW);
  const itemW = (effectiveW - H_PAD * 2) / 5;

  const sg = useMemo(() => makeSgStyles(C, itemW), [C, itemW]);
  const sl = useMemo(() => makeSlStyles(C), [C]);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    // eslint-disable-next-line ajk-local/no-silent-catch -- preference not yet saved; defaults to grid
    AsyncStorage.getItem(SVC_VIEW_KEY).then((v) => {
      if (v === "list" || v === "grid") setViewMode(v);
    }).catch(() => {
      // no-op: preference not yet saved
    });
  }, []);

  const handleToggleView = async (mode: ViewMode) => {
    setViewMode(mode);
    try {
      await AsyncStorage.setItem(SVC_VIEW_KEY, mode);
    // eslint-disable-next-line ajk-local/no-silent-catch -- persisting view preference is non-critical
    } catch {
      // no-op: non-critical preference
    }
  };

  return (
    <View style={sg.wrap}>
      <View style={sg.header}>
        <Text style={sg.headerTitle}>Services</Text>
        <View style={sg.toggleRow}>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => handleToggleView("grid")}
            style={[sg.toggleBtn, viewMode === "grid" && sg.toggleBtnActive]}
            accessibilityRole="button"
            accessibilityLabel="Grid view"
            accessibilityHint="Switch services to grid layout"
          >
            <Ionicons name="grid" size={14} color={viewMode === "grid" ? "#fff" : C.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => handleToggleView("list")}
            style={[sg.toggleBtn, viewMode === "list" && sg.toggleBtnActive]}
            accessibilityRole="button"
            accessibilityLabel="List view"
            accessibilityHint="Switch services to list layout"
          >
            <Ionicons name="list" size={16} color={viewMode === "list" ? "#fff" : C.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
      {viewMode === "grid"
        ? <ServiceGridView services={services} sg={sg} />
        : <ServiceListView services={services} sl={sl} />
      }
    </View>
  );
}
