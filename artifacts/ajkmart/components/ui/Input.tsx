import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import Colors, { radii, typography } from "@/constants/colors";

const C = Colors.light;

interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  leftElement?: React.ReactNode;
  isPassword?: boolean;
}

export function Input({
  label,
  hint,
  error,
  leftIcon,
  leftElement,
  isPassword,
  style,
  ...props
}: InputProps) {
  const [showPwd, setShowPwd] = useState(false);
  const hasError = !!error;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          hasError && styles.inputError,
        ]}
      >
        {leftElement && <View style={styles.leftElement}>{leftElement}</View>}
        {leftIcon && !leftElement && (
          <View style={styles.leftIconWrap}>
            <Ionicons name={leftIcon} size={18} color={hasError ? C.danger : C.textMuted} />
          </View>
        )}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={C.textMuted}
          secureTextEntry={isPassword && !showPwd}
          {...props}
        />
        {isPassword && (
          <Pressable onPress={() => setShowPwd(v => !v)} style={styles.eyeBtn}>
            <Ionicons
              name={showPwd ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={C.textMuted}
            />
          </Pressable>
        )}
      </View>
      {error && (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={13} color={C.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  label: { ...typography.captionMedium, color: C.textSecondary, marginBottom: 6 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: radii.lg,
    backgroundColor: C.surfaceSecondary,
    overflow: "hidden",
  },
  inputError: {
    borderColor: C.danger,
    backgroundColor: C.dangerSoft,
  },
  leftElement: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  leftIconWrap: {
    paddingLeft: 14,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...typography.bodyMedium,
    color: C.text,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingLeft: 2,
  },
  errorText: { ...typography.small, color: C.danger },
  hint: { ...typography.small, color: C.textMuted, marginTop: 4, paddingLeft: 2 },
});
