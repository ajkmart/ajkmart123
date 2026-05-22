import React from "react";
import { View, Text } from "react-native";

export function MisconfigScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: "#0f172a" }}>
      <Text style={{ fontSize: 48 }}>⚙️</Text>
      <Text style={{ color: "#f1f5f9", fontSize: 20, fontWeight: "700", marginTop: 16, textAlign: "center" }}>
        App Not Configured
      </Text>
      <Text style={{ color: "#94a3b8", fontSize: 14, marginTop: 10, textAlign: "center", lineHeight: 22 }}>
        {"EXPO_PUBLIC_DOMAIN is not set.\nPlease configure the environment and rebuild the app."}
      </Text>
    </View>
  );
}

export default null;
