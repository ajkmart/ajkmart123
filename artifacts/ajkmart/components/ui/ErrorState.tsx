import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { spacing } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useTypography } from "@/hooks/useTypography";
import { ActionButton } from "./ActionButton";

interface ErrorStateProps {
  title?: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  subtitle = "Please try again later.",
  icon = "alert-circle-outline",
  emoji,
  retryLabel = "Try Again",
  onRetry,
}: ErrorStateProps) {
  const { colors: C } = useTheme();
  const T = useTypography();

  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 60, paddingHorizontal: spacing.xxxl }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: C.dangerSoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl }}>
        {emoji ? (
          <Text style={{ fontSize: 44 }}>{emoji}</Text>
        ) : (
          <Ionicons name={icon} size={44} color={C.danger} />
        )}
      </View>
      <Text style={{ ...T.h3, color: C.text, textAlign: "center", marginBottom: spacing.sm }}>{title}</Text>
      {subtitle && <Text style={{ ...T.body, color: C.textMuted, textAlign: "center", lineHeight: 21 }}>{subtitle}</Text>}
      {onRetry && (
        <View style={{ marginTop: spacing.xl }}>
          <ActionButton
            label={retryLabel}
            onPress={onRetry}
            variant="outline"
            size="sm"
            icon="refresh-outline"
            fullWidth={false}
          />
        </View>
      )}
    </View>
  );
}
