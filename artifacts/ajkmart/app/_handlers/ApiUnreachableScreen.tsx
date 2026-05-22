import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from "react-native";

export function ApiUnreachableScreen({ url, onRetry, retrying }: { url: string; onRetry: () => void; retrying: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: "#0f172a" }}>
      <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: "rgba(239,68,68,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <Text style={{ fontSize: 44 }}>⚠️</Text>
      </View>
      <Text style={{ color: "#f1f5f9", fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 12 }}>
        Cannot Reach Server
      </Text>
      <Text style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 8 }}>
        AJKMart could not connect to the API server. Please check your connection and try again.
      </Text>
      <Text style={{ color: "#64748b", fontSize: 11, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", textAlign: "center", marginBottom: 32, paddingHorizontal: 8 }}>
        {url}
      </Text>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onRetry}
        disabled={retrying}
        style={{ backgroundColor: retrying ? "#3b82f688" : "#3b82f6", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center", width: "100%" }}
      >
        {retrying ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Retry Connection</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default null;
