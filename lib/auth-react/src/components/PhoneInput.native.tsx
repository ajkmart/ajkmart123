import { StyleSheet, Text, TextInput, View } from "react-native";

export interface Country {
  code: string;
  dial: string;
  name: string;
  flag: string;
}

export interface PhoneInputProps {
  value: string;
  onChangeText?: (localNumber: string) => void;
  onChange?: (e164: string, local: string, country: Country) => void;
  defaultCountryCode?: string;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
}

const DEFAULT_COUNTRY: Country = {
  code: "PK",
  dial: "+92",
  name: "Pakistan",
  flag: "🇵🇰",
};

function toE164(dial: string, local: string): string {
  const digits = local.replace(/\D/g, "");
  const trimmed = digits.startsWith("0") ? digits.slice(1) : digits;
  return `${dial}${trimmed}`;
}

/**
 * Strip any country-code prefix the user may have typed/pasted.
 * Returns only subscriber digits (max 10 for Pakistani numbers after 0 removal).
 */
function stripDialPrefix(raw: string, dial: string): string {
  let s = raw.trim();
  const dialDigits = dial.replace(/\D/g, ""); // e.g. "92"

  // "+92XXXX" or "+1XXXX" style
  if (s.startsWith("+")) {
    s = s.slice(1);
    if (s.startsWith(dialDigits)) s = s.slice(dialDigits.length);
  }

  // "0092XXXX" style
  if (s.startsWith("00") && s.slice(2).startsWith(dialDigits)) {
    s = s.slice(2 + dialDigits.length);
  }

  // Keep only digits
  return s.replace(/\D/g, "");
}

export function PhoneInput({
  value,
  onChangeText,
  onChange,
  disabled = false,
  placeholder = "3001234567",
  autoFocus = false,
}: PhoneInputProps) {
  const country = DEFAULT_COUNTRY;

  function handleChange(raw: string) {
    // Strip dial prefix in case user pastes/types the full international number
    const clean = stripDialPrefix(raw, country.dial).slice(0, 10);
    onChangeText?.(clean);
    onChange?.(toE164(country.dial, clean), clean, country);
  }

  return (
    <View style={[styles.wrapper, disabled && styles.wrapperDisabled]}>
      <View style={styles.codeBox}>
        <Text style={styles.flag}>{country.flag}</Text>
        <Text style={styles.dialCode}>{country.dial}</Text>
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        keyboardType="phone-pad"
        maxLength={10}
        editable={!disabled}
        autoFocus={autoFocus}
        accessibilityLabel="Phone number"
        autoComplete="tel-national"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#f9fafb",
  },
  wrapperDisabled: { opacity: 0.55 },
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
  },
  flag: { fontSize: 18 },
  dialCode: { fontSize: 15, fontWeight: "600", color: "#111827" },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: "#111827",
  },
});
