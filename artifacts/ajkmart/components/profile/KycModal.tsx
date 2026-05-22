import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Image, Modal, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { compressImage } from "@/lib/imageUtils";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useTheme } from "@/context/ThemeContext";
import { T as Typ } from "@/constants/typography";
import {
  spacing, radii, typography,
  API, extractApiError,
  getSharedStyles,
} from "./shared";

export function KycModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors: C } = useTheme();
  const { sheet, fld } = useMemo(() => getSharedStyles(C), [C]);
  const { user, updateUser, token } = useAuth();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState(user?.name || "");
  const [cnic, setCnic] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [city, setCity] = useState(user?.city || "");
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setFullName(user?.name || "");
      setCnic("");
      setDob("");
      setGender("");
      setCity(user?.city || "");
      setFrontUri(null);
      setBackUri(null);
      setSelfieUri(null);
      setError("");
    }
  }, [visible]);

  const formatCnic = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 13);
    if (digits.length <= 5) return digits;
    if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  };

  const formatDob = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  };

  const pickPhoto = async (setter: (uri: string) => void, label: string) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showToast("Photo library permission denied", "error"); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setter(result.assets[0].uri);
    } catch { showToast(`Could not pick ${label}`, "error"); }
  };

  const submit = async () => {
    setError("");
    if (!fullName.trim()) { setError("Full name is required"); return; }
    const digits = cnic.replace(/\D/g, "");
    if (digits.length !== 13) { setError("CNIC must be 13 digits"); return; }
    if (!dob.trim()) { setError("Date of birth is required"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) { setError("Date of birth must be YYYY-MM-DD"); return; }
    const [dobYear, dobMonth, dobDay] = dob.trim().split("-").map(Number) as [number, number, number];
    if (dobMonth < 1 || dobMonth > 12) { setError("Please enter a valid date of birth"); return; }
    if (dobDay < 1 || dobDay > 31) { setError("Please enter a valid date of birth"); return; }
    const dobDate = new Date(dobYear, dobMonth - 1, dobDay);
    if (dobDate.getFullYear() !== dobYear || dobDate.getMonth() !== dobMonth - 1 || dobDate.getDate() !== dobDay) {
      setError("Please enter a valid date of birth"); return;
    }
    const now = new Date();
    if (dobDate >= now) { setError("Date of birth cannot be in the future"); return; }
    const ageYears = (now.getFullYear() - dobYear) - (now.getMonth() < dobMonth - 1 || (now.getMonth() === dobMonth - 1 && now.getDate() < dobDay) ? 1 : 0);
    if (ageYears < 18) { setError("You must be at least 18 years old"); return; }
    if (!gender) { setError("Please select your gender"); return; }
    if (!frontUri) { setError("Front side of CNIC is required"); return; }
    if (!backUri) { setError("Back side of CNIC is required"); return; }
    if (!selfieUri) { setError("Selfie photo is required"); return; }

    setSubmitting(true);
    try {
      const frontB64 = await compressImage(frontUri, 200 * 1024);
      const backB64 = await compressImage(backUri, 200 * 1024);
      const selfieB64 = await compressImage(selfieUri, 200 * 1024);
      const res = await fetch(`${API}/kyc/submit-base64`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          cnic: digits,
          dateOfBirth: dob.trim(),
          gender,
          city: city.trim() || undefined,
          frontIdPhoto: frontB64,
          backIdPhoto: backB64,
          selfiePhoto: selfieB64,
        }),
      });
      // eslint-disable-next-line ajk-local/no-silent-catch -- error body parse failure falls back to generic message
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(extractApiError(data, "Submission failed. Please try again."));
        setSubmitting(false);
        return;
      }
      updateUser({ kycStatus: "pending" });
      showToast("KYC submitted! Our team will review within 24 hours.", "success");
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isPending = user?.kycStatus === "pending";
  const isVerified = user?.kycStatus === "verified";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} style={sheet.overlay} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[sheet.container, { maxHeight: "92%" }]} onPress={e => e.stopPropagation()}>
          <View style={sheet.handle} />
          <Text style={sheet.title}>
            {isPending ? "KYC Under Review" : isVerified ? "KYC Verified" : "Complete KYC Verification"}
          </Text>
          <Text style={sheet.sub}>
            {isPending
              ? "Your documents are being reviewed"
              : isVerified
                ? "Your identity has been verified"
                : "Submit your CNIC details to verify your identity"}
          </Text>

          {(isPending || isVerified) ? (
            <View style={{ padding: spacing.xl, alignItems: "center", gap: spacing.lg }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: isPending ? C.amberSoft : C.successSoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={isPending ? "time-outline" : "checkmark-circle"} size={36} color={isPending ? C.accent : C.success} />
              </View>
              <Text style={{ ...typography.subtitle, color: C.text, textAlign: "center" }}>
                {isPending ? "Your KYC is being processed" : "Identity Verified"}
              </Text>
              <Text style={{ ...typography.body, color: C.textSecondary, textAlign: "center", lineHeight: 22 }}>
                {isPending
                  ? "We're reviewing your submitted documents. You'll receive a notification once verification is complete (usually within 24 hours)."
                  : "Your identity has been fully verified. You have access to all features and higher transaction limits."}
              </Text>
              <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={{ backgroundColor: C.primary, paddingHorizontal: spacing.xl, paddingVertical: 14, borderRadius: radii.lg, width: "100%", alignItems: "center" }} accessibilityRole="button" accessibilityLabel="Close KYC status modal">
                <Text style={{ ...Typ.button, color: C.textInverse }}>Got it</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {!!error && (
                <View style={{ backgroundColor: C.redSoft, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: C.redMist }}>
                  <Text style={{ ...Typ.smallMedium, color: C.danger }}>{error}</Text>
                </View>
              )}

              <Text style={fld.label}>Full Name (as on CNIC)</Text>
              <View style={fld.wrap}>
                <View style={[fld.pre, { backgroundColor: C.primarySoft }]}><Ionicons name="person-outline" size={16} color={C.primary} /></View>
                <TextInput style={fld.input} value={fullName} onChangeText={setFullName} placeholder="Enter your full name" placeholderTextColor={C.textMuted} returnKeyType="next" />
              </View>

              <Text style={[fld.label, { marginTop: spacing.md }]}>CNIC Number</Text>
              <View style={fld.wrap}>
                <View style={[fld.pre, { backgroundColor: C.primarySoft }]}><Ionicons name="card-outline" size={16} color={C.primary} /></View>
                <TextInput style={fld.input} value={cnic} onChangeText={t => setCnic(formatCnic(t))} placeholder="XXXXX-XXXXXXX-X" placeholderTextColor={C.textMuted} keyboardType="numeric" maxLength={15} />
              </View>
              <Text style={fld.hint}>Format: 12345-1234567-1 (13 digits)</Text>

              <Text style={[fld.label, { marginTop: spacing.md }]}>Date of Birth</Text>
              <View style={fld.wrap}>
                <View style={[fld.pre, { backgroundColor: C.primarySoft }]}><Ionicons name="calendar-outline" size={16} color={C.primary} /></View>
                <TextInput
                  style={fld.input}
                  value={dob}
                  onChangeText={raw => setDob(formatDob(raw))}
                  placeholder="YYYY-MM-DD (e.g. 1990-06-15)"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
              {dob.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(dob) && (
                <Text style={[fld.hint, { color: C.success }]}>
                  {new Date(dob).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}
                </Text>
              )}

              <Text style={[fld.label, { marginTop: spacing.md }]}>Gender</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
                {(["male", "female"] as const).map(g => (
                  <TouchableOpacity key={g} activeOpacity={0.7} onPress={() => setGender(g)}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                      paddingVertical: 12, borderRadius: radii.lg, borderWidth: 1.5,
                      borderColor: gender === g ? C.primary : C.border,
                      backgroundColor: gender === g ? C.primarySoft : C.surface }}
                    accessibilityRole="radio" accessibilityState={{ checked: gender === g }}>
                    <Ionicons name={gender === g ? "radio-button-on" : "radio-button-off"} size={16} color={gender === g ? C.primary : C.textMuted} />
                    <Text style={{ ...Typ.bodyMedium, color: gender === g ? C.primary : C.textSecondary, textTransform: "capitalize" }}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[fld.label, { marginTop: spacing.sm }]}>City (optional)</Text>
              <View style={fld.wrap}>
                <View style={[fld.pre, { backgroundColor: C.primarySoft }]}><Ionicons name="business-outline" size={16} color={C.primary} /></View>
                <TextInput style={fld.input} value={city} onChangeText={setCity} placeholder="Your city" placeholderTextColor={C.textMuted} />
              </View>

              <Text style={[fld.label, { marginTop: spacing.md }]}>CNIC Photos</Text>
              <Text style={[fld.hint, { marginBottom: spacing.sm }]}>Provide clear photos of both sides of your CNIC and a selfie</Text>

              {([
                { label: "Front of CNIC", uri: frontUri, onPick: () => pickPhoto(setFrontUri, "front CNIC photo"), icon: "card-outline" as const },
                { label: "Back of CNIC", uri: backUri, onPick: () => pickPhoto(setBackUri, "back CNIC photo"), icon: "card-outline" as const },
                { label: "Your Selfie", uri: selfieUri, onPick: () => pickPhoto(setSelfieUri, "selfie photo"), icon: "camera-outline" as const },
              ]).map(({ label, uri, onPick, icon }) => (
                <TouchableOpacity key={label} activeOpacity={0.7} onPress={onPick}
                  style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1.5, borderStyle: uri ? "solid" : "dashed",
                    borderColor: uri ? C.primary : C.border, backgroundColor: uri ? C.primarySoft : C.surfaceSecondary, marginBottom: spacing.sm }}
                  accessibilityRole="button" accessibilityLabel={`Pick ${label}`}>
                  {uri
                    ? <Image source={{ uri }} style={{ width: 48, height: 36, borderRadius: 6, backgroundColor: C.borderLight }} resizeMode="cover" />
                    : <View style={{ width: 48, height: 36, borderRadius: 6, backgroundColor: C.borderLight, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name={icon} size={20} color={C.textMuted} />
                      </View>
                  }
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...Typ.bodyMedium, color: uri ? C.primary : C.textSecondary }}>{label}</Text>
                    <Text style={{ ...Typ.small, color: C.textMuted }}>{uri ? "Tap to change" : "Tap to select photo"}</Text>
                  </View>
                  {uri && <Ionicons name="checkmark-circle" size={18} color={C.primary} />}
                </TouchableOpacity>
              ))}

              <TouchableOpacity activeOpacity={0.7} onPress={submit} disabled={submitting}
                style={{ backgroundColor: submitting ? C.textMuted : C.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.md }}
                accessibilityRole="button" accessibilityLabel="Submit KYC verification">
                {submitting
                  ? <ActivityIndicator color={C.textInverse} />
                  : <Text style={{ ...Typ.button, color: C.textInverse }}>Submit KYC</Text>}
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
