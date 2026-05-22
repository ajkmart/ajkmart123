import React from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Colors, { radii, shadows } from "@/constants/colors";

const C = Colors.light;

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  variant?: "elevated" | "outlined" | "filled";
  padding?: number;
}

export function Card({
  children,
  style,
  onPress,
  variant = "elevated",
  padding = 16,
}: CardProps) {
  const cardStyle: ViewStyle[] = [
    styles.base,
    { padding },
    variant === "elevated" && styles.elevated,
    variant === "outlined" && styles.outlined,
    variant === "filled" && styles.filled,
    style as ViewStyle,
  ].filter(Boolean) as ViewStyle[];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [...cardStyle, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.xl,
    backgroundColor: C.surface,
    overflow: "hidden",
  },
  elevated: {
    ...shadows.md,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.5)",
  },
  outlined: {
    borderWidth: 1.5,
    borderColor: C.border,
  },
  filled: {
    backgroundColor: C.surfaceSecondary,
  },
});
