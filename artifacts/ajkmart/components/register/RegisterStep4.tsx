import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { authColors as C, InputField, PasswordStrengthBar } from "@/components/auth-shared";
import { s } from "./registerStyles";

export interface RegisterStep4Props {
  cnic: string;
  setCnic: (v: string) => void;
  formatCnic: (v: string) => string;
  password: string;
  setPassword: (v: string) => void;
  showPwd: boolean;
  setShowPwd: (fn: (v: boolean) => boolean) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  showConfirmPwd: boolean;
  setShowConfirmPwd: (fn: (v: boolean) => boolean) => void;
  termsAccepted: boolean;
  setTermsAccepted: (v: boolean) => void;
  error: string;
  clearError: () => void;
}

export function RegisterStep4({
  cnic, setCnic, formatCnic,
  password, setPassword, showPwd, setShowPwd,
  confirmPassword, setConfirmPassword, showConfirmPwd, setShowConfirmPwd,
  termsAccepted, setTermsAccepted,
  error, clearError,
}: RegisterStep4Props) {
  return (
    <>
      <View>
        <Text style={s.fieldLabel}>CNIC / National ID</Text>
        <InputField
          value={cnic}
          onChangeText={v => { setCnic(formatCnic(v)); clearError(); }}
          placeholder="XXXXX-XXXXXXX-X"
          keyboardType="numeric"
          maxLength={15}
          error={!!error && !!cnic && !/^\d{5}-\d{7}-\d{1}$/.test(cnic)}
        />
        <Text style={s.fieldHint}>Optional — for KYC verification and Gold account</Text>
      </View>

      <InputField
        label="Password *"
        value={password}
        onChangeText={v => { setPassword(v); clearError(); }}
        placeholder="Minimum 8 characters"
        secureTextEntry={!showPwd}
        rightIcon={showPwd ? "eye-off-outline" : "eye-outline"}
        onRightIconPress={() => setShowPwd(v => !v)}
      />
      <PasswordStrengthBar password={password} />

      <InputField
        label="Confirm Password *"
        value={confirmPassword}
        onChangeText={v => { setConfirmPassword(v); clearError(); }}
        placeholder="Re-enter your password"
        secureTextEntry={!showConfirmPwd}
        rightIcon={showConfirmPwd ? "eye-off-outline" : "eye-outline"}
        onRightIconPress={() => setShowConfirmPwd(v => !v)}
        error={!!confirmPassword && password !== confirmPassword}
      />
      {!!confirmPassword && password !== confirmPassword && (
        <Text style={s.mismatchText}>Passwords do not match</Text>
      )}

      <TouchableOpacity activeOpacity={0.7}
        onPress={() => setTermsAccepted(!termsAccepted)}
        style={s.termsRow}
        accessibilityLabel="Accept Terms and Conditions"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: termsAccepted }}
      >
        <View style={[s.checkbox, termsAccepted && s.checkboxChecked]}>
          {termsAccepted && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <Text style={s.termsText}>
          I agree to the <Text style={{ color: C.primary }}>Terms & Conditions</Text> and{" "}
          <Text style={{ color: C.primary }}>Privacy Policy</Text>
        </Text>
      </TouchableOpacity>
    </>
  );
}
