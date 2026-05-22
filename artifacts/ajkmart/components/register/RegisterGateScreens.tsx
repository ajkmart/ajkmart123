import React from "react";
import { Platform, View, Text, TouchableOpacity , ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { authColors as C, AuthButton } from "@/components/auth-shared";
import { s } from "./registerStyles";

interface SupportConfig {
  supportPhone?: string | null;
  supportEmail?: string | null;
  appName?: string;
  maintenanceMsg?: string | null;
}

interface LevelInfo { color: string; bg: string; icon: string; label: string; desc: string }

function SupportInfo({ supportPhone, supportEmail, label = "Need Help?" }: { supportPhone?: string | null; supportEmail?: string | null; label?: string }) {
  if (!supportPhone && !supportEmail) return null;
  return (
    <View style={{ backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, width: "100%", borderWidth: 1, borderColor: "#E5E7EB" }}>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{label}</Text>
      {supportPhone ? <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#374151" }}>{supportPhone}</Text> : null}
      {supportEmail ? <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{supportEmail}</Text> : null}
    </View>
  );
}

const gateCardStyle = { backgroundColor: "#fff", borderRadius: 24, padding: 32, width: "100%" as const, maxWidth: 360, alignItems: "center" as const, ...Platform.select({ web: { boxShadow: "0 10px 20px rgba(0,0,0,0.2)" } as object, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 20 } }) };

export function MaintenanceScreen({ config }: { config: { platform: SupportConfig; content: { maintenanceMsg?: string | null } } }) {
  return (
    <LinearGradient colors={["#1a1a2e", "#16213e"] as [string, string]} style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
      <View style={gateCardStyle}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#FEF3C7", justifyContent: "center", alignItems: "center", marginBottom: 20 }}>
          <Ionicons name="construct-outline" size={40} color="#D97706" />
        </View>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#1F2937", marginBottom: 12, textAlign: "center" }}>Under Maintenance</Text>
        <Text style={{ fontSize: 14, color: "#6B7280", lineHeight: 22, textAlign: "center", marginBottom: 20 }}>
          {config.content.maintenanceMsg || "We're performing scheduled maintenance. Back soon!"}
        </Text>
        <SupportInfo supportPhone={config.platform.supportPhone} supportEmail={config.platform.supportEmail} />
      </View>
    </LinearGradient>
  );
}

export function RegistrationClosedScreen({ config, onBack }: { config: { platform: SupportConfig }; onBack: () => void }) {
  return (
    <LinearGradient colors={["#1a1a2e", "#16213e"] as [string, string]} style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
      <View style={gateCardStyle}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#FEE2E2", justifyContent: "center", alignItems: "center", marginBottom: 20 }}>
          <Ionicons name="lock-closed-outline" size={40} color="#DC2626" />
        </View>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#1F2937", marginBottom: 12, textAlign: "center" }}>Registration Closed</Text>
        <Text style={{ fontSize: 14, color: "#6B7280", lineHeight: 22, textAlign: "center", marginBottom: 20 }}>New account registrations are currently not available. Please try again later.</Text>
        <SupportInfo supportPhone={config.platform.supportPhone} supportEmail={config.platform.supportEmail} label="Contact Support" />
        <TouchableOpacity onPress={onBack} style={{ width: "100%", backgroundColor: "#1F2937", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 16 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>← Back to Login</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

export function RegModeNoneScreen({ config, onBack }: { config: { platform: SupportConfig }; onBack: () => void }) {
  return (
    <LinearGradient colors={["#1a1a2e", "#16213e"] as [string, string]} style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
      <View style={gateCardStyle}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#FEE2E2", justifyContent: "center", alignItems: "center", marginBottom: 20 }}>
          <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
        </View>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#1F2937", marginBottom: 12, textAlign: "center" }}>Registration Unavailable</Text>
        <Text style={{ fontSize: 14, color: "#6B7280", lineHeight: 22, textAlign: "center", marginBottom: 20 }}>No registration methods are currently enabled. Please contact support.</Text>
        <SupportInfo supportPhone={config.platform.supportPhone} supportEmail={config.platform.supportEmail} label="Contact Support" />
        <TouchableOpacity onPress={onBack} style={{ width: "100%", backgroundColor: "#1F2937", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 16 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>← Back to Login</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

export function RegisterSuccessStep({ config, levelInfo, accountLevel, signupBonus, loading, onFinish }: {
  config: { platform: { appName?: string } };
  levelInfo: LevelInfo;
  accountLevel: string;
  signupBonus: number;
  loading: boolean;
  onFinish: () => void;
}) {
  return (
    <LinearGradient colors={[C.primaryDark, C.primary, C.primaryLight]} style={s.gradient}>
      <ScrollView contentContainerStyle={s.successScroll}>
        <View style={s.successCard}>
          <View style={s.successIconWrap}>
            <View style={s.successIconCircle}>
              <Ionicons name="checkmark" size={40} color="#fff" />
            </View>
          </View>
          <Text style={s.successTitle}>Registration Successful!</Text>
          <Text style={s.successSub}>Welcome to {config.platform.appName}! Your account is ready.</Text>

          <View style={[s.levelBadge, { backgroundColor: levelInfo.bg, borderColor: levelInfo.color }]}>
            <Ionicons name={levelInfo.icon as "shield-outline"} size={28} color={levelInfo.color} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[s.levelTitle, { color: levelInfo.color }]}>{levelInfo.label} Account</Text>
              <Text style={s.levelDesc}>{levelInfo.desc}</Text>
            </View>
          </View>

          {signupBonus > 0 && (
            <View style={s.bonusBanner}>
              <View style={s.bonusIconWrap}>
                <Ionicons name="gift" size={22} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.bonusTitle}>Welcome Bonus!</Text>
                <Text style={s.bonusSub}>Rs. {signupBonus} has been added to your wallet</Text>
              </View>
            </View>
          )}

          {accountLevel !== "gold" && (
            <View style={s.kycPrompt}>
              <Ionicons name="document-text-outline" size={20} color={C.primary} />
              <Text style={s.kycText}>Complete KYC verification to unlock Gold benefits and higher limits</Text>
            </View>
          )}

          <AuthButton label="Start Shopping" onPress={onFinish} loading={loading} icon="cart-outline" />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}
