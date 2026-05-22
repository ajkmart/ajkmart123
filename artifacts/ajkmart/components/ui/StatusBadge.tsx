import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors, { radii, typography } from "@/constants/colors";

const C = Colors.light;

type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

const VARIANT_MAP: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: C.successSoft, text: C.success },
  warning: { bg: C.warningSoft, text: "#B45309" },
  danger: { bg: C.dangerSoft, text: C.danger },
  info: { bg: C.primarySoft, text: C.primary },
  neutral: { bg: "#F1F5F9", text: C.textSecondary },
};

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: "sm" | "md";
}

export function StatusBadge({ label, variant = "neutral", icon, size = "sm" }: StatusBadgeProps) {
  const v = VARIANT_MAP[variant];
  const isSm = size === "sm";

  return (
    <View style={[styles.base, { backgroundColor: v.bg, paddingHorizontal: isSm ? 8 : 10, paddingVertical: isSm ? 3 : 5 }]}>
      {icon && <Ionicons name={icon} size={isSm ? 11 : 13} color={v.text} />}
      <Text style={[isSm ? typography.small : typography.captionMedium, { color: v.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radii.full,
    alignSelf: "flex-start",
  },
});
