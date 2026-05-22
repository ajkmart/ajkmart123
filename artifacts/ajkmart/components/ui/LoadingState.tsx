import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Colors, { typography } from "@/constants/colors";

const C = Colors.light;

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingState({ message, fullScreen = false }: LoadingStateProps) {
  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      <ActivityIndicator size="large" color={C.primary} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: C.background,
  },
  message: {
    ...typography.body,
    color: C.textMuted,
    marginTop: 16,
    textAlign: "center",
  },
});
