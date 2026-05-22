import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Colors, { radii, spacing, typography } from "@/constants/colors";
import { ActionButton } from "./ActionButton";

const C = Colors.light;

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  emoji,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        {emoji ? (
          <Text style={styles.emoji}>{emoji}</Text>
        ) : icon ? (
          <Ionicons name={icon} size={44} color={C.textMuted} />
        ) : null}
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <View style={{ marginTop: spacing.lg, width: "100%", maxWidth: 200 }}>
          <ActionButton label={actionLabel} onPress={onAction} size="sm" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: spacing.xxxl,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  emoji: { fontSize: 44 },
  title: { ...typography.h3, color: C.text, textAlign: "center", marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: C.textMuted, textAlign: "center", lineHeight: 21 },
});
