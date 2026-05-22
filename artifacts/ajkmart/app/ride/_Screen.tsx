import React, { useState, useEffect, useCallback } from "react";
import { View, TouchableOpacity, Text, Platform } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useTheme } from "@/context/ThemeContext";
import { T as Typ, Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { RideBookingForm } from "@/components/ride/RideBookingForm";
import { RideTracker } from "@/components/ride/RideTracker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getRide, type Ride } from "@workspace/api-client-react";
import { useApiCall } from "@/hooks/useApiCall";


function RideScreenInner() {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const topPad = Math.max(insets.top, 12);
  const { user, token } = useAuth();
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const rideCfg = config.rides;
  const ridesEnabled = config.features.rides;
  const inMaintenance = config.appStatus === "maintenance";
  const { rideId: urlRideId, prefillPickup, prefillDrop, prefillType } = useLocalSearchParams<{ rideId?: string; prefillPickup?: string; prefillDrop?: string; prefillType?: string }>();

  const [booked, setBooked] = useState<{ id: string; type?: string; status?: string; fare?: number; isBargaining?: boolean; effectiveFare?: number } | null>(null);

  const fetchRideFn = useCallback(async () => {
    const data = await getRide(urlRideId!) as Ride;
    return { id: urlRideId!, type: data.type ?? "bike" };
  }, [urlRideId]);

  const rideLoader = useApiCall(fetchRideFn, {
    showErrorToast: false,
    onSuccess: (result) => setBooked(result),
  });

  useEffect(() => {
    if (!urlRideId || !token) return;
    rideLoader.execute();
  }, [urlRideId, token]);

  if (inMaintenance) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.background,
          justifyContent: "center",
          alignItems: "center",
          padding: 32,
        }}
      >
        <View
          style={{
            backgroundColor: C.surface,
            borderRadius: 24,
            padding: 32,
            alignItems: "center",
            width: "100%",
            borderWidth: 1,
            borderColor: C.amberSoft,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: C.amberSoft,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons name="construct-outline" size={32} color={C.amber} />
          </View>
          <Text
            style={{
              fontFamily: Font.bold,
              fontSize: 20,
              color: C.amber,
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            {T("underMaintenance")}
          </Text>
          <Text
            style={{
              fontFamily: Font.regular,
              fontSize: 14,
              color: C.textMuted,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            {config.content.maintenanceMsg}
          </Text>
        </View>
      </View>
    );
  }

  if (!ridesEnabled) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.background,
          justifyContent: "center",
          alignItems: "center",
          padding: 32,
        }}
      >
        <TouchableOpacity activeOpacity={0.7}
          onPress={goBack}
          style={{ position: "absolute", top: topPad + 12, left: 16 }}
        >
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View
          style={{
            backgroundColor: C.surface,
            borderRadius: 24,
            padding: 32,
            alignItems: "center",
            width: "100%",
            borderWidth: 1,
            borderColor: C.redSoft,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: C.redSoft,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons
              name="close-circle-outline"
              size={32}
              color={C.redBright}
            />
          </View>
          <Text
            style={{
              fontFamily: Font.bold,
              fontSize: 20,
              color: C.redBright,
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            {T("serviceUnavailable")}
          </Text>
          <Text
            style={{
              fontFamily: Font.regular,
              fontSize: 14,
              color: C.textMuted,
              textAlign: "center",
              lineHeight: 20,
              marginBottom: 20,
            }}
          >
            {T("rideUnavailableMsg")}
          </Text>
          <TouchableOpacity activeOpacity={0.7}
            style={{
              width: "100%",
              alignItems: "center",
              backgroundColor: C.redBg,
              borderRadius: 14,
              paddingVertical: 14,
            }}
            onPress={goBack}
          >
            <Text
              style={{
                fontFamily: Font.bold,
                fontSize: 15,
                color: C.redBright,
              }}
            >
              {T("backToHome")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (rideLoader.error) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.background,
          justifyContent: "center",
          alignItems: "center",
          padding: 32,
        }}
      >
        <View
          style={{
            backgroundColor: C.surface,
            borderRadius: 24,
            padding: 32,
            alignItems: "center",
            width: "100%",
            borderWidth: 1,
            borderColor: C.redSoft,
          }}
        >
          <Ionicons name="alert-circle-outline" size={48} color={C.redBright} style={{ marginBottom: 16 }} />
          <Text
            style={{
              fontFamily: Font.bold,
              fontSize: 18,
              color: C.redBright,
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            {T("rideLoadErrorTitle")}
          </Text>
          <Text
            style={{
              fontFamily: Font.regular,
              fontSize: 14,
              color: C.textMuted,
              textAlign: "center",
              lineHeight: 20,
              marginBottom: 20,
            }}
          >
            {T("rideLoadErrorMsg")}
          </Text>
          <TouchableOpacity activeOpacity={0.7}
            style={{
              width: "100%",
              alignItems: "center",
              backgroundColor: C.primary,
              borderRadius: 14,
              paddingVertical: 14,
              marginBottom: 10,
            }}
            onPress={() => { rideLoader.retry(); }}
          >
            <Text style={{ ...Typ.button, fontFamily: Font.bold, color: C.textInverse }}>
              {T("tryAgain")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7}
            style={{
              width: "100%",
              alignItems: "center",
              backgroundColor: C.redBg,
              borderRadius: 14,
              paddingVertical: 14,
            }}
            onPress={goBack}
          >
            <Text style={{ ...Typ.button, fontFamily: Font.bold, color: C.redBright }}>
              {T("backToHome")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (booked) {
    return (
      <RideTracker
        rideId={booked.id}
        initialType={booked.type ?? "bike"}
        userId={user?.id ?? ""}
        token={token}
        cancellationFee={rideCfg.cancellationFee !== undefined && rideCfg.cancellationFee !== null ? rideCfg.cancellationFee : 30}
        onReset={() => setBooked(null)}
      />
    );
  }

  return <RideBookingForm onBooked={(ride) => setBooked(ride)} prefillPickup={prefillPickup} prefillDrop={prefillDrop} prefillType={prefillType} />;
}

export default RideScreenInner;
