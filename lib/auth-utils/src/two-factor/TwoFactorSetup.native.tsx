import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { TwoFactorSetupProps } from "./types";

export function TwoFactorSetup({
  qrCodeDataUrl,
  secret,
  backupCodes,
  onVerify,
  verifyLoading = false,
  verifyError,
  appName = "App",
}: TwoFactorSetupProps) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [copied, setCopied] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupsCopied, setBackupsCopied] = useState(false);
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

  const copySecret = useCallback(async () => {
    await Clipboard.setStringAsync(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [secret]);

  const copyBackupCodes = useCallback(async () => {
    await Clipboard.setStringAsync(backupCodes.join("\n"));
    setBackupsCopied(true);
    setTimeout(() => setBackupsCopied(false), 2000);
  }, [backupCodes]);

  const downloadBackupCodes = useCallback(async () => {
    const content = `${appName} Backup Codes\n${"=".repeat(30)}\n\n${backupCodes.join("\n")}\n\nKeep these codes safe. Each code can only be used once.`;
    try {
      const fileUri = `${FileSystem.cacheDirectory}backup-codes.txt`;
      await FileSystem.writeAsStringAsync(fileUri, content);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("Saved", "Backup codes saved to cache directory");
      }
    } catch {
      Alert.alert("Error", "Failed to save backup codes");
    }
  }, [backupCodes, appName]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Set Up Two-Factor Authentication</Text>
      <Text style={styles.subtitle}>
        Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
      </Text>

      <View style={styles.qrContainer}>
        <Image source={{ uri: qrCodeDataUrl }} style={styles.qrImage} resizeMode="contain" />
      </View>

      <Text style={styles.label}>Or enter this key manually:</Text>
      <View style={styles.secretRow}>
        <Text style={styles.secretText}>{secret}</Text>
        <Pressable onPress={copySecret} style={styles.copyBtn}>
          <Text style={styles.copyBtnText}>{copied ? "Copied!" : "Copy"}</Text>
        </Pressable>
      </View>

      <Text style={styles.inputLabel}>Enter the 6-digit code from your app:</Text>
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
            onChangeText={(v) => handleDigitChange(i, v)}
            onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
          />
        ))}
      </View>
      {verifyError && <Text style={styles.errorText}>{verifyError}</Text>}
      {verifyLoading && <Text style={styles.loadingText}>Verifying...</Text>}

      {backupCodes.length > 0 && (
        <View style={styles.backupSection}>
          <Pressable
            onPress={() => setShowBackupCodes(!showBackupCodes)}
            style={styles.backupToggle}
          >
            <Text style={styles.backupToggleText}>Backup Codes</Text>
            <Text style={styles.backupToggleHint}>{showBackupCodes ? "Hide" : "Show"}</Text>
          </Pressable>

          {showBackupCodes && (
            <View style={styles.backupContent}>
              <Text style={styles.backupWarning}>
                Save these codes. Each can only be used once.
              </Text>
              <View style={styles.codesGrid}>
                {backupCodes.map((bc, i) => (
                  <View key={i} style={styles.codeItem}>
                    <Text style={styles.codeText}>{bc}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.backupActions}>
                <Pressable onPress={copyBackupCodes} style={styles.actionBtn}>
                  <Text style={styles.actionBtnText}>{backupsCopied ? "Copied!" : "Copy All"}</Text>
                </Pressable>
                <Pressable onPress={downloadBackupCodes} style={styles.actionBtn}>
                  <Text style={styles.actionBtnText}>Share</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: "center" },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 20,
  },
  qrContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    marginBottom: 20,
  },
  qrImage: { width: 200, height: 200 },
  label: { fontSize: 12, color: "#6B7280", marginBottom: 6, alignSelf: "flex-start" },
  secretRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
    width: "100%",
  },
  secretText: {
    flex: 1,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
    color: "#374151",
  },
  copyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
  },
  copyBtnText: { fontSize: 12, color: "#374151" },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
    alignSelf: "flex-start",
  },
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
  errorText: { fontSize: 13, color: "#EF4444", textAlign: "center", marginBottom: 8 },
  loadingText: { fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 8 },
  backupSection: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 20,
    width: "100%",
  },
  backupToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
  },
  backupToggleText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  backupToggleHint: { fontSize: 12, color: "#9CA3AF" },
  backupContent: { marginTop: 12 },
  backupWarning: { fontSize: 12, color: "#EF4444", fontWeight: "500", marginBottom: 10 },
  codesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  codeItem: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 4,
    padding: 4,
    alignItems: "center",
  },
  codeText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    color: "#374151",
  },
  backupActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: {
    flex: 1,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  actionBtnText: { fontSize: 13, color: "#374151" },
});
