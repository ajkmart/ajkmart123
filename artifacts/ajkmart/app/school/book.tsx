import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/utils/api";
import { useTheme } from "@/context/ThemeContext";

type Period = "weekly" | "monthly";

export default function SchoolBookScreen() {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { goBack } = useSmartBack();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { routeId, routeName } = useLocalSearchParams<{ routeId?: string; routeName?: string }>();

  const [studentName, setStudentName] = useState("");
  const [studentGrade, setStudentGrade] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [period, setPeriod] = useState<Period>("monthly");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!studentName.trim()) {
      Alert.alert("Missing Info", "Please enter the student's name.");
      return;
    }
    if (!studentGrade.trim()) {
      Alert.alert("Missing Info", "Please enter the student's grade/class.");
      return;
    }
    if (!guardianPhone.trim()) {
      Alert.alert("Missing Info", "Please enter a guardian contact number.");
      return;
    }
    if (!routeId) {
      Alert.alert("Error", "Route information is missing. Please go back and try again.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/school/book`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          routeId,
          studentName: studentName.trim(),
          studentGrade: studentGrade.trim(),
          guardianPhone: guardianPhone.trim(),
          period,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const msg: string = data?.error ?? data?.message ?? "Booking failed. Please try again.";
        Alert.alert("Booking Failed", msg);
        return;
      }

      Alert.alert(
        "Booking Submitted",
        "Your school transport request has been received. We will contact you to confirm your seat.",
        [{ text: "Done", onPress: () => router.replace("/school" as unknown as Href) }],
      );
    } catch {
      Alert.alert("Error", "Unable to submit your booking. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Book Transport</Text>
          {routeName ? <Text style={styles.headerSub}>{routeName}</Text> : null}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Student Details</Text>

          <Text style={styles.fieldLabel}>Student Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Full name of the student"
            placeholderTextColor={C.textMuted}
            value={studentName}
            onChangeText={setStudentName}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.fieldLabel}>Grade / Class</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Class 5, Grade 8"
            placeholderTextColor={C.textMuted}
            value={studentGrade}
            onChangeText={setStudentGrade}
            returnKeyType="next"
          />

          <Text style={styles.fieldLabel}>Guardian Contact Number</Text>
          <TextInput
            style={styles.input}
            placeholder="03xx-xxxxxxx"
            placeholderTextColor={C.textMuted}
            value={guardianPhone}
            onChangeText={setGuardianPhone}
            keyboardType="phone-pad"
            returnKeyType="next"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription Period</Text>
          <View style={styles.periodRow}>
            {(["weekly", "monthly"] as Period[]).map(p => (
              <TouchableOpacity
                key={p}
                activeOpacity={0.8}
                onPress={() => setPeriod(p)}
                style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              >
                <Ionicons
                  name={p === "weekly" ? "calendar-outline" : "calendar"}
                  size={18}
                  color={period === p ? "#fff" : C.textMuted}
                />
                <Text style={[styles.periodBtnText, period === p && { color: "#fff" }]}>
                  {p === "weekly" ? "Weekly" : "Monthly"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Notes (optional)</Text>
          <TextInput
            style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
            placeholder="Any special instructions or requirements…"
            placeholderTextColor={C.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleSubmit}
          disabled={submitting}
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Submit Booking</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Our team will review your request and contact you within 24 hours to confirm your seat and payment details.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontFamily: Font.bold, fontSize: 18, color: C.text },
  headerSub: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted, marginTop: 1 },
  section: {
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 8,
  },
  sectionTitle: { fontFamily: Font.bold, fontSize: 15, color: C.text, marginBottom: 4 },
  fieldLabel: { fontFamily: Font.semiBold, fontSize: 13, color: C.text },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Font.regular,
    fontSize: 14,
    color: C.text,
    backgroundColor: C.surfaceSecondary,
  },
  periodRow: { flexDirection: "row", gap: 12 },
  periodBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surfaceSecondary,
  },
  periodBtnActive: {
    backgroundColor: C.skyDark,
    borderColor: C.skyDark,
  },
  periodBtnText: { fontFamily: Font.semiBold, fontSize: 14, color: C.textMuted },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C.skyDark,
    borderRadius: 16,
    paddingVertical: 16,
  },
  submitBtnText: { fontFamily: Font.bold, fontSize: 15, color: "#fff" },
  disclaimer: {
    fontFamily: Font.regular,
    fontSize: 12,
    color: C.textMuted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
}
