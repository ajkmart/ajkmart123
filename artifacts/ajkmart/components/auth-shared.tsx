import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useCallback } from "react";
import {
  Animated,
  Pressable,
  TextInput,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import Colors, { spacing, radii, shadows, typography } from "@/constants/colors";

const C = Colors.light;

export function OtpDigitInput({
  value,
  onChangeText,
  length = 6,
  hasError,
  onComplete,
}: {
  value: string;
  onChangeText: (v: string) => void;
  length?: number;
  hasError?: boolean;
  onComplete?: (code: string) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const cursorAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, []);

  useEffect(() => {
    if (value.length === length && onComplete) onComplete(value);
  }, [value, length, onComplete]);

  const digits = value.split("");

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={otpS.container}
      accessibilityLabel={`Enter ${length}-digit verification code`}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={v => onChangeText(v.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        style={otpS.hidden}
        autoFocus
        caretHidden
        accessibilityLabel={`Enter ${length}-digit verification code`}
        accessibilityRole="text"
      />
      <View style={otpS.boxes}>
        {Array.from({ length }, (_, i) => {
          const isActive = i === digits.length;
          const isFilled = i < digits.length;
          return (
            <View
              key={i}
              style={[
                otpS.box,
                isActive && otpS.boxActive,
                isFilled && otpS.boxFilled,
                hasError && otpS.boxError,
              ]}
            >
              {isFilled ? (
                <Text style={otpS.digit}>{digits[i]}</Text>
              ) : isActive ? (
                <Animated.View style={[otpS.cursor, { opacity: cursorAnim }]} />
              ) : null}
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const otpS = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  hidden: { position: "absolute", opacity: 0, height: 1, width: 1 },
  boxes: { flexDirection: "row", justifyContent: "center", gap: 10 },
  box: {
    width: 48,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: C.border,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  boxActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
  boxFilled: { borderColor: C.primaryLight, backgroundColor: C.surface },
  boxError: { borderColor: C.danger, backgroundColor: C.dangerSoft },
  digit: { ...typography.otp, color: C.text },
  cursor: { width: 2, height: 24, backgroundColor: C.primary, borderRadius: 1 },
});

export function AuthButton({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "outline" | "ghost";
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;

  const handlePressIn = () => {
    if (isDisabled) return;
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, friction: 8, tension: 100 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 100 }).start();
  };

  const triggerHaptic = useCallback(async () => {
    try {
      const Haptics = await import("expo-haptics");
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  }, []);

  const handlePress = () => {
    if (isDisabled) return;
    triggerHaptic();
    onPress();
  };

  const isPrimary = variant === "primary";
  const isOutline = variant === "outline";

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={isDisabled}
        style={[
          btnS.base,
          isPrimary && btnS.primary,
          isOutline && btnS.outline,
          variant === "ghost" && btnS.ghost,
          isDisabled && btnS.disabled,
        ]}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
      >
        {loading ? (
          <ActivityIndicator color={isPrimary ? "#fff" : C.primary} size="small" />
        ) : (
          <View style={btnS.inner}>
            {icon && <Ionicons name={icon} size={20} color={isPrimary ? "#fff" : isOutline ? C.primary : C.text} style={{ marginRight: 8 }} />}
            <Text style={[btnS.text, isPrimary && btnS.textPrimary, isOutline && btnS.textOutline, variant === "ghost" && btnS.textGhost]}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const btnS = StyleSheet.create({
  base: { borderRadius: radii.lg, paddingVertical: 16, alignItems: "center", justifyContent: "center", minHeight: 52 },
  primary: { backgroundColor: C.primary, ...shadows.md },
  outline: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: C.border },
  ghost: { backgroundColor: "transparent" },
  disabled: { opacity: 0.55 },
  inner: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  text: { ...typography.button },
  textPrimary: { color: "#fff" },
  textOutline: { color: C.text },
  textGhost: { color: C.primary },
});

export function PasswordStrengthBar({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /[0-9]/.test(password) },
    { label: "Special character", ok: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const barColors = ["transparent", C.danger, C.danger, C.accent, C.success];
  const labels = ["", "Weak", "Weak", "Medium", "Strong"];

  if (!password) return null;
  return (
    <View style={pwdS.container} accessibilityLabel={`Password strength: ${labels[score] || "None"}`}>
      <View style={pwdS.bars}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[pwdS.bar, { backgroundColor: i < score ? barColors[score] : C.borderLight }]} />
        ))}
      </View>
      {score > 0 && <Text style={[pwdS.label, { color: barColors[score] }]}>{labels[score]}</Text>}
      <View style={pwdS.checks}>
        {checks.map(c => (
          <View key={c.label} style={pwdS.checkRow}>
            <Ionicons name={c.ok ? "checkmark-circle" : "ellipse-outline"} size={14} color={c.ok ? C.success : C.textMuted} />
            <Text style={[pwdS.checkText, c.ok && pwdS.checkTextOk]}>{c.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const pwdS = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  bars: { flexDirection: "row", gap: 6, marginBottom: 8 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  label: { ...typography.captionMedium, marginBottom: 6 },
  checks: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  checkText: { ...typography.caption, color: C.textMuted },
  checkTextOk: { color: C.success },
});

export function AlertBox({
  type,
  message,
  icon,
}: {
  type: "error" | "success" | "info" | "warning";
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const config = {
    error: { bg: C.dangerSoft, border: "#FECACA", color: C.danger, defaultIcon: "alert-circle-outline" as const },
    success: { bg: C.successSoft, border: "#80E6CC", color: C.success, defaultIcon: "checkmark-circle-outline" as const },
    info: { bg: C.primarySoft, border: "#B3D4FF", color: C.primary, defaultIcon: "information-circle-outline" as const },
    warning: { bg: C.accentSoft, border: "#FFD580", color: C.accent, defaultIcon: "warning-outline" as const },
  }[type];

  return (
    <View style={[alertS.box, { backgroundColor: config.bg, borderColor: config.border }]} accessibilityRole="alert">
      <Ionicons name={icon ?? config.defaultIcon} size={16} color={config.color} />
      <Text style={[alertS.text, { color: config.color }]}>{message}</Text>
    </View>
  );
}

const alertS = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12, marginBottom: spacing.md, borderWidth: 1 },
  text: { ...typography.captionMedium, flex: 1, lineHeight: 18 },
});

export function PhoneInput({
  value,
  onChangeText,
  error,
  autoFocus,
}: {
  value: string;
  onChangeText: (v: string) => void;
  error?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <View style={[phoneS.wrapper, error && phoneS.wrapperError]} accessibilityLabel="Phone number input with country code +92">
      <View style={phoneS.code}>
        <Text style={phoneS.flag}>🇵🇰</Text>
        <Text style={phoneS.codeText}>+92</Text>
      </View>
      <TextInput
        style={phoneS.input}
        value={value}
        onChangeText={v => {
          const digits = v.replace(/\D/g, "");
          const normalized = digits.replace(/^92/, "").replace(/^0/, "");
          onChangeText(normalized.slice(0, 10));
        }}
        placeholder="3XX XXX XXXX"
        placeholderTextColor={C.textMuted}
        keyboardType="phone-pad"
        maxLength={10}
        autoFocus={autoFocus}
        accessibilityLabel="Phone number"
      />
    </View>
  );
}

const phoneS = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: radii.lg,
    overflow: "hidden",
    marginBottom: spacing.md,
    backgroundColor: C.surfaceSecondary,
  },
  wrapperError: { borderColor: C.danger },
  code: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 16,
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  flag: { fontSize: 18 },
  codeText: { ...typography.subtitle, color: C.text },
  input: { flex: 1, paddingHorizontal: 16, paddingVertical: 15, ...typography.bodyMedium, color: C.text },
});

export function InputField({
  label,
  value,
  onChangeText,
  error,
  rightIcon,
  rightIconColor,
  onRightIconPress,
  containerStyle,
  ...inputProps
}: {
  label?: string;
  error?: boolean;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  rightIconColor?: string;
  onRightIconPress?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
} & TextInputProps) {
  return (
    <View style={containerStyle}>
      {label && <Text style={fieldS.label}>{label}</Text>}
      <View style={[fieldS.wrapper, error && fieldS.wrapperError, rightIcon && { paddingRight: 0 }]}>
        <TextInput
          style={[fieldS.input, rightIcon && { flex: 1 }]}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={C.textMuted}
          {...inputProps}
          accessibilityLabel={label || inputProps.placeholder}
        />
        {rightIcon && (
          <Pressable onPress={onRightIconPress} style={fieldS.iconBtn} accessibilityLabel="Toggle visibility">
            <Ionicons name={rightIcon} size={20} color={rightIconColor || C.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const fieldS = StyleSheet.create({
  label: { ...typography.captionMedium, color: C.textSecondary, marginBottom: 6 },
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: radii.lg,
    backgroundColor: C.surfaceSecondary,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  wrapperError: { borderColor: C.danger },
  input: { paddingHorizontal: 16, paddingVertical: 15, ...typography.bodyMedium, color: C.text, flex: 1 },
  iconBtn: { paddingHorizontal: 14, paddingVertical: 15 },
});

export function StepProgress({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <View style={stepS.row} accessibilityLabel={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const isDone = current > n;
        const isActive = current === n;
        return (
          <React.Fragment key={n}>
            <View style={[stepS.dot, isActive && stepS.dotActive, isDone && stepS.dotDone]}>
              {isDone ? (
                <Ionicons name="checkmark" size={13} color="#fff" />
              ) : (
                <Text style={[stepS.num, (isActive || isDone) && stepS.numActive]}>{n}</Text>
              )}
            </View>
            {n < total && <View style={[stepS.line, current > n && stepS.lineActive]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const stepS = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  dotActive: { borderColor: "#fff", backgroundColor: "rgba(255,255,255,0.2)" },
  dotDone: { backgroundColor: C.success, borderColor: C.success },
  num: { ...typography.captionMedium, color: "rgba(255,255,255,0.45)" },
  numActive: { color: "#fff" },
  line: { width: 32, height: 2, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 4 },
  lineActive: { backgroundColor: C.success },
});

export function ChannelBadge({ channel }: { channel: string }) {
  const info = {
    whatsapp: { icon: "logo-whatsapp" as const, label: "WhatsApp", color: "#25D366" },
    sms: { icon: "chatbubble-outline" as const, label: "SMS", color: C.primary },
    email: { icon: "mail-outline" as const, label: "Email", color: C.info },
  }[channel] ?? { icon: "chatbubble-outline" as const, label: channel, color: C.textMuted };

  return (
    <View style={chS.badge} accessibilityLabel={`Sent via ${info.label}`}>
      <Ionicons name={info.icon} size={14} color={info.color} />
      <Text style={[chS.text, { color: info.color }]}>via {info.label}</Text>
    </View>
  );
}

export function FallbackChannelButtons({
  channels,
  disabled,
  onSelect,
}: {
  channels: string[];
  disabled: boolean;
  onSelect: (ch: string) => void;
}) {
  if (!channels.length) return null;
  const labels: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "Email" };
  return (
    <View style={chS.fallbackRow}>
      {channels.map(ch => (
        <Pressable
          key={ch}
          onPress={() => !disabled && onSelect(ch)}
          disabled={disabled}
          style={[chS.fallbackBtn, disabled && chS.fallbackDisabled]}
          accessibilityLabel={`Send via ${labels[ch] || ch}`}
          accessibilityRole="button"
        >
          <Text style={[chS.fallbackText, disabled && { color: C.textMuted }]}>
            Try {labels[ch] || ch}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const chS = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.full, alignSelf: "flex-start", marginBottom: spacing.md },
  text: { ...typography.captionMedium },
  fallbackRow: { flexDirection: "row", gap: 8, marginBottom: spacing.md, flexWrap: "wrap" },
  fallbackBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.full, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primary + "30" },
  fallbackDisabled: { backgroundColor: C.surfaceSecondary, borderColor: C.border },
  fallbackText: { ...typography.captionMedium, color: C.primary },
});

export function DevOtpBanner({ otp }: { otp: string }) {
  if (!__DEV__ || !otp) return null;
  return (
    <View style={devS.box}>
      <Ionicons name="key-outline" size={14} color={C.success} />
      <Text style={devS.text}>
        Dev OTP: <Text style={devS.code}>{otp}</Text>
      </Text>
    </View>
  );
}

const devS = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.successSoft, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 10, marginBottom: spacing.md, borderWidth: 1, borderColor: "#80E6CC" },
  text: { ...typography.captionMedium, color: C.success, flex: 1 },
  code: { fontFamily: "Inter_700Bold", letterSpacing: 4 },
});

export function Divider({ text = "OR" }: { text?: string }) {
  return (
    <View style={divS.row} accessibilityRole="none">
      <View style={divS.line} />
      <Text style={divS.text}>{text}</Text>
      <View style={divS.line} />
    </View>
  );
}

const divS = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginVertical: spacing.xl },
  line: { flex: 1, height: 1, backgroundColor: C.border },
  text: { ...typography.captionMedium, color: C.textMuted, marginHorizontal: 14 },
});

export function SocialButton({
  provider,
  label,
  icon,
  color,
  onPress,
  disabled,
  loading,
}: {
  provider: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPressIn={() => !disabled && Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, friction: 8 }).start()}
        onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start()}
        onPress={() => !disabled && onPress()}
        disabled={disabled}
        style={[socialS.btn, disabled && socialS.btnDisabled]}
        accessibilityLabel={`Continue with ${provider}`}
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator size="small" color={C.primary} />
        ) : (
          <>
            <Ionicons name={icon} size={20} color={disabled ? C.textMuted : color} />
            <Text style={[socialS.text, disabled && { color: C.textMuted }]}>{label}</Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const socialS = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1.5, borderColor: C.border, borderRadius: radii.lg, paddingVertical: 14, marginBottom: spacing.sm },
  btnDisabled: { opacity: 0.45 },
  text: { ...typography.bodySemiBold, color: C.text },
});

export const authColors = C;
export { spacing, radii, shadows, typography };
