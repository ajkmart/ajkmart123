import { useEffect, useRef, useState, type ChangeEvent } from "react";

export interface Country {
  code: string; // e.g. 'PK'
  dial: string; // e.g. '+92'
  name: string;
  flag: string;
}

export const DEFAULT_COUNTRIES: Country[] = [
  { code: "PK", dial: "+92", name: "Pakistan", flag: "🇵🇰" },
  { code: "AJ", dial: "+92", name: "AJK (Pakistan)", flag: "🏔️" },
  { code: "PKG", dial: "+92", name: "Gilgit-Baltistan", flag: "🏔️" },
  { code: "US", dial: "+1", name: "United States", flag: "🇺🇸" },
  { code: "GB", dial: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "AE", dial: "+971", name: "UAE", flag: "🇦🇪" },
  { code: "SA", dial: "+966", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "IN", dial: "+91", name: "India", flag: "🇮🇳" },
  { code: "AF", dial: "+93", name: "Afghanistan", flag: "🇦🇫" },
];

export interface PhoneInputProps {
  value: string;
  onChange: (e164: string, local: string, country: Country) => void;
  countries?: Country[];
  defaultCountryCode?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const s = {
  wrapper: {
    display: "flex",
    border: "2px solid #d1d5db",
    borderRadius: "8px",
    overflow: "hidden",
    transition: "border-color 0.15s",
    background: "#fff",
  },
  select: {
    border: "none",
    outline: "none",
    background: "#f9fafb",
    padding: "0 8px",
    fontSize: "15px",
    cursor: "pointer",
    borderRight: "1px solid #e5e7eb",
    minWidth: "80px",
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
  },
  input: {
    flex: 1,
    border: "none",
    outline: "none",
    padding: "12px",
    fontSize: "15px",
    background: "transparent",
  },
};

function toE164(dial: string, local: string): string {
  const digits = local.replace(/\D/g, "");
  const trimmed = digits.startsWith("0") ? digits.slice(1) : digits;
  return `${dial}${trimmed}`;
}

/**
 * Given an e164 string (e.g. "+923001234567") and a dial code (e.g. "+92"),
 * returns just the local subscriber digits (e.g. "3001234567").
 * Falls back to returning the raw string (stripped of leading +) if dial code
 * doesn't match, so the input never shows the country prefix.
 */
function e164ToLocal(e164: string, dial: string): string {
  if (!e164) return "";
  const dialDigits = dial.replace(/\D/g, "");
  const stripped = e164.replace(/^\+/, "");
  if (stripped.startsWith(dialDigits)) {
    return stripped.slice(dialDigits.length);
  }
  return stripped;
}

/**
 * Strip a country-code prefix the user may have typed or pasted into the
 * local-number field (e.g. "+92300..." or "0092300...").
 * Returns only the subscriber digits, spaces, dashes, and parentheses.
 */
function stripDialPrefix(raw: string, dial: string): string {
  let s = raw.trim();

  // "+92XXXX" → strip leading "+" then dial digits
  const dialDigits = dial.replace(/\D/g, "");
  if (s.startsWith("+")) {
    s = s.slice(1);
    if (s.startsWith(dialDigits)) s = s.slice(dialDigits.length);
  }

  // "0092XXXX" → strip leading "00" then dial digits
  if (s.startsWith("00") && s.slice(2).startsWith(dialDigits)) {
    s = s.slice(2 + dialDigits.length);
  }

  // Only keep digits, spaces, dashes, parentheses
  return s.replace(/[^\d\s\-()]/g, "");
}

export function PhoneInput({
  value,
  onChange,
  countries = DEFAULT_COUNTRIES,
  defaultCountryCode = "PK",
  disabled = false,
  placeholder = "300 1234567",
  className,
}: PhoneInputProps) {
  const [selectedCode, setSelectedCode] = useState(defaultCountryCode);

  const country = countries.find((c) => c.code === selectedCode) ?? countries[0]!;

  // Derive initial local number from e164 value prop
  const [localNumber, setLocalNumber] = useState(() => e164ToLocal(value ?? "", country.dial));

  // Track whether the last change came from user input so we don't
  // overwrite the controlled input during the onChange → value feedback loop.
  const userChangingRef = useRef(false);

  useEffect(() => {
    if (userChangingRef.current) {
      userChangingRef.current = false;
      return;
    }
    // External value change (e.g. form reset) — re-derive local from e164
    setLocalNumber(e164ToLocal(value ?? "", country.dial));
  }, [value, country.dial]);

  function handleCountryChange(e: ChangeEvent<HTMLSelectElement>) {
    const c = countries.find((x) => x.code === e.target.value) ?? countries[0]!;
    setSelectedCode(c.code);
    userChangingRef.current = true;
    onChange(toE164(c.dial, localNumber), localNumber, c);
  }

  function handleNumberChange(e: ChangeEvent<HTMLInputElement>) {
    // Strip any country code prefix the user may have typed/pasted
    const local = stripDialPrefix(e.target.value, country.dial);
    setLocalNumber(local);
    userChangingRef.current = true;
    onChange(toE164(country.dial, local), local, country);
  }

  return (
    <div style={s.wrapper} className={className}>
      <select
        value={selectedCode}
        onChange={handleCountryChange}
        disabled={disabled}
        style={s.select}
        aria-label="Country code"
      >
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.dial}
          </option>
        ))}
      </select>
      <input
        type="tel"
        value={localNumber}
        onChange={handleNumberChange}
        disabled={disabled}
        placeholder={placeholder}
        style={s.input}
        aria-label="Phone number"
        autoComplete="tel-national"
      />
    </div>
  );
}
