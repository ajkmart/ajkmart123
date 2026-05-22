import React from "react";
import { Text, View, type ViewStyle } from "react-native";
import { spacing } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useTypography } from "@/hooks/useTypography";

interface DividerProps {
  label?: string;
  spacing?: number;
  color?: string;
  style?: ViewStyle;
}

export function Divider({
  label,
  spacing: verticalSpacing = spacing.lg,
  color,
  style,
}: DividerProps) {
  const { colors: C } = useTheme();
  const T = useTypography();
  const lineColor = color ?? C.border;

  if (label) {
    return (
      <View style={[{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: verticalSpacing }, style]}>
        <View style={{ flex: 1, height: 1, backgroundColor: lineColor }} />
        <Text style={{ ...T.captionMedium, color: C.textMuted }}>{label}</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: lineColor }} />
      </View>
    );
  }

  return (
    <View style={[{ height: 1, width: "100%", backgroundColor: lineColor, marginVertical: verticalSpacing }, style]} />
  );
}
