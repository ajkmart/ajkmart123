import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Colors, { radii, shadows, typography } from "@/constants/colors";

const C = Colors.light;

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

const VARIANT_STYLES: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary: { bg: C.primary, text: "#FFFFFF" },
  secondary: { bg: C.primarySoft, text: C.primary },
  outline: { bg: "transparent", text: C.primary, border: C.primary },
  ghost: { bg: "transparent", text: C.textSecondary },
  danger: { bg: C.danger, text: "#FFFFFF" },
};

const SIZE_MAP: Record<Size, { h: number; px: number; iconSize: number }> = {
  sm: { h: 38, px: 14, iconSize: 16 },
  md: { h: 48, px: 20, iconSize: 18 },
  lg: { h: 54, px: 24, iconSize: 20 },
};

export function ActionButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = true,
}: ActionButtonProps) {
  const v = VARIANT_STYLES[variant];
  const s = SIZE_MAP[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: s.h,
          paddingHorizontal: s.px,
          backgroundColor: v.bg,
          borderRadius: radii.lg,
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
        },
        v.border ? { borderWidth: 1.5, borderColor: v.border } : null,
        fullWidth ? { width: "100%" } : null,
        variant === "primary" ? shadows.md : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <View style={styles.inner}>
          {icon && <Ionicons name={icon} size={s.iconSize} color={v.text} />}
          <Text
            style={[
              size === "sm" ? typography.buttonSmall : typography.button,
              { color: v.text },
            ]}
          >
            {label}
          </Text>
          {iconRight && <Ionicons name={iconRight} size={s.iconSize} color={v.text} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
