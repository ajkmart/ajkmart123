/**
 * Overlay.tsx — ajkmart (Expo / React Native)
 *
 * Full-screen overlay screens for customer auth state transitions.
 * React Native implementation using View/Text/TouchableOpacity/StyleSheet.
 *
 * All colors come from useTheme() so they stay in sync with customerTheme.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./ThemeContext";

/* ── MaintenanceOverlay ────────────────────────────────────────────────── */
export function MaintenanceOverlay({
  message,
  supportPhone,
  supportEmail,
}: {
  message?: string;
  supportPhone?: string;
  supportEmail?: string;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.shell, { backgroundColor: theme.background, paddingTop: insets.top + 24 }]}>
      <View style={[styles.card, { borderColor: theme.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: `${theme.primary}18`, borderColor: `${theme.primary}40` }]}>
          <Text style={{ fontSize: 28 }}>🔧</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Under Maintenance</Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>
          {message ?? "We're making improvements to serve you better. Back shortly!"}
        </Text>
        {(supportPhone || supportEmail) && (
          <View style={[styles.supportBox, { backgroundColor: `${theme.primary}08`, borderColor: `${theme.primary}25` }]}>
            <Text style={[styles.supportLabel, { color: theme.primary }]}>NEED HELP?</Text>
            {supportPhone && <Text style={[styles.supportText, { color: theme.text }]}>📞 {supportPhone}</Text>}
            {supportEmail && <Text style={[styles.supportEmail, { color: theme.textMuted }]}>{supportEmail}</Text>}
          </View>
        )}
      </View>
    </View>
  );
}

/* ── PendingOverlay ────────────────────────────────────────────────────── */
export function PendingOverlay({
  onBack,
}: {
  onBack?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.shell, { backgroundColor: theme.background, paddingTop: insets.top + 24 }]}>
      <View style={[styles.card, { borderColor: theme.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: `${theme.primary}18`, borderColor: `${theme.primary}40` }]}>
          <Text style={{ fontSize: 28 }}>⏱</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Under Review</Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>
          Your account is being reviewed by our team. You'll be notified once approved.
        </Text>
        {onBack && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.primary }]}
            onPress={onBack}
            activeOpacity={0.85}
          >
            <Text style={[styles.btnText, { color: theme.surface }]}>Back to Login</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/* ── RejectedOverlay ───────────────────────────────────────────────────── */
export function RejectedOverlay({
  reason,
  onBack,
}: {
  reason?: string | null;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <View style={[styles.shell, { backgroundColor: theme.background, paddingTop: insets.top + 24 }]}>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.35)" }]}>
          <Text style={{ fontSize: 28 }}>❌</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Not Approved</Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>
          Your application could not be approved at this time.
        </Text>
        {reason && (
          <View style={[styles.reasonBox, { backgroundColor: theme.rejectedOverlay, borderColor: "rgba(239,68,68,0.3)" }]}>
            <Text style={[styles.reasonText, { color: theme.primary }]}>{reason}</Text>
          </View>
        )}
        {onBack && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.rejectedOverlay, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" }]}
            onPress={onBack}
            activeOpacity={0.85}
          >
            <Text style={[styles.btnText, { color: theme.primary }]}>Back to Login</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 10,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 20,
  },
  supportBox: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 4,
  },
  supportLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  supportText: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  supportEmail: {
    fontSize: 13,
  },
  btn: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  reasonBox: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  reasonText: {
    fontSize: 13,
    lineHeight: 20,
  },
});
