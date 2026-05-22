import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors, { spacing, radii, shadows, typography } from "@/constants/colors";
import { T as Typ, Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { usePlatformConfig, isMethodEnabled } from "@/context/PlatformConfigContext";
import { useToast } from "@/context/ToastContext";
import { tDual, type TranslationKey, type Language, LANGUAGE_OPTIONS } from "@workspace/i18n";
import { SmartRefresh } from "@/components/ui/SmartRefresh";
import Accordion from "@/components/Accordion";
import { API_BASE as API } from "@/utils/api";

const C = Colors.light;

function relativeTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const FALLBACK_CITIES = ["Muzaffarabad","Mirpur","Rawalakot","Bagh","Kotli","Bhimber","Poonch","Neelum Valley","Rawalpindi","Islamabad","Other"];

function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, updateUser, token } = useAuth();
  const { showToast } = useToast();
  const { config: platformConfig } = usePlatformConfig();
  const [name,        setName]       = useState(user?.name  || "");
  const [email,       setEmail]      = useState(user?.email || "");
  const [cnic,        setCnic]       = useState(user?.cnic  || "");
  const [city,        setCity]       = useState(user?.city  || "");
  const [saving,      setSaving]     = useState(false);
  const [error,       setError]      = useState("");
  const [avatarUri,   setAvatarUri]  = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<{ base64: string; mimeType: string; uri: string } | null>(null);
  const [cnicError, setCnicError] = useState("");

  const cityList: string[] = React.useMemo(() => {
    if (platformConfig.cities && platformConfig.cities.length > 0) return platformConfig.cities;
    return FALLBACK_CITIES;
  }, [platformConfig]);

  useEffect(() => {
    if (visible) {
      setName(user?.name || "");
      setEmail(user?.email || "");
      const rawCnic = user?.cnic || "";
      const digits = rawCnic.replace(/\D/g, "");
      if (digits.length === 13) {
        setCnic(`${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`);
      } else {
        setCnic(rawCnic);
      }
      setCity(user?.city || "");
      setError("");
      // avatarUri and pendingAsset are intentionally NOT reset on reopen —
      // they persist until the modal is saved (handleSave clears them) or
      // the user explicitly removes the pending image.
    }
    // On close we only clear non-image transient UI state; avatar state persists.
    if (!visible) {
      setAvatarError(false);
      setCnicError("");
      setError("");
    }
  }, [visible]);

  const uploadAvatar = async (asset: { base64: string; mimeType: string; uri: string }) => {
    setAvatarUploading(true);
    setAvatarError(false);
    try {
      const mimeType = asset.mimeType ?? "image/jpeg";
      const avatarRes = await fetch(`${API}/users/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          file: `data:${mimeType};base64,${asset.base64}`,
          mimeType,
        }),
      });
      if (!avatarRes.ok) {
        const err = await avatarRes.json().catch(() => ({}));
        throw new Error((err as any)?.error || "Avatar upload failed");
      }
      const avatarData = await avatarRes.json();
      const avatarUrl: string = avatarData.avatarUrl;
      if (!avatarUrl) throw new Error("No URL returned from server");
      updateUser({ avatar: avatarUrl });
      setAvatarUri(asset.uri);
      setPendingAsset(null);
      setAvatarError(false);
      showToast("Avatar updated!", "success");
    } catch (e: any) {
      setAvatarError(true);
      showToast(e.message || "Avatar upload failed — tap Retry", "error");
    } finally {
      setAvatarUploading(false);
    }
  };

  const pickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showToast("Photo library permission denied", "error"); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0]!;
      if (!asset.base64) { showToast("Could not read image data", "error"); return; }
      const prepared = { base64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg", uri: asset.uri };
      setPendingAsset(prepared);
      await uploadAvatar(prepared);
    } catch { showToast("Could not open photo library", "error"); }
  };

  const save = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    if (cnic.trim()) {
      const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
      if (!cnicRegex.test(cnic.trim())) {
        setCnicError("CNIC must be in format XXXXX-XXXXXXX-X");
        return;
      }
    }
    setCnicError("");
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`${API}/users/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), cnic: cnic.trim(), city: city.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      updateUser({
        name: data.name ?? name.trim(),
        email: data.email ?? email.trim(),
        cnic: data.cnic ?? cnic.trim(),
        city: data.city ?? city.trim(),
        accountLevel: data.accountLevel,
        kycStatus: data.kycStatus,
        area: data.area,
        address: data.address,
        username: data.username,
      });
      setAvatarUri(null);
      setPendingAsset(null);
      onClose();
      showToast("Profile updated!", "success");
    } catch { showToast("Update failed. Please try again.", "error"); }
    setSaving(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheet.overlay} onPress={onClose}>
        <Pressable style={sheet.container} onPress={e => e.stopPropagation()}>
          <View style={sheet.handle} />
          <Text style={sheet.title}>Edit Profile</Text>
          <Text style={sheet.sub}>Update your information</Text>

          <View style={{ alignSelf: "center", alignItems: "center", marginBottom: spacing.lg, gap: 8 }}>
            <Pressable onPress={pickAvatar} disabled={avatarUploading} style={{ position: "relative" }} accessibilityRole="button" accessibilityLabel="Change profile photo">
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: avatarError ? C.danger : C.primary, overflow: "hidden" }}>
                {avatarUploading
                  ? <ActivityIndicator color={C.primary} />
                  : avatarUri
                    ? <Image source={{ uri: avatarUri }} style={{ width: 80, height: 80, borderRadius: 40 }} />
                    : user?.avatar
                      ? <Image source={{ uri: user.avatar.startsWith("/") ? `${API.replace(/\/api$/, "")}${user.avatar}` : user.avatar }} style={{ width: 80, height: 80, borderRadius: 40 }} />
                      : <Ionicons name="camera-outline" size={28} color={C.primary} />}
              </View>
              <View style={{ position: "absolute", bottom: 0, right: 0, backgroundColor: C.primary, borderRadius: 12, padding: 4 }}>
                <Ionicons name="pencil" size={11} color={C.textInverse} />
              </View>
            </Pressable>
            {avatarError && pendingAsset && (
              <Pressable onPress={() => uploadAvatar(pendingAsset)} disabled={avatarUploading} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.redSoft, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: C.redMist }} accessibilityRole="button" accessibilityLabel="Retry avatar upload">
                <Ionicons name="refresh-outline" size={13} color={C.danger} />
                <Text style={{ ...Typ.smallMedium, fontFamily: Font.semiBold, color: C.danger }}>Retry Upload</Text>
              </Pressable>
            )}
          </View>

          <Text style={fld.label}>Phone Number</Text>
          <View style={[fld.wrap, { backgroundColor: C.surfaceSecondary }]}>
            <View style={fld.pre}><Text style={fld.preTxt}>🇵🇰 +92</Text></View>
            <Text style={[fld.readOnly, { color: C.textMuted }]}>{user?.phone || "—"}</Text>
            <View style={fld.lock}>
              <Ionicons name="lock-closed-outline" size={14} color={C.textMuted} />
              <Text style={fld.lockTxt}>Verified</Text>
            </View>
          </View>
          <Text style={fld.hint}>To change phone, call helpline: 0300-AJKMART</Text>

          <Text style={[fld.label, { marginTop: spacing.lg }]}>Full Name</Text>
          <View style={fld.wrap}>
            <View style={[fld.pre, { backgroundColor: C.primarySoft }]}>
              <Ionicons name="person-outline" size={16} color={C.primary} />
            </View>
            <TextInput style={fld.input} value={name} onChangeText={setName}
              placeholder="Enter your name" placeholderTextColor={C.textMuted} autoCapitalize="words" />
          </View>

          <Text style={[fld.label, { marginTop: spacing.md }]}>Email Address</Text>
          <View style={fld.wrap}>
            <View style={[fld.pre, { backgroundColor: C.successSoft }]}>
              <Ionicons name="mail-outline" size={16} color={C.success} />
            </View>
            <TextInput style={fld.input} value={email} onChangeText={setEmail}
              placeholder="email@example.com (optional)" placeholderTextColor={C.textMuted}
              keyboardType="email-address" autoCapitalize="none" />
          </View>

          <Text style={[fld.label, { marginTop: spacing.md }]}>CNIC / National ID</Text>
          <View style={[fld.wrap, cnicError ? { borderColor: C.danger, borderWidth: 1 } : {}]}>
            <View style={[fld.pre, { backgroundColor: C.accentSoft }]}>
              <Ionicons name="card-outline" size={16} color={cnicError ? C.danger : C.accent} />
            </View>
            <TextInput style={fld.input} value={cnic} onChangeText={v => {
                // Auto-insert dashes at positions 5 and 13 (XXXXX-XXXXXXX-X)
                const digits = v.replace(/\D/g, "");
                let formatted = digits;
                if (digits.length > 5) {
                  formatted = `${digits.slice(0,5)}-${digits.slice(5)}`;
                }
                if (digits.length > 12) {
                  formatted = `${digits.slice(0,5)}-${digits.slice(5,12)}-${digits.slice(12)}`;
                }
                setCnic(formatted);
                if (cnicError) setCnicError("");
              }}
              placeholder="XXXXX-XXXXXXX-X (optional)" placeholderTextColor={C.textMuted}
              keyboardType="numeric" maxLength={15} />
          </View>
          {cnicError ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Ionicons name="alert-circle-outline" size={13} color={C.danger} />
              <Text style={{ ...Typ.small, color: C.danger }}>{cnicError}</Text>
            </View>
          ) : (
            <Text style={fld.hint}>For verification (optional)</Text>
          )}

          <Text style={[fld.label, { marginTop: spacing.md }]}>City</Text>
          <View style={[fld.wrap, { paddingRight: 0, overflow: "hidden" }]}>
            <View style={[fld.pre, { backgroundColor: C.successSoft }]}>
              <Ionicons name="location-outline" size={16} color={C.success} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center", paddingRight: 12, paddingLeft: 8, height: 52 }}>
                {cityList.map(c => (
                  <Pressable key={c} onPress={() => setCity(c)}
                    style={[chip.base, city === c && chip.active]} accessibilityRole="radio" accessibilityLabel={c} accessibilityState={{ selected: city === c }}>
                    <Text style={[chip.text, city === c && chip.textActive]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          {error ? (
            <View style={errStyle.box}>
              <Ionicons name="alert-circle-outline" size={14} color={C.danger} />
              <Text style={errStyle.txt}>{error}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.lg }}>
            <Pressable onPress={onClose} style={btnStyles.cancel} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={btnStyles.cancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={[btnStyles.save, saving && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Save changes" accessibilityState={{ disabled: saving }}>
              {saving ? <ActivityIndicator color={C.textInverse} size="small" /> : <Text style={btnStyles.saveTxt}>Save Changes</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NotificationsModal({ visible, userId, token, onClose }: {
  visible: boolean; userId: string; token?: string; onClose: (unread: number) => void;
}) {
  const { showToast } = useToast();
  const [notifs,  setNotifs]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const authHdrs: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/notifications`, { headers: authHdrs });
      const d = await r.json();
      setNotifs(d.notifications || []);
    } catch (err) {
      console.warn("[Profile] Notifications load failed:", err instanceof Error ? err.message : String(err));
      showToast("Could not load notifications — tap retry to try again", "error");
    }
    setLoading(false);
  }, [userId, token]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const markOne = async (id: string) => {
    await fetch(`${API}/notifications/${id}/read`, { method: "PATCH", headers: authHdrs });
    setNotifs(p => p.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const handleNotifPress = async (n: any) => {
    if (!n.isRead) await markOne(n.id);
    onClose(notifs.filter(x => !x.isRead && x.id !== n.id).length);
    const meta = n.meta || {};
    const type: string = n.type || "";
    if ((type === "order" || type === "food" || type === "mart") && meta.orderId) {
      router.push(`/order?orderId=${meta.orderId}`);
    } else if (type === "ride" && meta.rideId) {
      router.push(`/ride?rideId=${meta.rideId}`);
    } else if (type === "parcel" && meta.bookingId) {
      router.push(`/order?orderId=${meta.bookingId}&type=parcel`);
    } else if (type === "pharmacy" && meta.orderId) {
      router.push(`/order?orderId=${meta.orderId}&type=pharmacy`);
    } else if (type === "wallet") {
      router.push("/(tabs)/wallet");
    } else if (type === "deal" || type === "deals") {
      router.push("/(tabs)");
    }
  };
  const markAll = async () => {
    setMarking(true);
    await fetch(`${API}/notifications/read-all`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHdrs } });
    setNotifs(p => p.map(n => ({ ...n, isRead: true })));
    setMarking(false);
  };
  const del = async (id: string) => {
    await fetch(`${API}/notifications/${id}`, { method: "DELETE", headers: authHdrs });
    setNotifs(p => p.filter(n => n.id !== id));
  };

  const unread = notifs.filter(n => !n.isRead).length;
  const typeMap: Record<string, [keyof typeof Ionicons.glyphMap, string, string]> = {
    wallet: ["wallet-outline",         C.primary,  C.primarySoft],
    ride:   ["car-outline",            C.success,  C.successSoft],
    order:  ["bag-outline",            C.accent,   C.accentSoft],
    deal:   ["pricetag-outline",       C.info,     C.infoSoft],
    system: ["notifications-outline",  C.textSecondary, C.surfaceSecondary],
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose(unread)}>
      <View style={{ flex: 1, backgroundColor: C.surface }}>
        <View style={modalHdr.wrap}>
          <View>
            <Text style={modalHdr.title}>Notifications</Text>
            {unread > 0 && <Text style={modalHdr.sub}>{unread} new</Text>}
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
            {unread > 0 && (
              <Pressable onPress={markAll} disabled={marking} style={modalHdr.action} accessibilityRole="button" accessibilityLabel="Mark all as read">
                {marking ? <ActivityIndicator size="small" color={C.primary} /> : <Text style={modalHdr.actionTxt}>Mark all as read</Text>}
              </Pressable>
            )}
            <Pressable onPress={() => onClose(unread)} style={modalHdr.close} accessibilityRole="button" accessibilityLabel="Close notifications">
              <Ionicons name="close" size={20} color={C.text} />
            </Pressable>
          </View>
        </View>

        {loading && notifs.length === 0 ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
        ) : notifs.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[C.primary]} tintColor={C.primary} />}
          >
            <View style={empty.wrap}>
              <Text style={{ fontSize: 52 }}>🔔</Text>
              <Text style={empty.title}>No notifications</Text>
              <Text style={empty.sub}>You're all caught up!</Text>
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: 6 }}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[C.primary]} tintColor={C.primary} />}
          >
            {notifs.map(n => {
              const [icon, color, bg] = typeMap[n.type] || typeMap.system!;
              return (
                <Pressable key={n.id} onPress={() => handleNotifPress(n)} style={[notifItem.wrap, !n.isRead && notifItem.unread]} accessibilityRole="button" accessibilityLabel={`${n.title}, ${n.body}${!n.isRead ? ", unread" : ""}`}>
                  <View style={[notifItem.icon, { backgroundColor: bg }]}>
                    <Ionicons name={icon} size={19} color={color} />
                    {!n.isRead && <View style={notifItem.dot} />}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[notifItem.title, !n.isRead && { fontFamily: Font.bold }]}>{n.title}</Text>
                    <Text style={notifItem.body} numberOfLines={2}>{n.body}</Text>
                    <Text style={notifItem.time}>{relativeTime(n.createdAt)}</Text>
                  </View>
                  <Pressable onPress={() => del(n.id)} style={notifItem.del} accessibilityRole="button" accessibilityLabel="Delete notification">
                    <Ionicons name="close" size={13} color={C.textMuted} />
                  </Pressable>
                </Pressable>
              );
            })}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function DeleteAccountRow({ token }: { token?: string }) {
  const { showToast } = useToast();
  const { logout } = useAuth();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const handleDelete = async () => {
    if (confirmText.toLowerCase() !== "delete") {
      showToast("Please type DELETE to confirm", "error");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`${API}/users/delete-account`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete account");
      }
      showToast("Account deleted successfully", "success");
      await logout();
    } catch (e: any) {
      showToast(e.message || "Could not delete account. Please try again.", "error");
    }
    setDeleting(false);
    setConfirmVisible(false);
    setConfirmText("");
  };

  return (
    <>
      <Pressable
        onPress={() => setConfirmVisible(true)}
        style={[privRow.wrap, { borderBottomWidth: 0 }]}
      >
        <View style={[privRow.icon, { backgroundColor: C.dangerSoft }]}>
          <Ionicons name="trash-outline" size={17} color={C.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[privRow.label, { color: C.danger }]}>Delete Account</Text>
          <Text style={privRow.sub}>Permanently remove your account and data</Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color={C.textMuted} />
      </Pressable>

      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => { setConfirmVisible(false); setConfirmText(""); }}>
        <View style={{ flex: 1, backgroundColor: C.overlay, justifyContent: "center", padding: spacing.xxl }}>
          <View style={{ backgroundColor: C.surface, borderRadius: radii.xl, padding: spacing.xl }}>
            <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.dangerSoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.md }}>
                <Ionicons name="warning-outline" size={28} color={C.danger} />
              </View>
              <Text style={{ ...typography.h3, color: C.danger, textAlign: "center" }}>Delete Account?</Text>
              <Text style={{ ...typography.caption, color: C.textSecondary, textAlign: "center", marginTop: spacing.sm }}>
                This action is permanent and cannot be undone. All your data including orders, ride history, wallet balance, and saved addresses will be permanently deleted.
              </Text>
            </View>
            <Text style={{ ...typography.captionMedium, color: C.text, marginBottom: spacing.xs }}>Type DELETE to confirm:</Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="DELETE"
              placeholderTextColor={C.textMuted}
              autoCapitalize="characters"
              style={{
                borderWidth: 1.5, borderColor: confirmText.toLowerCase() === "delete" ? C.danger : C.border,
                borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                ...Typ.button, color: C.text, textAlign: "center",
                marginBottom: spacing.lg,
              }}
            />
            <Pressable
              onPress={handleDelete}
              disabled={deleting || confirmText.toLowerCase() !== "delete"}
              style={{
                backgroundColor: confirmText.toLowerCase() === "delete" ? C.danger : C.border,
                borderRadius: radii.md, paddingVertical: spacing.md, alignItems: "center", marginBottom: spacing.sm,
                opacity: deleting ? 0.7 : 1,
              }}
            >
              {deleting
                ? <ActivityIndicator color={C.textInverse} size="small" />
                : <Text style={{ ...Typ.button, fontFamily: Font.bold, color: C.textInverse }}>Delete My Account</Text>}
            </Pressable>
            <Pressable
              onPress={() => { setConfirmVisible(false); setConfirmText(""); }}
              style={{ borderRadius: radii.md, paddingVertical: spacing.md, alignItems: "center", backgroundColor: C.surfaceSecondary }}
            >
              <Text style={{ ...Typ.button, color: C.textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function PrivacyModal({ visible, userId, token, onClose }: { visible: boolean; userId: string; token?: string; onClose: () => void }) {
  const { showToast } = useToast();
  const { biometricEnabled, setBiometricEnabled, user, updateUser } = useAuth();
  const { config } = usePlatformConfig();
  const { language: currentLang, setLanguage, loading: langLoading } = useLanguage();
  const [cfg,     setCfg]     = useState<Record<string, boolean>>({});
  const cfgRef = React.useRef<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<string | null>(null);
  const authHdrs: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const [show2FASetup, setShow2FASetup]   = useState(false);
  const [twoFASecret, setTwoFASecret]     = useState("");
  const [twoFAUri, setTwoFAUri]           = useState("");
  const [twoFAQR, setTwoFAQR]             = useState("");
  const [twoFACode, setTwoFACode]         = useState("");
  const [backupCodes, setBackupCodes]      = useState<string[]>([]);
  const [twoFALoading, setTwoFALoading]   = useState(false);
  const [twoFAError, setTwoFAError]       = useState("");
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disableCode, setDisableCode]      = useState("");
  const [exportingData, setExportingData]  = useState(false);
  const [exportCooldown, setExportCooldown] = useState(0);
  const exportCooldownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [disableTwoFAError, setDisableTwoFAError] = useState("");

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
      const d = await r.json();
      const loaded = { notifOrders: d.notifOrders, notifWallet: d.notifWallet, notifDeals: d.notifDeals, notifRides: d.notifRides, locationSharing: d.locationSharing };
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
    try { await fetch(`${API}/settings`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHdrs }, body: JSON.stringify(upd) }); }
    catch (err) {
      console.warn("[Profile] Setting update failed, reverting:", err instanceof Error ? err.message : String(err));
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

  const handle2FAToggle = async () => {
    if (user?.totpEnabled) { setShowDisable2FA(true); return; }
    setTwoFALoading(true); setTwoFAError("");
    try {
      const res = await fetch(`${API}/auth/2fa/setup`, { headers: authHdrs });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTwoFASecret(data.secret); setTwoFAUri(data.uri); setTwoFAQR(data.qrDataUrl ?? "");
      setShow2FASetup(true);
    } catch (e: any) { showToast(e.message || "2FA setup failed", "error"); }
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
      if (!res.ok) throw new Error(data.error);
      setBackupCodes(data.backupCodes || []);
      updateUser({ totpEnabled: true });
      showToast("2FA enabled successfully!", "success");
    } catch (e: any) { setTwoFAError(e.message || "Verification failed"); }
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
      if (!res.ok) throw new Error(data.error);
      updateUser({ totpEnabled: false });
      setShowDisable2FA(false); setDisableCode(""); setDisableTwoFAError("");
      showToast("2FA disabled", "success");
    } catch (e: any) { setDisableTwoFAError(e.message || "Failed to disable 2FA"); }
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
          <Pressable onPress={onClose} style={modalHdr.close} accessibilityRole="button" accessibilityLabel="Close privacy settings"><Ionicons name="close" size={20} color={C.text} /></Pressable>
        </View>
        {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /> : loadError ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xxl }}>
            <Ionicons name="cloud-offline-outline" size={48} color={C.textMuted} />
            <Text style={{ ...typography.h3, color: C.text }}>Could not load settings</Text>
            <Text style={{ ...typography.caption, color: C.textMuted, textAlign: "center" }}>Check your connection and try again</Text>
            <Pressable onPress={loadSettings} style={[primaryBtn.base, { paddingHorizontal: spacing.xxl }]} accessibilityRole="button" accessibilityLabel="Retry loading settings">
              <Text style={primaryBtn.txt}>Retry</Text>
            </Pressable>
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
                      <Pressable
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
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </Accordion>
            <Accordion title="🔔 Notifications" icon="notifications-outline" iconColor={C.accent} iconBg={C.accentSoft} defaultOpen={true} badge="4 toggles" badgeColor={C.textMuted} badgeBg={C.surfaceSecondary}>
              <View style={secCard.wrap}>
                <ToggleRow k="notifOrders"  label="Order Updates"    sub="Delivery & order status"     icon="bag-outline"           ic={C.primary} ib={C.primarySoft} />
                <ToggleRow k="notifWallet"  label="Wallet Activity"  sub="Payment & top-up alerts"     icon="wallet-outline"        ic={C.info}    ib={C.infoSoft} />
                <ToggleRow k="notifDeals"   label="Deals & Offers"   sub="Discounts & promotions"      icon="pricetag-outline"      ic={C.accent}  ib={C.accentSoft} />
                <ToggleRow k="notifRides"   label="Ride Updates"     sub="Driver assignment & ETA"     icon="car-outline"           ic={C.success} ib={C.successSoft} />
              </View>
            </Accordion>
            <Accordion title="🔒 Privacy" icon="eye-off-outline" iconColor={C.info} iconBg={C.infoSoft}>
              <View style={secCard.wrap}>
                <ToggleRow k="locationSharing" label="Location Sharing" sub="For rides and deliveries"  icon="location-outline"     ic={C.success} ib={C.successSoft} />
              </View>
            </Accordion>
            <Accordion title="🛡️ Security" icon="shield-checkmark-outline" iconColor={C.success} iconBg={C.successSoft}>
              <View style={secCard.wrap}>
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
                  <Pressable onPress={handle2FAToggle} style={privRow.wrap} accessibilityRole="button" accessibilityLabel={`Two-factor authentication, ${user?.totpEnabled ? "enabled, tap to disable" : "tap to enable"}`}>
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
                  </Pressable>
                )}
              </View>
            </Accordion>
            <Accordion title="⚙️ Account Actions" icon="settings-outline" iconColor={C.textSecondary} iconBg={C.surfaceSecondary}>
              <View style={secCard.wrap}>
                <Pressable
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
                              const data = await res.json();
                              const exportPayload = data.data ?? data;
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
                </Pressable>
                <DeleteAccountRow token={token} />
              </View>
            </Accordion>
          </ScrollView>
        )}

        <Modal visible={show2FASetup} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShow2FASetup(false); setTwoFACode(""); setBackupCodes([]); setTwoFAError(""); }}>
          <View style={{ flex: 1, backgroundColor: C.surface }}>
            <View style={modalHdr.wrap}>
              <Text style={modalHdr.title}>{backupCodes.length > 0 ? "Backup Codes" : "Setup 2FA"}</Text>
              <Pressable onPress={() => { setShow2FASetup(false); setTwoFACode(""); setBackupCodes([]); setTwoFAError(""); }} style={modalHdr.close} accessibilityRole="button" accessibilityLabel="Close 2FA setup">
                <Ionicons name="close" size={20} color={C.text} />
              </Pressable>
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
                  <Pressable
                    onPress={() => { setShow2FASetup(false); setTwoFACode(""); setBackupCodes([]); setTwoFAError(""); }}
                    style={[primaryBtn.base, { marginTop: spacing.sm }]}
                    accessibilityRole="button" accessibilityLabel="Done, I've saved my backup codes"
                  >
                    <Text style={primaryBtn.txt}>Done — I've saved my codes</Text>
                  </Pressable>
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
                  <Pressable onPress={handleVerify2FASetup} disabled={twoFALoading}
                    style={[primaryBtn.base, twoFALoading && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Verify and enable 2FA" accessibilityState={{ disabled: twoFALoading }}>
                    {twoFALoading ? <ActivityIndicator color={C.textInverse} /> : <Text style={primaryBtn.txt}>Verify & Enable</Text>}
                  </Pressable>
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
                <Pressable onPress={() => { setShowDisable2FA(false); setDisableCode(""); setDisableTwoFAError(""); }} style={btnStyles.cancel} accessibilityRole="button" accessibilityLabel="Cancel">
                  <Text style={btnStyles.cancelTxt}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleDisable2FA} disabled={twoFALoading}
                  style={[btnStyles.save, { backgroundColor: C.danger }, twoFALoading && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Disable two-factor authentication" accessibilityState={{ disabled: twoFALoading }}>
                  {twoFALoading ? <ActivityIndicator color={C.textInverse} /> : <Text style={btnStyles.saveTxt}>Disable</Text>}
                </Pressable>
              </View>
              <Pressable
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
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const LABEL_OPTS = [
  { label: "Home",  icon: "home-outline"      as const, color: C.success, bg: C.successSoft },
  { label: "Work",  icon: "briefcase-outline" as const, color: C.primary, bg: C.primarySoft },
  { label: "Other", icon: "location-outline"  as const, color: C.accent,  bg: C.accentSoft },
];
const AJK_CITIES = ["Muzaffarabad","Mirpur","Rawalakot","Bagh","Kotli","Bhimber","Poonch","Neelum Valley"];

function AddressesModal({ visible, userId, token, onClose }: { visible: boolean; userId: string; token?: string; onClose: () => void }) {
  const { showToast } = useToast();
  const [list,    setList]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [label,   setLabel]   = useState("Home");
  const [addr,    setAddr]    = useState("");
  const [city,    setCity]    = useState("Muzaffarabad");
  const [saving,  setSaving]  = useState(false);

  const [editId,    setEditId]    = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("Home");
  const [editAddr,  setEditAddr]  = useState("");
  const [editCity,  setEditCity]  = useState("Muzaffarabad");
  const [editSaving, setEditSaving] = useState(false);

  const authHdrs: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try { const r = await fetch(`${API}/addresses`, { headers: authHdrs }); const d = await r.json(); setList(d.addresses || []); }
    catch (err) {
      console.warn("[Profile] Addresses load failed:", err instanceof Error ? err.message : String(err));
      showToast("Could not load addresses — tap to refresh", "error");
    }
    setLoading(false);
  }, [userId, token]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const add = async () => {
    if (list.length >= 5) { showToast("Maximum 5 addresses allowed", "error"); return; }
    if (!addr.trim()) { showToast("Address is required", "error"); return; }
    setSaving(true);
    const opt = LABEL_OPTS.find(o => o.label === label)!;
    try {
      await fetch(`${API}/addresses`, { method: "POST", headers: { "Content-Type": "application/json", ...authHdrs }, body: JSON.stringify({ label, address: addr.trim(), city, icon: opt.icon, isDefault: list.length === 0 }) });
      setAddr(""); setCity("Muzaffarabad"); setShowAdd(false); await load();
      showToast("Address saved!", "success");
    } catch { showToast("Could not save address", "error"); }
    setSaving(false);
  };
  const del = async (id: string) => {
    await fetch(`${API}/addresses/${id}`, { method: "DELETE", headers: authHdrs });
    setList(p => p.filter(a => a.id !== id));
    setDeleteConfirmId(null);
    showToast("Address deleted", "info");
  };

  const startEdit = (a: any) => {
    setEditId(a.id);
    setEditLabel(a.label || "Home");
    setEditAddr(a.address || "");
    setEditCity(a.city || "Muzaffarabad");
    setDeleteConfirmId(null);
  };
  const cancelEdit = () => { setEditId(null); };
  const saveEdit = async () => {
    if (!editAddr.trim()) { showToast("Address is required", "error"); return; }
    setEditSaving(true);
    const opt = LABEL_OPTS.find(o => o.label === editLabel)!;
    try {
      const r = await fetch(`${API}/addresses/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHdrs },
        body: JSON.stringify({ label: editLabel, address: editAddr.trim(), city: editCity, icon: opt?.icon }),
      });
      if (!r.ok) throw new Error();
      setList(p => p.map(a => a.id === editId ? { ...a, label: editLabel, address: editAddr.trim(), city: editCity, icon: opt?.icon } : a));
      setEditId(null);
      showToast("Address updated!", "success");
    } catch { showToast("Could not update address", "error"); }
    setEditSaving(false);
  };

  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const setDefault = async (id: string) => {
    setSettingDefault(id);
    try {
      const r = await fetch(`${API}/addresses/${id}/set-default`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHdrs } });
      if (!r.ok) throw new Error();
      setList(p => p.map(a => ({ ...a, isDefault: a.id === id })));
      showToast("Default address set!", "success");
    } catch { showToast("Could not set default", "error"); }
    setSettingDefault(null);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.surface }}>
        <View style={modalHdr.wrap}>
          <Text style={modalHdr.title}>Saved Addresses</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable onPress={() => { if (!showAdd && list.length >= 5) { showToast("Maximum 5 addresses allowed", "error"); return; } setShowAdd(v => !v); }} style={[addrHdr.addBtn, !showAdd && list.length >= 5 && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={showAdd ? "Cancel adding address" : list.length >= 5 ? "Maximum 5 addresses reached" : "Add new address"}>
              <Ionicons name={showAdd ? "close" : "add"} size={17} color={C.textInverse} />
              <Text style={addrHdr.addBtnTxt}>{showAdd ? "Cancel" : `Add New${list.length > 0 ? ` (${list.length}/5)` : ""}`}</Text>
            </Pressable>
            <Pressable onPress={onClose} style={modalHdr.close} accessibilityRole="button" accessibilityLabel="Close addresses"><Ionicons name="close" size={20} color={C.text} /></Pressable>
          </View>
        </View>

        {showAdd && (
          <View style={addrAdd.panel}>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
              {LABEL_OPTS.map(o => (
                <Pressable key={o.label} onPress={() => setLabel(o.label)} style={[chip.base, label === o.label && { backgroundColor: o.bg, borderColor: o.color }]} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ selected: label === o.label }}>
                  <Ionicons name={o.icon} size={13} color={label === o.label ? o.color : C.textMuted} />
                  <Text style={[chip.text, label === o.label && { color: o.color }]}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={addrAdd.fld}>
              <TextInput value={addr} onChangeText={setAddr} placeholder="Enter full address..." placeholderTextColor={C.textMuted} style={addrAdd.fldTxt} multiline />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {AJK_CITIES.map(c => (
                  <Pressable key={c} onPress={() => setCity(c)} style={[chip.base, city === c && { backgroundColor: C.primarySoft, borderColor: C.primary }]} accessibilityRole="radio" accessibilityLabel={c} accessibilityState={{ selected: city === c }}>
                    <Text style={[chip.text, city === c && { color: C.primary }]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Pressable onPress={add} disabled={saving} style={[primaryBtn.base, saving && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Save address" accessibilityState={{ disabled: saving }}>
              {saving ? <ActivityIndicator color={C.textInverse} size="small" /> : <Text style={primaryBtn.txt}>Save Address</Text>}
            </Pressable>
          </View>
        )}

        {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /> : list.length === 0 && !showAdd ? (
          <View style={empty.wrap}>
            <Text style={{ fontSize: 52 }}>📍</Text>
            <Text style={empty.title}>No addresses</Text>
            <Text style={empty.sub}>Save your home or office address</Text>
            <Pressable onPress={() => setShowAdd(true)} style={[primaryBtn.base, { flexDirection: "row", gap: 6, marginTop: spacing.md, alignSelf: "center", width: "auto", paddingHorizontal: spacing.xl }]} accessibilityRole="button" accessibilityLabel="Add address">
              <Ionicons name="add" size={16} color={C.textInverse} />
              <Text style={primaryBtn.txt}>Add Address</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 10 }}>
            {list.map(a => {
              const opt = LABEL_OPTS.find(o => o.label === a.label) || LABEL_OPTS[2]!;
              const isEditing = editId === a.id;
              return (
                <View key={a.id} style={addrItem.wrap}>
                  {isEditing ? (
                    <View style={{ flex: 1 }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          {LABEL_OPTS.map(o => (
                            <Pressable key={o.label} onPress={() => setEditLabel(o.label)} style={[chip.base, editLabel === o.label && { backgroundColor: o.bg, borderColor: o.color }]} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ selected: editLabel === o.label }}>
                              <Ionicons name={o.icon} size={13} color={editLabel === o.label ? o.color : C.textMuted} />
                              <Text style={[chip.text, editLabel === o.label && { color: o.color }]}>{o.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </ScrollView>
                      <View style={[addrAdd.fld, { marginBottom: spacing.sm }]}>
                        <TextInput value={editAddr} onChangeText={setEditAddr} placeholder="Enter full address..." placeholderTextColor={C.textMuted} style={addrAdd.fldTxt} multiline />
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          {AJK_CITIES.map(c => (
                            <Pressable key={c} onPress={() => setEditCity(c)} style={[chip.base, editCity === c && { backgroundColor: C.primarySoft, borderColor: C.primary }]} accessibilityRole="radio" accessibilityLabel={c} accessibilityState={{ selected: editCity === c }}>
                              <Text style={[chip.text, editCity === c && { color: C.primary }]}>{c}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </ScrollView>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable onPress={saveEdit} disabled={editSaving} style={[primaryBtn.base, { flex: 1, opacity: editSaving ? 0.7 : 1 }]} accessibilityRole="button" accessibilityLabel="Save address changes" accessibilityState={{ disabled: editSaving }}>
                          {editSaving ? <ActivityIndicator color={C.textInverse} size="small" /> : <Text style={primaryBtn.txt}>Save Changes</Text>}
                        </Pressable>
                        <Pressable onPress={cancelEdit} style={[primaryBtn.base, { backgroundColor: C.surfaceSecondary, paddingHorizontal: spacing.md, width: "auto" }]} accessibilityRole="button" accessibilityLabel="Cancel editing">
                          <Text style={[primaryBtn.txt, { color: C.textSecondary }]}>Cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <>
                      <View style={[addrItem.icon, { backgroundColor: opt.bg }]}>
                        <Ionicons name={opt.icon} size={19} color={opt.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={addrItem.label}>{a.label}</Text>
                          {a.isDefault && <View style={addrItem.defBadge}><Text style={addrItem.defTxt}>Default</Text></View>}
                        </View>
                        <Text style={addrItem.addr}>{a.address}</Text>
                        <Text style={addrItem.city}>{a.city}, AJK</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                        <Pressable onPress={() => startEdit(a)} style={addrItem.delBtn} accessibilityRole="button" accessibilityLabel={`Edit ${a.label} address`}>
                          <Ionicons name="pencil-outline" size={16} color={C.primary} />
                        </Pressable>
                        {!a.isDefault && (
                          <Pressable onPress={() => setDefault(a.id)} disabled={settingDefault === a.id} style={addrItem.setDefBtn} accessibilityRole="button" accessibilityLabel={`Set ${a.label} as default`}>
                            {settingDefault === a.id
                              ? <ActivityIndicator size="small" color={C.primary} />
                              : <Text style={addrItem.setDefTxt}>Set Default</Text>}
                          </Pressable>
                        )}
                        {deleteConfirmId === a.id ? (
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            <Pressable onPress={() => del(a.id)} style={[addrItem.delBtn, { backgroundColor: C.dangerSoft, paddingHorizontal: 8 }]} accessibilityRole="button" accessibilityLabel="Confirm delete address">
                              <Text style={{ ...typography.smallMedium, color: C.danger }}>Yes</Text>
                            </Pressable>
                            <Pressable onPress={() => setDeleteConfirmId(null)} style={[addrItem.delBtn, { backgroundColor: C.surfaceSecondary, paddingHorizontal: 8 }]} accessibilityRole="button" accessibilityLabel="Cancel delete">
                              <Text style={{ ...typography.smallMedium, color: C.textMuted }}>No</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable onPress={() => setDeleteConfirmId(a.id)} style={addrItem.delBtn} accessibilityRole="button" accessibilityLabel={`Delete ${a.label} address`}>
                            <Ionicons name="trash-outline" size={16} color={C.danger} />
                          </Pressable>
                        )}
                      </View>
                    </>
                  )}
                </View>
              );
            })}
            <View style={{ height: 30 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, updateUser, token } = useAuth();
  const { showToast } = useToast();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const TAB_H  = Platform.OS === "web" ? 72 : 49;

  const { section } = useLocalSearchParams<{ section?: string }>();

  const [showEdit,    setShowEdit]    = useState(false);
  const [showNotifs,  setShowNotifs]  = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showAddrs,   setShowAddrs]   = useState(false);
  const [lastRefreshed,  setLastRefreshed]  = useState<Date | null>(null);
  const [unread,      setUnread]      = useState(0);
  const [stats,       setStats]       = useState({ orders: 0, rides: 0, spent: 0 });
  const [statsLoading,setStatsLoading]= useState(true);
  const [statsError,  setStatsError]  = useState(false);
  const [signingOut,        setSigningOut]        = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  useEffect(() => {
    if (section === "addresses") {
      setTimeout(() => setShowAddrs(true), 300);
    }
  }, [section]);

  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const { config: platformConfig } = usePlatformConfig();
  const platformCfg = {
    tncUrl:          platformConfig.content.tncUrl,
    privacyUrl:      platformConfig.content.privacyUrl,
    refundPolicyUrl: platformConfig.content.refundPolicyUrl,
    faqUrl:          platformConfig.content.faqUrl,
    aboutUrl:        platformConfig.content.aboutUrl,
    supportMsg:      platformConfig.content.supportMsg,
    supportPhone:    platformConfig.platform.supportPhone,
    supportEmail:    platformConfig.platform.supportEmail,
    supportHours:    platformConfig.platform.supportHours,
    appName:         platformConfig.platform.appName,
    appTagline:      platformConfig.platform.appTagline,
    appVersion:      platformConfig.platform.appVersion,
    businessAddress: platformConfig.platform.businessAddress,
    socialFacebook:  platformConfig.platform.socialFacebook,
    socialInstagram: platformConfig.platform.socialInstagram,
    chat:            platformConfig.features.chat,
  };

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    const hdrs: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const [oR, rR, nR, phR, parR] = await Promise.all([
          fetch(`${API}/orders`,            { headers: hdrs }),
          fetch(`${API}/rides`,             { headers: hdrs }),
          fetch(`${API}/notifications`,     { headers: hdrs }),
          fetch(`${API}/pharmacy-orders`,   { headers: hdrs }),
          fetch(`${API}/parcel-bookings`,   { headers: hdrs }),
        ]);
        const [oD, rD, nD, phD, parD] = await Promise.all([oR.json(), rR.json(), nR.json(), phR.json().catch(() => ({})), parR.json().catch(() => ({}))]);
        const orders   = oD.orders   || [];
        const rides    = rD.rides    || [];
        const pharmacy = phD.orders  || phD.pharmacyOrders  || [];
        const parcels  = parD.bookings || parD.parcelBookings || [];

        const CANCELLED = "cancelled";
        const activeOrders   = orders.filter((o: any)   => o.status   !== CANCELLED);
        const activeRides    = rides.filter((r: any)    => r.status   !== CANCELLED);
        const activePharmacy = pharmacy.filter((p: any) => p.status   !== CANCELLED);
        const activeParcels  = parcels.filter((p: any)  => p.status   !== CANCELLED);

        const spent = activeOrders.reduce((s: number, o: any)   => s + (parseFloat(o.total) || 0), 0)
                    + activeRides.reduce((s: number,  r: any)   => s + (parseFloat(r.fare)  || 0), 0)
                    + activePharmacy.reduce((s: number, p: any) => s + (parseFloat(p.total) || 0), 0)
                    + activeParcels.reduce((s: number,  p: any) => s + (parseFloat(p.price || p.fare || p.total) || 0), 0);

        setStats({ orders: activeOrders.length, rides: activeRides.length, spent: Math.round(spent) });
        setUnread(nD.unreadCount || 0);
        setStatsError(false);
        break;
      } catch (err) {
        console.warn(`[Profile] fetchAll attempt ${attempt} failed:`, err instanceof Error ? err.message : String(err));
        if (attempt < maxAttempts) {
          await new Promise<void>((res) => setTimeout(res, 1500 * attempt));
        } else {
          setStatsError(true);
        }
      }
    }
    setStatsLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setStatsLoading(true);
    await fetchAll();
    setLastRefreshed(new Date());
  }, [fetchAll]);

  const doSignOut = async () => {
    setSigningOut(true);
    setShowSignOutConfirm(false);
    try { await logout(); } catch { setSigningOut(false); }
  };

  const roleMap: Record<string, { label: string; colors: [string, string] }> = {
    customer: { label: "Customer",        colors: [C.primaryDark, C.primary] },
    rider:    { label: "Delivery Rider",  colors: [C.primaryDark, C.primary] },
    vendor:   { label: "Store Vendor",    colors: [C.primaryDark, C.primary] },
  };
  const role = roleMap[user?.role || "customer"] || roleMap.customer!;
  const initials = user?.name
    ? user.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : user?.phone?.slice(-2) || "U";

  const LEVEL_CONFIG: Record<string, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
    bronze: { color: C.bronzeAccent, bg: C.peachBg, icon: "shield-outline", label: "Bronze" },
    silver: { color: C.neutralGray, bg: C.silverGray, icon: "shield-half-outline", label: "Silver" },
    gold:   { color: C.goldBright, bg: C.yellowWarm, icon: "shield-checkmark-outline", label: "Gold" },
  };
  const accountLevel = user?.accountLevel || "bronze";
  const levelInfo = LEVEL_CONFIG[accountLevel] || LEVEL_CONFIG.bronze!;

  const profileFields = [
    { filled: !!user?.name, label: "Name" },
    { filled: !!user?.email, label: "Email" },
    { filled: !!user?.city, label: "City" },
    { filled: !!user?.address, label: "Address" },
    { filled: !!user?.cnic, label: "CNIC" },
  ];
  const filledCount = profileFields.filter(f => f.filled).length;
  const completionPct = Math.round((filledCount / profileFields.length) * 100);

  const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={sec.wrap}>
      <Text style={sec.title}>{title}</Text>
      <View style={sec.card}>{children}</View>
    </View>
  );

  const Row = ({ icon, label, sub, onPress, iconColor = C.primary, iconBg = C.primarySoft, right, danger, badge }: {
    icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void;
    iconColor?: string; iconBg?: string; right?: React.ReactNode; danger?: boolean; badge?: number;
  }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [row.wrap, pressed && { opacity: 0.65 }]} accessibilityRole="button" accessibilityLabel={`${label}${sub ? `, ${sub}` : ""}${badge && badge > 0 ? `, ${badge} new` : ""}`}>
      <View style={[row.icon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[row.label, danger && { color: C.danger }]}>{label}</Text>
        {sub ? <Text style={row.sub}>{sub}</Text> : null}
      </View>
      {badge && badge > 0 ? <View style={row.badge}><Text style={row.badgeTxt}>{badge > 99 ? "99+" : badge}</Text></View> : null}
      {right ?? <Ionicons name="chevron-forward" size={15} color={C.textMuted} />}
    </Pressable>
  );

  if (!user?.id) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <Ionicons name="person-circle-outline" size={36} color={C.primary} />
        </View>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: C.text, textAlign: "center", marginBottom: 8 }}>Sign In to View Profile</Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: C.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 28 }}>Manage your account, settings, addresses, and more — all in one place.</Text>
        <Pressable onPress={() => router.push("/auth")} style={{ backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 36, flexDirection: "row", alignItems: "center", gap: 8 }} accessibilityRole="button">
          <Ionicons name="person-circle-outline" size={18} color="#fff" />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>Sign In / Register</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <SmartRefresh
        onRefresh={onRefresh}
        lastUpdated={lastRefreshed}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={[C.primaryDark, C.primary, C.primaryLight]} start={{ x:0,y:0 }} end={{ x:1,y:1 }} style={[ph.card, { paddingTop: topPad + spacing.xl }]}>
          {/* Decorative circles */}
          <View style={[ph.blob, { width: 220, height: 220, top: -80, right: -60, opacity: 0.12 }]} />
          <View style={[ph.blob, { width: 120, height: 120, top: 20, left: -40, opacity: 0.08 }]} />
          <View style={[ph.blob, { width: 80,  height: 80,  bottom: 20, right: 40, opacity: 0.1 }]} />

          {/* Edit button top-right */}
          <Pressable onPress={() => setShowEdit(true)} style={ph.editBtn} accessibilityRole="button" accessibilityLabel="Edit profile">
            <Ionicons name="pencil" size={16} color="#fff" />
          </Pressable>

          {/* Centered avatar */}
          <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
            <View style={ph.avatarRing}>
              <View style={ph.avatar}>
                {user?.avatar
                  ? <Image
                      source={{ uri: user.avatar.startsWith("/") ? `${API.replace(/\/api$/, "")}${user.avatar}` : user.avatar }}
                      style={{ width: 80, height: 80, borderRadius: 40 }}
                    />
                  : <Text style={ph.avatarTxt}>{initials}</Text>}
              </View>
            </View>
            <Text style={ph.name}>{user?.name || "AJKMart User"}</Text>
            <Text style={ph.phone}>{user?.phone ? `+92 ${user.phone}` : user?.email || "—"}</Text>
            {user?.username ? (
              <Text style={ph.handle}>@{user.username}</Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm }}>
              <View style={[ph.roleBadge, { backgroundColor: levelInfo.bg + "33", borderColor: levelInfo.color + "55" }]}>
                <Ionicons name={levelInfo.icon} size={11} color={levelInfo.color} />
                <Text style={[ph.roleTxt, { color: levelInfo.color }]}>{levelInfo.label} Member</Text>
              </View>
              {user?.kycStatus === "verified" ? (
                <View style={[ph.roleBadge, { backgroundColor: C.success + "22", borderColor: C.success + "44" }]}>
                  <Ionicons name="checkmark-circle" size={11} color={C.success} />
                  <Text style={[ph.roleTxt, { color: C.success }]}>Verified</Text>
                </View>
              ) : (
                <View style={[ph.roleBadge, { backgroundColor: "rgba(255,255,255,0.15)", borderColor: "rgba(255,255,255,0.25)" }]}>
                  <Ionicons name="shield-outline" size={11} color="rgba(255,255,255,0.8)" />
                  <Text style={[ph.roleTxt, { color: "rgba(255,255,255,0.8)" }]}>Member</Text>
                </View>
              )}
            </View>
          </View>

          {/* Stats strip */}
          <View style={ph.statsStrip}>
            {statsLoading ? (
              <ActivityIndicator color="rgba(255,255,255,0.8)" style={{ paddingVertical: 4 }} />
            ) : statsError ? (
              <Pressable onPress={() => { setStatsLoading(true); setStatsError(false); fetchAll(); }} style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="Could not load stats, tap to retry">
                <Ionicons name="refresh-outline" size={16} color="rgba(255,255,255,0.8)" />
                <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>Tap to retry</Text>
              </Pressable>
            ) : (
              <>
                <View style={ph.stat}>
                  <Text style={ph.statVal}>{stats.orders}</Text>
                  <Text style={ph.statLbl}>{T("orders")}</Text>
                </View>
                <View style={ph.statDiv} />
                <View style={ph.stat}>
                  <Text style={ph.statVal}>{stats.rides}</Text>
                  <Text style={ph.statLbl}>{T("rides")}</Text>
                </View>
                <View style={ph.statDiv} />
                <View style={ph.stat}>
                  <Text style={ph.statVal}>Rs.{stats.spent.toLocaleString()}</Text>
                  <Text style={ph.statLbl}>{T("spentLabel")}</Text>
                </View>
              </>
            )}
          </View>
        </LinearGradient>

        <View style={lvl.strip}>
          <View style={[lvl.badge, { backgroundColor: levelInfo.bg, borderColor: levelInfo.color }]}>
            <Ionicons name={levelInfo.icon} size={16} color={levelInfo.color} />
            <Text style={[lvl.badgeTxt, { color: levelInfo.color }]}>{levelInfo.label}</Text>
          </View>
          <View style={lvl.progressWrap}>
            <View style={lvl.progressRow}>
              <Text style={lvl.progressLabel}>Profile {completionPct}%</Text>
              <Text style={lvl.progressCount}>{filledCount}/{profileFields.length}</Text>
            </View>
            <View style={lvl.progressBar}>
              <View style={[lvl.progressFill, { width: `${completionPct}%`, backgroundColor: completionPct === 100 ? C.success : C.primary }]} />
            </View>
            {completionPct < 100 && (
              <Text style={lvl.progressHint}>
                Add {profileFields.filter(f => !f.filled).map(f => f.label).join(", ")} to level up
              </Text>
            )}
          </View>
        </View>

        {user?.kycStatus !== "verified" && (
          <Pressable onPress={() => setShowEdit(true)} style={kyc.wrap} accessibilityRole="button" accessibilityLabel="Complete KYC verification">
            <View style={kyc.iconWrap}>
              <Ionicons name="document-text-outline" size={20} color={user?.kycStatus === "pending" ? C.accent : C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={kyc.title}>
                {user?.kycStatus === "pending" ? "KYC Under Review" : "Complete KYC Verification"}
              </Text>
              <Text style={kyc.sub}>
                {user?.kycStatus === "pending"
                  ? "Your CNIC is being verified — you'll be notified"
                  : "Add your CNIC to unlock Gold account & higher limits"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
          </Pressable>
        )}

        {(user?.username || user?.city || user?.area || user?.address || user?.latitude) && (
          <View style={pi.wrap}>
            <Text style={sec.title}>PERSONAL INFO</Text>
            <View style={pi.card}>
              {user?.username && (
                <View style={pi.row}>
                  <View style={[pi.iconWrap, { backgroundColor: C.primarySoft }]}><Ionicons name="at-outline" size={16} color={C.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={pi.label}>Username</Text>
                    <Text style={pi.value}>@{user.username}</Text>
                  </View>
                </View>
              )}
              {user?.city && (
                <View style={pi.row}>
                  <View style={[pi.iconWrap, { backgroundColor: C.successSoft }]}><Ionicons name="business-outline" size={16} color={C.success} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={pi.label}>City</Text>
                    <Text style={pi.value}>{user.city}</Text>
                  </View>
                </View>
              )}
              {user?.area && (
                <View style={pi.row}>
                  <View style={[pi.iconWrap, { backgroundColor: C.infoSoft }]}><Ionicons name="map-outline" size={16} color={C.info} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={pi.label}>Area / Locality</Text>
                    <Text style={pi.value}>{user.area}</Text>
                  </View>
                </View>
              )}
              {user?.address && (
                <View style={pi.row}>
                  <View style={[pi.iconWrap, { backgroundColor: C.accentSoft }]}><Ionicons name="home-outline" size={16} color={C.accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={pi.label}>Address</Text>
                    <Text style={pi.value}>{user.address}</Text>
                  </View>
                </View>
              )}
              {user?.latitude && user?.longitude && (
                <View style={pi.row}>
                  <View style={[pi.iconWrap, { backgroundColor: C.successSoft }]}><Ionicons name="navigate-outline" size={16} color={C.success} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={pi.label}>GPS Location</Text>
                    <Text style={pi.value}>{user.latitude}, {user.longitude}</Text>
                  </View>
                </View>
              )}
              {user?.cnic && (
                <View style={[pi.row, { borderBottomWidth: 0 }]}>
                  <View style={[pi.iconWrap, { backgroundColor: C.amberSoft }]}><Ionicons name="card-outline" size={16} color={C.accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={pi.label}>CNIC</Text>
                    <Text style={pi.value}>{user.cnic.replace(/(\d{5})(\d{7})(\d{1})/, "$1-$2-$3")}</Text>
                  </View>
                  {user?.kycStatus === "verified" && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.successSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.full }}>
                      <Ionicons name="checkmark-circle" size={12} color={C.success} />
                      <Text style={{ ...typography.smallMedium, color: C.success }}>Verified</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {platformConfig.features.referral && platformConfig.customer.referralEnabled && (
          <View style={rc.wrap}>
            <View style={rc.left}>
              <View style={rc.iconBox}>
                <Ionicons name="gift-outline" size={22} color={C.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={rc.title}>{T("referAndEarn")}</Text>
                <Text style={rc.sub}>Invite a friend — both of you get Rs. {platformConfig.customer.referralBonus.toLocaleString()}</Text>
                <View style={rc.codeRow}>
                  <Text style={rc.codeLabel}>Your Code:</Text>
                  <View style={rc.codePill}>
                    <Text style={rc.code}>{user?.id?.slice(-8).toUpperCase() ?? "AJKXXXX"}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {platformConfig.customer.loyaltyEnabled && (
          <View style={[rc.wrap, { borderColor: C.goldAlpha, backgroundColor: C.accentSoft }]}>
            <View style={rc.left}>
              <View style={[rc.iconBox, { backgroundColor: C.amberSoft }]}>
                <Ionicons name="star-outline" size={22} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={rc.title}>{T("loyaltyPointsLabel")}</Text>
                <Text style={rc.sub}>Earn {platformConfig.customer.loyaltyPtsPerRs100} points for every Rs. 100 spent</Text>
                <View style={rc.codeRow}>
                  <Text style={rc.codeLabel}>You can earn:</Text>
                  <View style={[rc.codePill, { backgroundColor: C.amberBorder }]}>
                    <Text style={[rc.code, { color: C.amberDark }]}>{platformConfig.customer.loyaltyPtsPerRs100} pts / Rs.100</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        <SectionCard title={T("account")}>
          <Row icon="person-outline"          label={T("editProfile")}       sub={T("editProfileSub")}            onPress={() => setShowEdit(true)} />
          <Row icon="notifications-outline"   label={T("notifications")}      sub={unread > 0 ? `${unread} ${T("notificationsSub")}` : T("noNewNotifs")} badge={unread} onPress={() => setShowNotifs(true)} iconColor={C.accent} iconBg={C.accentSoft} />
          <Row icon="shield-checkmark-outline" label={T("privacySecurity")} sub="Toggles, biometric, location"       onPress={() => setShowPrivacy(true)} iconColor={C.success} iconBg={C.successSoft}
            right={<View style={{ flexDirection:"row", alignItems:"center", gap:4 }}><View style={sec.secureBadge}><Text style={sec.secureTxt}>Secure</Text></View><Ionicons name="chevron-forward" size={15} color={C.textMuted} /></View>}
          />
        </SectionCard>

        <SectionCard title={T("myActivity")}>
          <Row icon="bag-outline"      label={T("myOrders")}        sub={`${stats.orders} ${T("ordersCount")}`}       onPress={() => router.push("/(tabs)/orders")}  iconColor={C.primary} iconBg={C.primarySoft} />
          <Row icon="bicycle-outline"  label={T("rides")}         sub={`${stats.rides} ${T("ridesCount")}`}          onPress={() => router.push("/ride")}            iconColor={C.info}   iconBg={C.infoSoft} />
          <Row icon="medkit-outline"   label={T("pharmacy")}         sub={T("medicineOrderHistory")}               onPress={() => router.push("/pharmacy")}        iconColor={C.pharmacy}   iconBg={C.pharmacyLight} />
          <Row icon="cube-outline"     label={T("parcelBookings")}  sub={T("courierHistory")}             onPress={() => router.push("/parcel")}          iconColor={C.parcel}   iconBg={C.parcelLight} />
          <Row icon="heart-outline"    label="My Wishlist"          sub="Saved favorites"                 onPress={() => router.push("/wishlist")}         iconColor={C.danger}  iconBg={C.dangerSoft} />
          <Row icon="star-outline"     label={T("myReviews")}       sub={T("customerFeedback")}           onPress={() => router.push("/my-reviews")}      iconColor={C.gold}    iconBg={C.amberBg} />
          <Row icon="location-outline" label={T("savedAddresses")}  sub={T("savedAddressesSub")}    onPress={() => setShowAddrs(true)}              iconColor={C.mart}    iconBg={C.martLight} />
        </SectionCard>

        {user?.role === "vendor" && (
          <SectionCard title="VENDOR DASHBOARD">
            <Row icon="storefront-outline" label="My Products"     sub="Manage products"       onPress={() => Linking.openURL(`https://${process.env.EXPO_PUBLIC_DOMAIN}/vendor/`)} iconColor={C.mart} iconBg={C.martLight} />
            <Row icon="analytics-outline"  label="Sales Analytics" sub="Revenue & sales"     onPress={() => Linking.openURL(`https://${process.env.EXPO_PUBLIC_DOMAIN}/vendor/`)}           iconColor={C.primary} iconBg={C.primarySoft} />
            <Row icon="receipt-outline"    label="Incoming Orders" sub="View new orders"     onPress={() => Linking.openURL(`https://${process.env.EXPO_PUBLIC_DOMAIN}/vendor/`)}    iconColor={C.accent} iconBg={C.accentSoft} />
          </SectionCard>
        )}

        <View style={[sec.wrap, { overflow: "hidden" }]}>
          <Accordion
            title={T("helpSupport")}
            icon="help-buoy-outline"
            iconColor={C.info}
            iconBg={C.infoSoft}
            headerStyle={{ paddingHorizontal: spacing.lg }}
          >
            <Row icon="call-outline"
                 label={T("contactSupport")}
                 sub={platformCfg.supportHours || `Call: ${platformCfg.supportPhone}`}
                 onPress={() => Linking.openURL(`tel:${platformCfg.supportPhone}`).catch(() => showToast(`📞 ${platformCfg.supportPhone}`, "info"))}
                 iconColor={C.textSecondary} iconBg={C.surfaceSecondary} />
            {platformCfg.supportEmail ? (
              <Row icon="mail-outline"
                   label={T("emailSupport")}
                   sub={platformCfg.supportEmail}
                   onPress={() => Linking.openURL(`mailto:${platformCfg.supportEmail}`).catch(() => showToast(platformCfg.supportEmail, "info"))}
                   iconColor={C.info} iconBg={C.infoSoft} />
            ) : null}
            {platformCfg.chat && (
              <Row icon="logo-whatsapp"
                   label={T("liveChatLabel")}
                   sub={platformCfg.supportMsg}
                   onPress={() => Linking.openURL(`https://wa.me/${platformCfg.supportPhone.replace(/^0/, "92")}`).catch(() => showToast(`📞 ${platformCfg.supportPhone}`, "info"))}
                   iconColor={C.whatsappGreen} iconBg={C.greenLightBg} />
            )}
            {(platformCfg.socialFacebook || platformCfg.socialInstagram) && (
              <Row icon="share-social-outline"
                   label={T("followUsLabel")}
                   sub={[platformCfg.socialFacebook && "Facebook", platformCfg.socialInstagram && "Instagram"].filter(Boolean).join(" • ")}
                   onPress={() => Linking.openURL(platformCfg.socialFacebook || platformCfg.socialInstagram).catch(() => {})}
                   iconColor={C.facebookBlue} iconBg={C.primarySoft} />
            )}
            {platformCfg.tncUrl ? (
              <Row icon="document-text-outline"
                   label={T("termsOfService")}
                   sub={T("termsSubLabel")}
                   onPress={() => Linking.openURL(platformCfg.tncUrl).catch(() => {})}
                   iconColor={C.textSecondary} iconBg={C.surfaceSecondary} />
            ) : (
              <Row icon="document-text-outline"
                   label={T("termsOfService")}
                   sub={T("termsSubLabel")}
                   onPress={() => showToast(`By using ${platformCfg.appName}, you agree to our terms.`, "info")}
                   iconColor={C.textSecondary} iconBg={C.surfaceSecondary} />
            )}
            {platformCfg.privacyUrl && (
              <Row icon="shield-checkmark-outline"
                   label={T("privacyPolicy")}
                   sub={T("privacySubLabel")}
                   onPress={() => Linking.openURL(platformCfg.privacyUrl).catch(() => {})}
                   iconColor={C.primary} iconBg={C.primarySoft} />
            )}
            {platformCfg.refundPolicyUrl && (
              <Row icon="return-down-back-outline"
                   label={T("refundPolicy")}
                   sub={T("refundSubLabel")}
                   onPress={() => Linking.openURL(platformCfg.refundPolicyUrl).catch(() => {})}
                   iconColor={C.success} iconBg={C.successSoft} />
            )}
            {platformCfg.faqUrl && (
              <Row icon="help-circle-outline"
                   label={T("helpFaqsLabel")}
                   sub={T("faqSubLabel")}
                   onPress={() => Linking.openURL(platformCfg.faqUrl).catch(() => {})}
                   iconColor={C.info} iconBg={C.infoSoft} />
            )}
            {platformCfg.aboutUrl && (
              <Row icon="information-circle-outline"
                   label={T("aboutUsLabel")}
                   sub={`${platformCfg.appName} ${T("aboutSubLabel")}`}
                   onPress={() => Linking.openURL(platformCfg.aboutUrl).catch(() => {})}
                   iconColor={C.parcel} iconBg={C.parcelLight} />
            )}
          </Accordion>
        </View>

        <View style={appInfo.wrap}>
          <View style={appInfo.logo}><Ionicons name="storefront" size={26} color={C.primary} /></View>
          <Text style={appInfo.name}>{platformCfg.appName}</Text>
          <Text style={appInfo.version}>v{platformCfg.appVersion} • {platformCfg.businessAddress}</Text>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}>
          <Pressable onPress={() => setShowSignOutConfirm(true)} style={signOut.btn} accessibilityRole="button" accessibilityLabel={T("signOutLabel")}>
            <Ionicons name="log-out-outline" size={20} color={C.danger} />
            <Text style={signOut.txt}>{T("signOutLabel")}</Text>
          </Pressable>
        </View>

        <View style={{ height: TAB_H + insets.bottom + 20 }} />
      </SmartRefresh>

      <EditProfileModal visible={showEdit} onClose={() => setShowEdit(false)} />
      <NotificationsModal visible={showNotifs} userId={user?.id || ""} token={token ?? undefined} onClose={count => { setUnread(count); setShowNotifs(false); }} />
      <PrivacyModal       visible={showPrivacy} userId={user?.id || ""} token={token ?? undefined} onClose={() => setShowPrivacy(false)} />
      <AddressesModal     visible={showAddrs}  userId={user?.id || ""} token={token ?? undefined} onClose={() => setShowAddrs(false)} />

      {/* Logout confirmation bottom-sheet */}
      <Modal
        visible={showSignOutConfirm}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowSignOutConfirm(false)}
      >
        <Pressable style={sheet.overlay} onPress={() => setShowSignOutConfirm(false)}>
          <Pressable style={[sheet.container, { paddingBottom: insets.bottom + 24 }]} onPress={() => {}}>
            <View style={sheet.handle} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: spacing.lg }}>
              <View style={{ width: 48, height: 48, borderRadius: radii.lg, backgroundColor: C.dangerSoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="log-out-outline" size={22} color={C.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[sheet.title, { fontSize: 17 }]}>{T("signOutConfirm")}</Text>
                <Text style={sheet.sub}>{T("signOutMsg")}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setShowSignOutConfirm(false)}
                style={btnStyles.cancel}
                accessibilityRole="button"
                accessibilityLabel={T("cancelNo")}
              >
                <Text style={btnStyles.cancelTxt}>{T("cancelNo")}</Text>
              </Pressable>
              <Pressable
                onPress={doSignOut}
                disabled={signingOut}
                style={[btnStyles.save, { backgroundColor: C.danger }, signingOut && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={T("signOutYes")}
              >
                {signingOut
                  ? <ActivityIndicator color={C.textInverse} size="small" />
                  : <Text style={btnStyles.saveTxt}>{T("signOutYes")}</Text>
                }
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const lvl = StyleSheet.create({
  strip: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: C.surface, borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, borderColor: C.borderLight, ...shadows.sm },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.full, borderWidth: 1.5 },
  badgeTxt: { ...Typ.captionBold },
  progressWrap: { flex: 1 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  progressLabel: { ...typography.captionMedium, color: C.text },
  progressCount: { fontFamily: Font.bold, fontSize: 12, color: C.primary },
  progressBar: { height: 7, backgroundColor: C.surfaceSecondary, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 7, borderRadius: 4 },
  progressHint: { ...typography.small, color: C.textMuted, marginTop: 4 },
});

const kyc = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.sm, backgroundColor: C.primarySoft, borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1, borderColor: `${C.primary}30` },
  iconWrap: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  title: { ...typography.subtitle, color: C.text, marginBottom: 2 },
  sub: { ...typography.caption, color: C.textSecondary, lineHeight: 17 },
});

const pi = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  card: { backgroundColor: C.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: C.borderLight, overflow: "hidden", ...shadows.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  iconWrap: { width: 34, height: 34, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  label: { ...typography.small, color: C.textMuted, marginBottom: 1 },
  value: { ...typography.bodyMedium, color: C.text },
});

const ph = StyleSheet.create({
  card: { paddingHorizontal: spacing.lg, paddingBottom: 0, overflow: "hidden" },
  blob: { position: "absolute", borderRadius: 999, backgroundColor: "#fff" },
  avatarRing: { width: 96, height: 96, borderRadius: 48, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md, borderWidth: 2, borderColor: "rgba(255,255,255,0.5)", ...shadows.lg },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontFamily: Font.bold, fontSize: 30, color: "#fff" },
  name: { fontFamily: Font.bold, fontSize: 20, color: "#fff", marginBottom: 3, textAlign: "center" },
  phone: { ...typography.captionMedium, color: "rgba(255,255,255,0.85)", textAlign: "center" },
  handle: { ...typography.caption, color: "rgba(255,255,255,0.7)", marginTop: 2, textAlign: "center" },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.full, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  roleTxt: { ...typography.smallMedium, color: "#fff", fontSize: 11 },
  editBtn: { position: "absolute", top: 0, right: 0, width: 38, height: 38, borderRadius: radii.md, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  statsStrip: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.15)", borderRadius: radii.xl, marginTop: spacing.sm, marginBottom: spacing.lg, paddingVertical: spacing.md },
  stat: { flex: 1, alignItems: "center" },
  statVal: { fontFamily: Font.bold, fontSize: 17, color: "#fff" },
  statLbl: { ...typography.small, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  statDiv: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.25)" },
});

const wb = StyleSheet.create({
  wrap: { marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: radii.xl, overflow: "hidden", ...shadows.md },
  grad: { flexDirection: "row", alignItems: "center", padding: spacing.lg, paddingVertical: 20 },
  iconBox: { width: 48, height: 48, borderRadius: radii.lg, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginRight: spacing.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  lbl: { ...typography.caption, color: "rgba(255,255,255,0.8)", marginBottom: 2 },
  amt: { fontFamily: Font.bold, fontSize: 22, color: "#fff" },
  btn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.full, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  btnTxt: { ...typography.captionMedium, color: "#fff" },
});

const rc = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", backgroundColor: C.infoSoft, marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1, borderColor: C.indigoBorder },
  left: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, flex: 1 },
  iconBox: { width: 44, height: 44, borderRadius: radii.lg, backgroundColor: C.indigoSoft, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  title: { ...typography.subtitle, color: C.text, marginBottom: 3 },
  sub: { ...typography.caption, color: C.textSecondary, lineHeight: 17, marginBottom: spacing.sm },
  codeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  codeLabel: { ...typography.smallMedium, color: C.textMuted },
  codePill: { backgroundColor: C.indigoBorder, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.full },
  code: { ...Typ.captionBold, color: C.info, letterSpacing: 1 },
});

const sec = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  title: { ...Typ.tiny, color: C.textMuted, letterSpacing: 1, marginBottom: 6 },
  card: { backgroundColor: C.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: C.borderLight, overflow: "hidden", ...shadows.sm },
  secureBadge: { backgroundColor: C.successSoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radii.full },
  secureTxt: { ...typography.smallMedium, color: C.success },
});

const row = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  icon: { width: 36, height: 36, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  label: { ...typography.bodyMedium, color: C.text },
  sub: { ...typography.small, color: C.textMuted, marginTop: 1 },
  badge: { backgroundColor: C.danger, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, marginRight: 4 },
  badgeTxt: { ...Typ.tiny, color: C.textInverse },
});

const appInfo = StyleSheet.create({
  wrap: { alignItems: "center", marginTop: spacing.xxxl, marginBottom: spacing.lg, gap: 6 },
  logo: { width: 56, height: 56, borderRadius: radii.xl, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center" },
  name: { ...typography.subtitle, color: C.text },
  version: { ...typography.caption, color: C.textMuted },
});

const signOut = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, backgroundColor: C.dangerSoft, borderRadius: radii.xl },
  txt: { ...typography.bodySemiBold, color: C.danger },
  confirmBox: { backgroundColor: C.surface, borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1.5, borderColor: C.dangerSoft },
  confirmTitle: { ...typography.subtitle, color: C.text },
  confirmSub: { ...typography.caption, color: C.textMuted, marginTop: 2 },
});

const sheet = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: C.overlay, justifyContent: "flex-end" },
  container: { backgroundColor: C.surface, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, paddingHorizontal: spacing.xl, paddingBottom: Platform.OS === "web" ? 40 : 48, paddingTop: spacing.md },
  handle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: "center", marginBottom: spacing.xl },
  title: { ...typography.h2, color: C.text, marginBottom: 4 },
  sub: { ...typography.caption, color: C.textMuted, marginBottom: spacing.xl },
});

const fld = StyleSheet.create({
  label: { ...typography.captionMedium, color: C.textSecondary, marginBottom: 7 },
  wrap: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: C.border, borderRadius: radii.lg, marginBottom: 6, overflow: "hidden" },
  pre: { paddingHorizontal: spacing.md, paddingVertical: 13, backgroundColor: C.surfaceSecondary, borderRightWidth: 1, borderRightColor: C.border, alignItems: "center", justifyContent: "center" },
  preTxt: { ...typography.bodySemiBold, color: C.text },
  readOnly: { flex: 1, ...typography.body, paddingHorizontal: spacing.md },
  input: { flex: 1, ...typography.body, color: C.text, paddingHorizontal: spacing.md, paddingVertical: 13 },
  lock: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md },
  lockTxt: { ...typography.small, color: C.textMuted },
  hint: { ...typography.small, color: C.textMuted, marginBottom: 4, paddingLeft: 2 },
});

const chip = StyleSheet.create({
  base: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radii.full, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  active: {},
  text: { ...typography.captionMedium, color: C.textMuted },
  textActive: {},
});

const errStyle = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.dangerSoft, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: spacing.sm, borderWidth: 1, borderColor: C.redBorder },
  txt: { ...typography.captionMedium, color: C.danger, flex: 1 },
});

const btnStyles = StyleSheet.create({
  cancel: { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: radii.lg, paddingVertical: 14, alignItems: "center" },
  cancelTxt: { ...typography.bodySemiBold, color: C.textSecondary },
  save: { flex: 2, backgroundColor: C.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: "center" },
  saveTxt: { ...typography.button, color: C.textInverse },
});

const primaryBtn = StyleSheet.create({
  base: { backgroundColor: C.primary, borderRadius: radii.lg, paddingVertical: spacing.lg, alignItems: "center", ...shadows.md },
  txt: { ...typography.button, color: C.textInverse },
});

const otpStyle = StyleSheet.create({
  input: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, ...Typ.h2, fontSize: 24, color: C.text, borderWidth: 1.5, borderColor: C.border, borderRadius: radii.lg, textAlign: "center", letterSpacing: 8 },
});

const modalHdr = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  title: { ...typography.h3, color: C.text },
  sub: { ...typography.caption, color: C.textMuted, marginTop: 2 },
  action: { backgroundColor: C.primarySoft, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radii.full },
  actionTxt: { ...typography.captionMedium, color: C.primary },
  close: { width: 34, height: 34, borderRadius: radii.md, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center" },
});

const empty = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: spacing.xxxl },
  title: { ...typography.subtitle, color: C.text },
  sub: { ...typography.caption, color: C.textMuted, textAlign: "center" },
});

const notifItem = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  unread: { backgroundColor: C.primarySoft },
  icon: { width: 42, height: 42, borderRadius: radii.md, alignItems: "center", justifyContent: "center", position: "relative", flexShrink: 0 },
  dot: { position: "absolute", top: -1, right: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: C.danger, borderWidth: 2, borderColor: C.surface },
  title: { ...typography.bodySemiBold, color: C.text, marginBottom: 2 },
  body: { ...typography.caption, color: C.textSecondary, lineHeight: 17 },
  time: { ...typography.small, color: C.textMuted, marginTop: 4 },
  del: { width: 26, height: 26, borderRadius: radii.sm, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});

const privRow = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  icon: { width: 36, height: 36, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  label: { ...typography.bodyMedium, color: C.text },
  sub: { ...typography.small, color: C.textMuted, marginTop: 1 },
});

const secHdr = StyleSheet.create({
  label: { ...typography.subtitle, color: C.text, marginBottom: spacing.sm },
});

const secCard = StyleSheet.create({
  wrap: { backgroundColor: C.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: C.borderLight, overflow: "hidden", ...shadows.sm },
});

const addrHdr = StyleSheet.create({
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md },
  addBtnTxt: { ...typography.captionMedium, color: C.textInverse },
});

const addrAdd = StyleSheet.create({
  panel: { borderBottomWidth: 1, borderBottomColor: C.borderLight, padding: spacing.lg, backgroundColor: C.surfaceSecondary },
  fld: { borderWidth: 1.5, borderColor: C.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.md, backgroundColor: C.surface },
  fldTxt: { ...typography.body, color: C.text },
});

const addrItem = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: C.surface, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: C.borderLight, ...shadows.sm },
  icon: { width: 42, height: 42, borderRadius: radii.md, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  label: { ...typography.bodySemiBold, color: C.text },
  addr: { ...typography.caption, color: C.textSecondary, marginTop: 2 },
  city: { ...typography.small, color: C.textMuted, marginTop: 1 },
  defBadge: { backgroundColor: C.successSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.full },
  defTxt: { ...typography.smallMedium, color: C.success },
  setDefBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.sm, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.blueLightBorder },
  setDefTxt: { ...typography.smallMedium, color: C.primary },
  delBtn: { width: 30, height: 30, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
});

