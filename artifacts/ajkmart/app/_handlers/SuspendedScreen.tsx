import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";

export function SuspendedScreen() {
  const { suspendedMessage, clearSuspended } = useAuth();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  return (
    <View style={{ flex: 1, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <Text style={{ fontSize: 44 }}>🚫</Text>
      </View>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#991B1B", textAlign: "center", marginBottom: 12 }}>
        {T("accountSuspended")}
      </Text>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#7F1D1D", textAlign: "center", lineHeight: 22, marginBottom: 32 }}>
        {suspendedMessage || T("accountSuspendedMsg")}
      </Text>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={clearSuspended}
        style={{ backgroundColor: "#DC2626", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center" }}
      >
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>
          {T("signOutLabel")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default null;
