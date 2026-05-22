import React, { useMemo, useState } from "react";
import {
  ActivityIndicator, Modal, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useTheme } from "@/context/ThemeContext";
import { T as Typ } from "@/constants/typography";
import {
  spacing, radii, typography, Font,
  API, getErrorMessage, getSharedStyles,
} from "./shared";

export function DeleteAccountRow({ token }: { token?: string }) {
  const { colors: C } = useTheme();
  const { privRow, sheet } = useMemo(() => getSharedStyles(C), [C]);
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
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      if (!res.ok) {
        // eslint-disable-next-line ajk-local/no-silent-catch -- error body parse failure falls back to generic message
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Could not delete account");
      }
      showToast("Account deleted successfully", "success");
      await logout();
    } catch (e: unknown) {
      showToast(getErrorMessage(e, "Could not delete account. Please try again."), "error");
    }
    setDeleting(false);
    setConfirmVisible(false);
    setConfirmText("");
  };

  return (
    <>
      <TouchableOpacity activeOpacity={0.7}
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
      </TouchableOpacity>

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
            <TouchableOpacity activeOpacity={0.7}
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
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => { setConfirmVisible(false); setConfirmText(""); }}
              style={{ borderRadius: radii.md, paddingVertical: spacing.md, alignItems: "center", backgroundColor: C.surfaceSecondary }}
            >
              <Text style={{ ...Typ.button, color: C.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
