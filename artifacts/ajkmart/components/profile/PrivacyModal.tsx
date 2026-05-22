import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Linking, Modal,
  ScrollView, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { createLogger } from "@/utils/logger";
import { Ionicons } from "@expo/vector-icons";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { usePlatformConfig, isMethodEnabled } from "@/context/PlatformConfigContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { LANGUAGE_OPTIONS, type Language } from "@workspace/i18n";
import { T as Typ } from "@/constants/typography";
import Accordion from "@/components/Accordion";
import {
  spacing, radii, typography, Font,
  API, unwrapApiResponse,
  getErrorMessage,
  getSharedStyles,
} from "./shared";
import { DeleteAccountRow } from "./DeleteAccountRow";
const log = createLogger("[PrivacyModal]");

export function PrivacyModal({ visible, userId, token, onClose }: { visible: boolean; userId: string; token?: string; onClose: () => void }) {
  const { colors: C } = useTheme();
  const { modalHdr, primaryBtn, privRow, secCard, otpStyle, errStyle, btnStyles } = useMemo(() => getSharedStyles(C), [C]);
  const { showToast } = useToast();
  const { biometricEnabled, setBiometricEnabled, user, updateUser, logout } = useAuth();
  const { config } = usePlatformConfig();
  const { language: currentLang, setLanguage, loading: langLoading } = useLanguage();
  const [cfg, setCfg] = useState<Record<string, boolean>>({});
  const cfgRef = React.useRef<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const authHdrs: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFASecret, setTwoFASecret] = useState("");
  const [twoFAUri, setTwoFAUri] = useState("");
  const [twoFAQR, setTwoFAQR] = useState("");
  const [twoFACode, setTwoFACode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAError, setTwoFAError] = useState("");
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [exportingData, setExportingData] = useState(false);
  const [exportCooldown, setExportCooldown] = useState(0);
  const exportCooldownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [disableTwoFAError, setDisableTwoFAError] = useState("");

  const [showChangePass, setShowChangePass] = useState(false);
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPassConfirm, setNewPassConfirm] = useState("");
  const [passError, setPassError] = useState("");
  const [passSaving, setPassSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (exportCooldownRef.current) clearInterval(exportCooldownRef.current);
    };
  }, []);

  const loadSettings = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const r = await fetch(`${API}/settings`, { headers: authHdrs });
      if (!r.ok) throw new Error("Settings load failed");
      const d = unwrapApiResponse<{ notifOrders?: boolean; notifWallet?: boolean; notifDeals?: boolean; notifRides?: boolean; locationSharing?: boolean }>(await r.json());
      const loaded: Record<string, boolean> = { notifOrders: !!d.notifOrders, notifWallet: !!d.notifWallet, notifDeals: !!d.notifDeals, notifRides: !!d.notifRides, locationSharing: !!d.locationSharing };
      cfgRef.current = loaded;
      setCfg(loaded);
    } catch {
      setLoadError(true);
      showToast("Could not load settings — tap retry", "error");
    }
    setLoading(false);
  }, [userId, token]);

  useEffect(() => {
    if (visible && userId) loadSettings();
  }, [visible, userId, loadSettings]);

  const toggle = async (k: string, v: boolean) => {
    setSaving(k);
    const snapshot = { ...cfgRef.current };
    const upd = { ...cfgRef.current, [k]: v };
    cfgRef.current = upd;
    setCfg(upd);
    try {
      const res = await fetch(`${API}/settings`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHdrs }, body: JSON.stringify(upd) });
      if (!res.ok) throw new Error("Server rejected setting update");
    } catch (err) {
      log.warn("Setting update failed, reverting:", err instanceof Error ? err.message : String(err));
      cfgRef.current = snapshot;
      setCfg(snapshot);
      showToast("Setting could not be saved — changes reverted", "error");
    }
    setSaving(null);
  };

  const handleBiometricToggle = async (v: boolean) => {
    setSaving("biometric");
    try {
      if (v) {
        const LocalAuth = await import("expo-local-authentication");
        const hasHardware = await LocalAuth.hasHardwareAsync();
        if (!hasHardware) { showToast("Device does not support biometrics", "error"); return; }
        const isEnrolled = await LocalAuth.isEnrolledAsync();
        if (!isEnrolled) { showToast("No biometrics enrolled on device", "error"); return; }
        const result = await LocalAuth.authenticateAsync({ promptMessage: "Enable Biometric Login", cancelLabel: "Cancel" });
        if (!result.success) { return; }
      }
      await setBiometricEnabled(v);
      showToast(v ? "Biometric login enabled" : "Biometric login disabled", "success");
    } catch { showToast("Biometric setup failed", "error"); }
    finally { setSaving(null); }
  };

  const handleChangePassword = async () => {
    setPassError("");
    if (!newPass || newPass.length < 8) { setPassError("New password must be at least 8 characters"); return; }
    if (newPass !== newPassConfirm) { setPassError("Passwords do not match"); return; }
    setPassSaving(true);
    try {
      const res = await fetch(`${API}/auth/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHdrs },
        body: JSON.stringify({ password: newPass, currentPassword: currentPass || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setPassError(data.error || "Password change failed"); return; }
      showToast("Password changed! Please sign in again.", "success");
      setShowChangePass(false);
      setCurrentPass(""); setNewPass(""); setNewPassConfirm(""); setPassError("");
      setTimeout(() => logout(), 1200);
    } catch { setPassError("Network error — please try again"); }
    finally { setPassSaving(false); }
  };

  const handle2FAToggle = async () => {
    if (user?.totpEnabled) { setShowDisable2FA(true); return; }
    setTwoFALoading(true); setTwoFAError("");
    try {
      const res = await fetch(`${API}/auth/2fa/setup`, { headers: authHdrs });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "2FA setup failed");
      setTwoFASecret(data.secret); setTwoFAUri(data.uri); setTwoFAQR(data.qrDataUrl ?? "");
      setShow2FASetup(true);
    } catch (e: unknown) { showToast(getErrorMessage(e, "2FA setup failed"), "error"); }
    setTwoFALoading(false);
  };

  const handleVerify2FASetup = async () => {
    if (!twoFACode || twoFACode.length < 6) { setTwoFAError("Enter 6-digit code"); return; }
    setTwoFALoading(true); setTwoFAError("");
    try {
      const res = await fetch(`${API}/auth/2fa/verify-setup`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHdrs },
        body: JSON.stringify({ code: twoFACode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Verification failed");
      setBackupCodes(data.backupCodes || []);
      updateUser({ totpEnabled: true });
      showToast("2FA enabled successfully!", "success");
    } catch (e: unknown) { setTwoFAError(getErrorMessage(e, "Verification failed")); }
    setTwoFALoading(false);
  };

  const handleDisable2FA = async () => {
    if (!disableCode || disableCode.length < 6) { setDisableTwoFAError("Enter 6-digit code"); return; }
    setTwoFALoading(true); setDisableTwoFAError("");
    try {
      const res = await fetch(`${API}/auth/2fa/disable`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHdrs },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to disable 2FA");
      updateUser({ totpEnabled: false });
      setShowDisable2FA(false); setDisableCode(""); setDisableTwoFAError("");
      showToast("2FA disabled", "success");
    } catch (e: unknown) { setDisableTwoFAError(getErrorMessage(e, "Failed to disable 2FA")); }
    setTwoFALoading(false);
  };

  const ToggleRow = ({ k, label, sub, icon, ic = C.primary, ib = C.primarySoft }: { k: string; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap; ic?: string; ib?: string }) => (
    <View style={privRow.wrap}>
      <View style={[privRow.icon, { backgroundColor: ib }]}><Ionicons name={icon} size={17} color={ic} /></View>
      <View style={{ flex: 1 }}>
        <Text style={privRow.label}>{label}</Text>
        <Text style={privRow.sub}>{sub}</Text>
      </View>
      {saving === k ? <ActivityIndicator size="small" color={C.primary} /> : (
        <Switch value={cfg[k] ?? false} onValueChange={v => toggle(k, v)} trackColor={{ false: C.border, true: C.primary }} thumbColor={C.surface} />
      )}
    </View>
  );

  const is2FAEnabled = isMethodEnabled(config.auth.twoFactorEnabled);
  const isBioEnabled = isMethodEnabled(config.auth.biometricEnabled);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.surface }}>
        <View style={modalHdr.wrap}>
          <Text style={modalHdr.title}>Privacy & Security</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={modalHdr.close} accessibilityRole="button" accessibilityLabel="Close privacy settings"><Ionicons name="close" size={20} color={C.text} /></TouchableOpacity>
        </View>
        {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /> : loadError ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xxl }}>
            <Ionicons name="cloud-offline-outline" size={48} color={C.textMuted} />
            <Text style={{ ...typography.h3, color: C.text }}>Could not load settings</Text>
            <Text style={{ ...typography.caption, color: C.textMuted, textAlign: "center" }}>Check your connection and try again</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={loadSettings} style={[primaryBtn.base, { paddingHorizontal: spacing.xxl }]} accessibilityRole="button" accessibilityLabel="Retry loading settings">
              <Text style={primaryBtn.txt}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
            <Accordion title="🌐 Language" icon="language-outline" iconColor={C.primary} iconBg={C.primarySoft}>
              <View style={secCard.wrap}>
                <View style={{ paddingHorizontal: 4, paddingBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>Choose your preferred language</Text>
                  {LANGUAGE_OPTIONS.filter(opt => config.language.enabledLanguages.includes(opt.value)).map((opt) => {
                    const selected = currentLang === opt.value;
                    const isUrduOpt = opt.value === "ur";
                    return (
                      <TouchableOpacity activeOpacity={0.7}
                        key={opt.value}
                        onPress={async () => { if (!selected && !langLoading) await setLanguage(opt.value as Language); }}
                        style={{
                          flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14,
                          marginBottom: 6, borderRadius: 12, backgroundColor: selected ? C.primarySoft : C.surfaceSecondary,
                          borderWidth: 1.5, borderColor: selected ? C.primary : C.borderLight,
                        }}
                        accessibilityRole="radio" accessibilityLabel={opt.label} accessibilityState={{ selected }}
                      >
                        <Text style={{
                          flex: 1, fontSize: 15,
                          fontFamily: selected
                            ? (isUrduOpt ? "NotoNastaliqUrdu_700Bold" : "Inter_700Bold")
                            : (isUrduOpt ? "NotoNastaliqUrdu_400Regular" : "Inter_400Regular"),
                          color: selected ? C.primary : C.text,
                          writingDirection: isUrduOpt ? "rtl" : "ltr",
                          lineHeight: isUrduOpt ? 30 : 20,
                        }}>{opt.label}</Text>
                        {selected && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </Accordion>
            <Accordion title="🔔 Notifications" icon="notifications-outline" iconColor={C.accent} iconBg={C.accentSoft} defaultOpen={true} badge="4 toggles" badgeColor={C.textMuted} badgeBg={C.surfaceSecondary}>
              <View style={secCard.wrap}>
                <ToggleRow k="notifOrders" label="Order Updates" sub="Delivery & order status" icon="bag-outline" ic={C.primary} ib={C.primarySoft} />
                <ToggleRow k="notifWallet" label="Wallet Activity" sub="Payment & top-up alerts" icon="wallet-outline" ic={C.info} ib={C.infoSoft} />
                <ToggleRow k="notifDeals" label="Deals & Offers" sub="Discounts & promotions" icon="pricetag-outline" ic={C.accent} ib={C.accentSoft} />
                <ToggleRow k="notifRides" label="Ride Updates" sub="Driver assignment & ETA" icon="car-outline" ic={C.success} ib={C.successSoft} />
              </View>
            </Accordion>
            <Accordion title="🔒 Privacy" icon="eye-off-outline" iconColor={C.info} iconBg={C.infoSoft}>
              <View style={secCard.wrap}>
                <ToggleRow k="locationSharing" label="Location Sharing" sub="For rides and deliveries" icon="location-outline" ic={C.success} ib={C.successSoft} />
              </View>
            </Accordion>
            <Accordion title="🛡️ Security" icon="shield-checkmark-outline" iconColor={C.success} iconBg={C.successSoft}>
              <View style={secCard.wrap}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => { setShowChangePass(v => !v); setPassError(""); }} style={privRow.wrap} accessibilityRole="button" accessibilityLabel="Change password">
                  <View style={[privRow.icon, { backgroundColor: C.primarySoft }]}><Ionicons name="key-outline" size={17} color={C.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={privRow.label}>Change Password</Text>
                    <Text style={privRow.sub}>Update your account password</Text>
                  </View>
                  <Ionicons name={showChangePass ? "chevron-up" : "chevron-forward"} size={15} color={C.textMuted} />
                </TouchableOpacity>
                {showChangePass && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 8 }}>
                    <TextInput
                      value={currentPass} onChangeText={setCurrentPass} secureTextEntry
                      placeholder="Current password (leave blank if not set)" placeholderTextColor={C.textMuted} maxLength={128}
                      style={{ borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontFamily: Font.regular, fontSize: 14, color: C.text, backgroundColor: C.surface }}
                    />
                    <TextInput
                      value={newPass} onChangeText={setNewPass} secureTextEntry
                      placeholder="New password (min 8 chars)" placeholderTextColor={C.textMuted} maxLength={128}
                      style={{ borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontFamily: Font.regular, fontSize: 14, color: C.text, backgroundColor: C.surface }}
                    />
                    <TextInput
                      value={newPassConfirm} onChangeText={setNewPassConfirm} secureTextEntry
                      placeholder="Confirm new password" placeholderTextColor={C.textMuted} maxLength={128}
                      style={{ borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontFamily: Font.regular, fontSize: 14, color: C.text, backgroundColor: C.surface }}
                    />
                    {passError ? <Text style={{ fontFamily: Font.regular, fontSize: 12, color: C.danger }}>{passError}</Text> : null}
                    <TouchableOpacity activeOpacity={0.7} onPress={handleChangePassword} disabled={passSaving} style={{ backgroundColor: C.primary, borderRadius: 8, paddingVertical: 10, alignItems: "center", opacity: passSaving ? 0.6 : 1 }} accessibilityRole="button" accessibilityLabel="Save new password">
                      {passSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontFamily: Font.semiBold, fontSize: 14, color: "#fff" }}>Save Password</Text>}
                    </TouchableOpacity>
                  </View>
                )}
                {isBioEnabled && (
                  <View style={privRow.wrap}>
                    <View style={[privRow.icon, { backgroundColor: C.primarySoft }]}><Ionicons name="finger-print-outline" size={17} color={C.primary} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={privRow.label}>Biometric Login</Text>
                      <Text style={privRow.sub}>Face ID / Fingerprint</Text>
                    </View>
                    {saving === "biometric" ? <ActivityIndicator size="small" color={C.primary} /> : (
                      <Switch value={biometricEnabled} onValueChange={handleBiometricToggle} trackColor={{ false: C.border, true: C.primary }} thumbColor={C.surface} />
                    )}
                  </View>
                )}
                {is2FAEnabled && (
                  <TouchableOpacity activeOpacity={0.7} onPress={handle2FAToggle} style={privRow.wrap} accessibilityRole="button" accessibilityLabel={`Two-factor authentication, ${user?.totpEnabled ? "enabled, tap to disable" : "tap to enable"}`}>
                    <View style={[privRow.icon, { backgroundColor: C.successSoft }]}><Ionicons name="shield-outline" size={17} color={C.success} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={privRow.label}>Two-Factor Auth</Text>
                      <Text style={privRow.sub}>{user?.totpEnabled ? "Enabled — tap to disable" : "Authenticator app"}</Text>
                    </View>
                    {twoFALoading ? <ActivityIndicator size="small" color={C.primary} /> : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {user?.totpEnabled && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.success }} />}
                        <Ionicons name="chevron-forward" size={15} color={C.textMuted} />
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </Accordion>
            <Accordion title="⚙️ Account Actions" icon="settings-outline" iconColor={C.textSecondary} iconBg={C.surfaceSecondary}>
              <View style={secCard.wrap}>
                <TouchableOpacity activeOpacity={0.7}
                  disabled={exportingData || exportCooldown > 0}
                  onPress={() => {
                    if (exportCooldown > 0) return;
                    Alert.alert(
                      "Export Your Data",
                      "Your profile, orders, ride history, and wallet transactions will be downloaded as a JSON file. Continue?",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Yes, Download",
                          onPress: async () => {
                            setExportingData(true);
                            try {
                              const res = await fetch(`${API}/users/export-data`, {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                },
                              });
                              if (!res.ok) throw new Error("Request failed");
                              const data = unwrapApiResponse(await res.json());
                              const exportPayload = data;
                              const jsonStr = JSON.stringify(exportPayload, null, 2);
                              const fileName = `ajkmart-data-${Date.now()}.json`;
                              const filePath = `${LegacyFileSystem.documentDirectory}${fileName}`;
                              await LegacyFileSystem.writeAsStringAsync(filePath, jsonStr);
                              const canShare = await Sharing.isAvailableAsync();
                              if (canShare) {
                                await Sharing.shareAsync(filePath, { mimeType: "application/json", dialogTitle: "Save your AJKMart data" });
                              } else {
                                showToast("Your data export is ready.", "success");
                              }
                              setExportCooldown(60);
                              if (exportCooldownRef.current) clearInterval(exportCooldownRef.current);
                              exportCooldownRef.current = setInterval(() => {
                                setExportCooldown(c => {
                                  if (c <= 1) { clearInterval(exportCooldownRef.current!); return 0; }
                                  return c - 1;
                                });
                              }, 1000);
                            } catch {
                              showToast("Could not export data. Please try again.", "error");
                            } finally {
                              setExportingData(false);
                            }
                          },
                        },
                      ]
                    );
                  }}
                  style={[privRow.wrap, { borderBottomWidth: 0, opacity: (exportingData || exportCooldown > 0) ? 0.5 : 1 }]}
                  accessibilityRole="button" accessibilityLabel={exportingData ? "Exporting data" : exportCooldown > 0 ? `Export available in ${exportCooldown} seconds` : "Download my data"}
                >
                  <View style={[privRow.icon, { backgroundColor: C.surfaceSecondary }]}>
                    {exportingData
                      ? <ActivityIndicator size="small" color={C.textSecondary} />
                      : <Ionicons name="download-outline" size={17} color={C.textSecondary} />}
                  </View>
                  <View style={{ flex: 1 }}><Text style={privRow.label}>Download My Data</Text><Text style={privRow.sub}>{exportingData ? "Requesting export…" : exportCooldown > 0 ? `Available in ${exportCooldown}s` : "Export all your data"}</Text></View>
                  {!exportingData && <Ionicons name="chevron-forward" size={15} color={C.textMuted} />}
                </TouchableOpacity>
                <DeleteAccountRow token={token} />
              </View>
            </Accordion>
          </ScrollView>
        )}

        <Modal visible={show2FASetup} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShow2FASetup(false); setTwoFACode(""); setBackupCodes([]); setTwoFAError(""); }}>
          <View style={{ flex: 1, backgroundColor: C.surface }}>
            <View style={modalHdr.wrap}>
              <Text style={modalHdr.title}>{backupCodes.length > 0 ? "Backup Codes" : "Setup 2FA"}</Text>
              <TouchableOpacity activeOpacity={0.7} onPress={() => { setShow2FASetup(false); setTwoFACode(""); setBackupCodes([]); setTwoFAError(""); }} style={modalHdr.close} accessibilityRole="button" accessibilityLabel="Close 2FA setup">
                <Ionicons name="close" size={20} color={C.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
              {backupCodes.length > 0 ? (
                <>
                  <View style={{ alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
                    <Ionicons name="checkmark-circle" size={48} color={C.success} />
                    <Text style={{ ...typography.h2, color: C.text }}>2FA Activated!</Text>
                    <Text style={{ ...typography.caption, color: C.textMuted, textAlign: "center" }}>
                      Save these backup codes securely. They cannot be shown again.
                    </Text>
                  </View>
                  <View style={{ backgroundColor: C.accentSoft, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: C.amberBorder }}>
                    {backupCodes.map((code, i) => (
                      <Text key={i} style={{ ...typography.subtitle, color: C.amberDark, textAlign: "center", paddingVertical: 4, letterSpacing: 2 }}>{code}</Text>
                    ))}
                  </View>
                  <TouchableOpacity activeOpacity={0.7}
                    onPress={() => { setShow2FASetup(false); setTwoFACode(""); setBackupCodes([]); setTwoFAError(""); }}
                    style={[primaryBtn.base, { marginTop: spacing.sm }]}
                    accessibilityRole="button" accessibilityLabel="Done, I've saved my backup codes"
                  >
                    <Text style={primaryBtn.txt}>Done — I've saved my codes</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={{ ...typography.body, color: C.textSecondary, lineHeight: 22 }}>
                    1. Install an authenticator app (Google Authenticator, Authy){"\n"}
                    2. Scan the QR code or enter the secret manually{"\n"}
                    3. Enter the 6-digit code to verify
                  </Text>
                  {twoFAQR ? (
                    <View style={{ alignItems: "center", marginBottom: spacing.sm }}>
                      <View style={{ backgroundColor: C.surface, borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, borderColor: C.border }}>
                        <Image source={{ uri: twoFAQR }} style={{ width: 200, height: 200 }} resizeMode="contain" />
                      </View>
                      <Text style={{ ...typography.caption, color: C.textMuted, marginTop: spacing.sm }}>Scan with your authenticator app</Text>
                    </View>
                  ) : null}
                  {twoFASecret ? (
                    <View style={{ backgroundColor: C.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: C.border }}>
                      <Text style={{ ...typography.captionMedium, color: C.textMuted, marginBottom: spacing.sm }}>Or enter this secret manually:</Text>
                      <Text style={{ ...typography.subtitle, color: C.text, letterSpacing: 2 }} selectable>{twoFASecret}</Text>
                    </View>
                  ) : null}
                  <TextInput
                    style={otpStyle.input}
                    value={twoFACode} onChangeText={v => { setTwoFACode(v); setTwoFAError(""); }}
                    placeholder="6-digit code" placeholderTextColor={C.textMuted}
                    keyboardType="number-pad" maxLength={6}
                  />
                  {twoFAError ? (
                    <View style={errStyle.box}>
                      <Ionicons name="alert-circle-outline" size={15} color={C.danger} />
                      <Text style={errStyle.txt}>{twoFAError}</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity activeOpacity={0.7} onPress={handleVerify2FASetup} disabled={twoFALoading}
                    style={[primaryBtn.base, twoFALoading && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Verify and enable 2FA" accessibilityState={{ disabled: twoFALoading }}>
                    {twoFALoading ? <ActivityIndicator color={C.textInverse} /> : <Text style={primaryBtn.txt}>Verify & Enable</Text>}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </Modal>

        <Modal visible={showDisable2FA} animationType="slide" transparent onRequestClose={() => { setShowDisable2FA(false); setDisableCode(""); setDisableTwoFAError(""); }}>
          <View style={{ flex: 1, backgroundColor: C.overlay, justifyContent: "center", padding: spacing.xxl }}>
            <View style={{ backgroundColor: C.surface, borderRadius: radii.xl, padding: spacing.xxl }}>
              <Text style={{ ...typography.h3, color: C.text, marginBottom: spacing.sm }}>Disable 2FA</Text>
              <Text style={{ ...typography.caption, color: C.textMuted, marginBottom: spacing.lg }}>Enter your authenticator code to disable two-factor authentication.</Text>
              <TextInput
                style={[otpStyle.input, { marginBottom: spacing.md }]}
                value={disableCode} onChangeText={v => { setDisableCode(v); setDisableTwoFAError(""); }}
                placeholder="6-digit code" placeholderTextColor={C.textMuted}
                keyboardType="number-pad" maxLength={6} autoFocus
              />
              {disableTwoFAError ? (
                <View style={[errStyle.box, { marginBottom: spacing.md }]}>
                  <Ionicons name="alert-circle-outline" size={15} color={C.danger} />
                  <Text style={errStyle.txt}>{disableTwoFAError}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => { setShowDisable2FA(false); setDisableCode(""); setDisableTwoFAError(""); }} style={btnStyles.cancel} accessibilityRole="button" accessibilityLabel="Cancel">
                  <Text style={btnStyles.cancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.7} onPress={handleDisable2FA} disabled={twoFALoading}
                  style={[btnStyles.save, { backgroundColor: C.danger }, twoFALoading && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Disable two-factor authentication" accessibilityState={{ disabled: twoFALoading }}>
                  {twoFALoading ? <ActivityIndicator color={C.textInverse} /> : <Text style={btnStyles.saveTxt}>Disable</Text>}
                </TouchableOpacity>
              </View>
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => {
                  Alert.alert(
                    "Lost Authenticator?",
                    "If you've lost access to your authenticator app, please contact support with your registered phone number and a government-issued ID. We'll verify your identity and disable 2FA manually.\n\nThis process may take 1-2 business days.",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Contact Support", onPress: () => Linking.openURL("mailto:support@ajkmart.pk?subject=Lost%202FA%20Authenticator") },
                    ]
                  );
                }}
                style={{ marginTop: spacing.lg, alignItems: "center" }}
                accessibilityRole="button" accessibilityLabel="Lost access to authenticator app, contact support"
              >
                <Text style={{ ...Typ.bodyMedium, fontSize: 13, color: C.primary }}>
                  Lost access to authenticator app?
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}
