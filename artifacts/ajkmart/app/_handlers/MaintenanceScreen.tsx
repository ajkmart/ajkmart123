import React from "react";
import { View, Text } from "react-native";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";

export function MaintenanceScreen() {
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#FFF7ED",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <View
        style={{
          width: 90,
          height: 90,
          borderRadius: 45,
          backgroundColor: "#FEF3C7",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
        }}
      >
        <Text style={{ fontSize: 44 }}>🔧</Text>
      </View>
      <Text
        style={{
          fontFamily: "Inter_700Bold",
          fontSize: 22,
          color: "#92400E",
          textAlign: "center",
          marginBottom: 12,
        }}
      >
        {T("underMaintenance")}
      </Text>
      <Text
        style={{
          fontFamily: "Inter_400Regular",
          fontSize: 14,
          color: "#78350F",
          textAlign: "center",
          lineHeight: 22,
          marginBottom: 16,
        }}
      >
        {config.content.maintenanceMsg || T("maintenanceApology")}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: "#FEF3C7",
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 8,
        }}
      >
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 12,
            color: "#B45309",
          }}
        >
          Support:{" "}
          {config.platform.supportPhone || config.platform.supportEmail}
        </Text>
      </View>
    </View>
  );
}

export default null;
