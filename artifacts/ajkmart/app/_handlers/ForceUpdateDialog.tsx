import React from "react";
import { Modal, View, Text, TouchableOpacity } from "react-native";
import * as Linking from "expo-linking";
import { createLogger } from "@/utils/logger";

const log = createLogger("[ForceUpdateDialog]");

export function ForceUpdateDialog({ visible, storeUrl }: { visible: boolean; storeUrl: string }) {
  const openStore = () => { if (storeUrl) Linking.openURL(storeUrl).catch((err) => { log.warn("[ForceUpdateDialog] Cannot open store URL:", err); }); };
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 360, alignItems: "center" }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🚀</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#111827", textAlign: "center", marginBottom: 10 }}>
            Update Required
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 22, marginBottom: 24 }}>
            A newer version of AJKMart is required to continue. Please update the app to access all features.
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={openStore}
            style={{ backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: "100%" }}
          >
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff", textAlign: "center" }}>
              Update Now
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default null;
