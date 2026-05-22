import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Image, Modal, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { useTheme } from "@/context/ThemeContext";
import { T as Typ } from "@/constants/typography";
import {
  spacing, radii, typography,
  API, unwrapApiResponse, Font,
  FALLBACK_CITIES, stripPkCode,
  getErrorMessage, extractApiError,
  getSharedStyles,
} from "./shared";

export function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors: C } = useTheme();
  const { sheet, fld, chip, errStyle, btnStyles } = useMemo(() => getSharedStyles(C), [C]);
  const { user, updateUser, token } = useAuth();
  const { showToast } = useToast();
  const { config: platformConfig } = usePlatformConfig();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [cnic, setCnic] = useState(user?.cnic || "");
  const [city, setCity] = useState(user?.city || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<{ base64: string; mimeType: string; uri: string } | null>(null);
  const [failedAvatarAsset, setFailedAvatarAsset] = useState<{ base64: string; mimeType: string; uri: string } | null>(null);
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
    }
    if (!visible) {
      setAvatarError(false);
      setCnicError("");
      setError("");
      setAvatarUri(null);
      setPendingAsset(null);
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
        // eslint-disable-next-line ajk-local/no-silent-catch -- error body parse failure falls back to generic message
        const errBody = await avatarRes.json().catch(() => ({}));
        throw new Error(extractApiError(errBody, "Avatar upload failed"));
      }
      const avatarData = unwrapApiResponse<{ avatarUrl?: string }>(await avatarRes.json());
      const avatarUrl = avatarData.avatarUrl ?? "";
      if (!avatarUrl) throw new Error("No URL returned from server");
      updateUser({ avatar: avatarUrl });
      setAvatarUri(asset.uri);
      setPendingAsset(null);
      setFailedAvatarAsset(null);
      setAvatarError(false);
      showToast("Avatar updated!", "success");
    } catch (e: unknown) {
      setAvatarError(true);
      setFailedAvatarAsset(asset);
      showToast(getErrorMessage(e, "Avatar upload failed — tap Retry"), "error");
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
    if (name.trim().length < 2) { setError("Name must be at least 2 characters"); return; }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address"); return;
    }
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
      if (!res.ok) {
        // eslint-disable-next-line ajk-local/no-silent-catch -- error body parse failure falls back to generic message
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || "Update failed");
      }
      const data = unwrapApiResponse<{ name?: string; email?: string; cnic?: string; city?: string; accountLevel?: string; kycStatus?: string; area?: string; address?: string; username?: string }>(await res.json());
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
    } catch (e: unknown) { showToast(getErrorMessage(e, "Update failed. Please try again."), "error"); }
    setSaving(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} style={sheet.overlay} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={sheet.container} onPress={e => e.stopPropagation()}>
          <View style={sheet.handle} />
          <Text style={sheet.title}>Edit Profile</Text>
          <Text style={sheet.sub}>Update your information</Text>

          <View style={{ alignSelf: "center", alignItems: "center", marginBottom: spacing.lg, gap: 8 }}>
            <TouchableOpacity activeOpacity={0.7} onPress={pickAvatar} disabled={avatarUploading} style={{ position: "relative" }} accessibilityRole="button" accessibilityLabel="Change profile photo">
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: avatarError ? C.danger : C.primary, overflow: "hidden" }}>
                {avatarUploading
                  ? <ActivityIndicator color={C.primary} />
                  : avatarUri
                    ? <Image source={{ uri: avatarUri }} style={{ width: 80, height: 80, borderRadius: 40 }} />
                    : user?.avatar
                      ? <Image source={{ uri: user?.avatar?.startsWith("/") ? `${API.replace(/\/api$/, "")}${user?.avatar}` : user?.avatar }} style={{ width: 80, height: 80, borderRadius: 40 }} />
                      : <Ionicons name="camera-outline" size={28} color={C.primary} />}
              </View>
              <View style={{ position: "absolute", bottom: 0, right: 0, backgroundColor: C.primary, borderRadius: 12, padding: 4 }}>
                <Ionicons name="pencil" size={11} color={C.textInverse} />
              </View>
            </TouchableOpacity>
            {failedAvatarAsset && (
              <TouchableOpacity activeOpacity={0.7} onPress={() => uploadAvatar(failedAvatarAsset)} disabled={avatarUploading} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.redSoft, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: C.redMist }} accessibilityRole="button" accessibilityLabel="Retry avatar upload">
                <Ionicons name="refresh-outline" size={13} color={C.danger} />
                <Text style={{ ...Typ.smallMedium, fontFamily: Font.semiBold, color: C.danger }}>Retry Upload</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={fld.label}>Phone Number</Text>
          <View style={[fld.wrap, { backgroundColor: C.surfaceSecondary }]}>
            <View style={fld.pre}><Text style={fld.preTxt}>🇵🇰 +92</Text></View>
            <Text style={[fld.readOnly, { color: C.textMuted }]}>{user?.phone ? stripPkCode(user.phone) : "—"}</Text>
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
              placeholder="Enter your name" placeholderTextColor={C.textMuted} autoCapitalize="words" maxLength={100} />
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
                  <TouchableOpacity activeOpacity={0.7} key={c} onPress={() => setCity(c)}
                    style={[chip.base, city === c && chip.active]} accessibilityRole="radio" accessibilityLabel={c} accessibilityState={{ selected: city === c }}>
                    <Text style={[chip.text, city === c && chip.textActive]}>{c}</Text>
                  </TouchableOpacity>
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
            <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={btnStyles.cancel} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={btnStyles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={save} disabled={saving} style={[btnStyles.save, saving && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Save changes" accessibilityState={{ disabled: saving }}>
              {saving ? <ActivityIndicator color={C.textInverse} size="small" /> : <Text style={btnStyles.saveTxt}>Save Changes</Text>}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
