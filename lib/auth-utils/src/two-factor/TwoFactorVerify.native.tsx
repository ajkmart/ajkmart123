import { useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TwoFactorVerifyProps } from "./types";

export function TwoFactorVerify({
  onVerify,
  onBackupCode,
  verifyLoading = false,
  verifyError,
  showTrustDevice = true,
  onTrustDeviceChange,
  trustDevice = false,
}: TwoFactorVerifyProps) {
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const inputRefs: (TextInput | null)[] = [];

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return;
      const newDigits = [...digits];
      newDigits[index] = value.slice(-1);
      setDigits(newDigits);

      if (value && index < 5) {
        inputRefs[index + 1]?.focus();
      }

      const fullCode = newDigits.join("");
      if (fullCode.length === 6) {
        onVerify(fullCode);
      }
    },
    [digits, onVerify]
  );

  const handleKeyPress = useCallback(
    (index: number, key: string) => {
      if (key === "Backspace" && !digits[index] && index > 0) {
        inputRefs[index - 1]?.focus();
      }
    },
    [digits]
  );

  const handleBackupSubmit = useCallback(() => {
    if (backupCode.trim()) {
      onBackupCode(backupCode.trim());
    }
  }, [backupCode, onBackupCode]);

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🔐</Text>
      </View>
      <Text style={styles.title}>Two-Factor Verification</Text>
      <Text style={styles.subtitle}>
        {useBackup
          ? "Enter one of your backup codes"
          : "Enter the code from your authenticator app"}
      </Text>

      {!useBackup ? (
        <View style={styles.digitRow}>
          {digits.map((digit, i) => (
            <TextInput
              key={i}
              ref={(el) => {
                inputRefs[i] = el;
              }}
              style={[styles.digitInput, verifyError ? styles.digitInputError : null]}
              keyboardType="number-pad"
              maxLength={1}
              value={digit}
              editable={!verifyLoading}
              onChangeText={(v) => handleDigitChange(i, v)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.backupForm}>
          <TextInput
            style={[styles.backupInput, verifyError ? styles.backupInputError : null]}
            value={backupCode}
            onChangeText={setBackupCode}
            placeholder="Enter backup code"
            editable={!verifyLoading}
            autoCapitalize="none"
          />
          <Pressable
            onPress={handleBackupSubmit}
            disabled={verifyLoading || !backupCode.trim()}
            style={[
              styles.verifyBtn,
              (verifyLoading || !backupCode.trim()) && styles.verifyBtnDisabled,
            ]}
          >
            <Text style={styles.verifyBtnText}>
              {verifyLoading ? "Verifying..." : "Verify Backup Code"}
            </Text>
          </Pressable>
        </View>
      )}

      {verifyError && <Text style={styles.errorText}>{verifyError}</Text>}
      {verifyLoading && !useBackup && <Text style={styles.loadingText}>Verifying...</Text>}

      {showTrustDevice && (
        <Pressable onPress={() => onTrustDeviceChange?.(!trustDevice)} style={styles.trustRow}>
          <View style={[styles.checkbox, trustDevice && styles.checkboxChecked]}>
            {trustDevice && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.trustText}>Trust this device for 30 days</Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => {
          setUseBackup(!useBackup);
          setBackupCode("");
          setDigits(["", "", "", "", "", ""]);
        }}
        style={styles.toggleBtn}
      >
        <Text style={styles.toggleBtnText}>
          {useBackup ? "Use authenticator app instead" : "Use a backup code"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: "center" },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#EBF5FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  icon: { fontSize: 28 },
  title: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", marginBottom: 20 },
  digitRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  digitInput: {
    width: 44,
    height: 52,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    color: "#111827",
  },
  digitInputError: { borderColor: "#EF4444" },
  backupForm: { width: "100%", marginBottom: 16 },
  backupInput: {
    width: "100%",
    padding: 12,
    fontSize: 15,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    textAlign: "center",
  },
  backupInputError: { borderColor: "#EF4444" },
  verifyBtn: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#1A56DB",
    alignItems: "center",
  },
  verifyBtnDisabled: { opacity: 0.6 },
  verifyBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  errorText: { fontSize: 13, color: "#EF4444", textAlign: "center", marginBottom: 12 },
  loadingText: { fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 12 },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    marginBottom: 16,
    width: "100%",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: "#1A56DB", borderColor: "#1A56DB" },
  checkmark: { color: "#fff", fontSize: 14, fontWeight: "700" },
  trustText: { fontSize: 13, color: "#374151" },
  toggleBtn: { padding: 10, alignItems: "center" },
  toggleBtnText: { fontSize: 13, color: "#1A56DB", fontWeight: "500" },
});
