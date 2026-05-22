import { useAuthTheme } from "../context/ThemeContext";

export type LoginMethod = "phone" | "password" | "google" | "facebook" | "biometric" | "magic-link";

export interface MethodSelectorItem {
  key: LoginMethod | string;
  label: string;
  description?: string;
  active?: boolean;
  disabled?: boolean;
}

export interface MethodSelectorProps {
  methods: MethodSelectorItem[];
  onSelect: (method: LoginMethod | string) => void;
  className?: string;
}

export function MethodSelector({ methods, onSelect, className }: MethodSelectorProps) {
  const theme = useAuthTheme();

  return (
    <div className={className} style={{ display: "grid", gap: "10px" }}>
      {methods.map((method) => (
        <button
          key={method.key}
          type="button"
          disabled={method.disabled}
          onClick={() => onSelect(method.key)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "4px",
            width: "100%",
            padding: "14px 16px",
            borderRadius: "14px",
            border: `1px solid ${method.active ? theme.primary : theme.border}`,
            background: method.active ? theme.primaryLight : theme.surface,
            color: theme.text,
            textAlign: "left",
            cursor: method.disabled ? "not-allowed" : "pointer",
            opacity: method.disabled ? 0.55 : 1,
          }}
        >
          <span style={{ fontSize: "15px", fontWeight: 700 }}>{method.label}</span>
          {method.description && (
            <span style={{ fontSize: "13px", color: theme.textMuted, lineHeight: 1.4 }}>
              {method.description}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
