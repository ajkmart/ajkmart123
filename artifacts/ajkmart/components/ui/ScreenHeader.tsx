import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors, { spacing, typography, shadows } from "@/constants/colors";

const C = Colors.light;

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightElement?: React.ReactNode;
  transparent?: boolean;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  rightElement,
  transparent = false,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: topPad + 12 },
        !transparent && styles.solid,
      ]}
    >
      <View style={styles.row}>
        {onBack && (
          <Pressable onPress={onBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={transparent ? "#fff" : C.text} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, transparent && { color: "#fff" }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.subtitle, transparent && { color: "rgba(255,255,255,0.8)" }]}>
              {subtitle}
            </Text>
          )}
        </View>
        {rightElement}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  solid: {
    backgroundColor: C.surface,
    ...shadows.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(241,245,249,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...typography.h3, color: C.text },
  subtitle: { ...typography.caption, color: C.textMuted, marginTop: 2 },
});
