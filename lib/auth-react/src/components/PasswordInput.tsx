import { useState, type ChangeEvent } from "react";

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
}

function calcStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const map: Record<number, Omit<PasswordStrength, "score">> = {
    0: { label: "", color: "#e5e7eb" },
    1: { label: "Weak", color: "#ef4444" },
    2: { label: "Fair", color: "#f59e0b" },
    3: { label: "Strong", color: "#3b82f6" },
    4: { label: "Very strong", color: "#10b981" },
  };
  return { score: clamped, ...map[clamped]! };
}

export interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  showStrength?: boolean;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  className?: string;
  label?: string;
}

const s = {
  wrapper: { display: "flex", flexDirection: "column" as const, gap: "6px" },
  label: { fontSize: "13px", fontWeight: 600, color: "#374151" },
  inputRow: {
    display: "flex",
    alignItems: "center",
    border: "2px solid #d1d5db",
    borderRadius: "8px",
    overflow: "hidden",
    background: "#fff",
    transition: "border-color 0.15s",
  },
  input: {
    flex: 1,
    border: "none",
    outline: "none",
    padding: "12px",
    fontSize: "15px",
    background: "transparent",
    letterSpacing: "0.05em",
  },
  toggleBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "0 12px",
    color: "#9ca3af",
    fontSize: "18px",
    lineHeight: 1,
  },
  barRow: { display: "flex", gap: "4px", height: "4px" },
  bar: { flex: 1, borderRadius: "2px", background: "#e5e7eb", transition: "background 0.3s" },
  strengthLabel: { fontSize: "12px", textAlign: "right" as const },
};

export function PasswordInput({
  value,
  onChange,
  showStrength = false,
  placeholder = "Enter password",
  disabled = false,
  autoComplete = "current-password",
  className,
  label,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const strength = showStrength ? calcStrength(value) : null;

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return (
    <div style={s.wrapper} className={className}>
      {label && <label style={s.label}>{label}</label>}
      <div style={s.inputRow}>
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          style={s.input}
        />
        <button
          type="button"
          style={s.toggleBtn}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? "🙈" : "👁"}
        </button>
      </div>
      {showStrength && strength && value.length > 0 && (
        <>
          <div style={s.barRow}>
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                style={{
                  ...s.bar,
                  background: n <= strength.score ? strength.color : "#e5e7eb",
                }}
              />
            ))}
          </div>
          {strength.label && (
            <span style={{ ...s.strengthLabel, color: strength.color }}>{strength.label}</span>
          )}
        </>
      )}
    </div>
  );
}
