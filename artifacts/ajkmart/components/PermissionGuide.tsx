import * as Linking from "expo-linking";
import React from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

const C = Colors.light;

export type PermissionType =
  | "camera"
  | "gallery"
  | "location"
  | "notification"
  | "microphone";

interface PermissionConfig {
  icon: string;
  title: string;
  message: string;
}

const CONFIGS: Record<PermissionType, PermissionConfig> = {
  camera: {
    icon: "📷",
    title: "Camera Access Required",
    message: "Camera access is needed for this feature. Please enable it in your device Settings.",
  },
  gallery: {
    icon: "🖼️",
    title: "Photo Library Access Required",
    message: "Photo library access is needed for this feature. Please enable it in your device Settings.",
  },
  location: {
    icon: "📍",
    title: "Location Access Required",
    message: "Location access is needed to find nearby services. Please enable it in your device Settings.",
  },
  notification: {
    icon: "🔔",
    title: "Notifications Required",
    message: "Notification permission is needed for order updates. Please enable it in your device Settings.",
  },
  microphone: {
    icon: "🎤",
    title: "Microphone Access Required",
    message: "Microphone access is needed for this feature. Please enable it in your device Settings.",
  },
};

function openDeviceSettings() {
  if (Platform.OS === "ios") {
    Linking.openURL("app-settings:").catch(() => Linking.openSettings());
  } else {
    Linking.openSettings();
  }
}

export function showPermissionGuide(type: PermissionType, customMessage?: string): void {
  const cfg = CONFIGS[type];
  Alert.alert(
    cfg.title,
    customMessage ?? cfg.message,
    [
      { text: "Not Now", style: "cancel" },
      { text: "Open Settings", onPress: openDeviceSettings },
    ],
    { cancelable: true },
  );
}

interface PermissionGuideProps {
  visible: boolean;
  type: PermissionType;
  customMessage?: string;
  onClose: () => void;
}

export function PermissionGuide({ visible, type, customMessage, onClose }: PermissionGuideProps) {
  const insets = useSafeAreaInsets();
  const cfg = CONFIGS[type];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>{cfg.icon}</Text>
          </View>
          <Text style={styles.title}>{cfg.title}</Text>
          <Text style={styles.message}>{customMessage ?? cfg.message}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => { onClose(); openDeviceSettings(); }}>
            <Text style={styles.primaryBtnText}>Open Settings</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onClose}>
            <Text style={styles.secondaryBtnText}>Not Now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    backgroundColor: C.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: "center",
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  iconText: { fontSize: 36 },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: C.text,
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: C.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  primaryBtn: {
    width: "100%",
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  secondaryBtn: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#64748B",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
});
