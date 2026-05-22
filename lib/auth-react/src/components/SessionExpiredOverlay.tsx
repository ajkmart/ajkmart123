import { useAuthTheme } from "../context/ThemeContext";

export interface SessionExpiredOverlayProps {
  onLoginPress?: () => void;
  onRetryPress?: () => void;
  className?: string;
}

export function SessionExpiredOverlay({
  onLoginPress,
  onRetryPress,
  className,
}: SessionExpiredOverlayProps) {
  const theme = useAuthTheme();

  return (
    <div
      className={className}
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: theme.background,
      }}
    >
      <div
        style={{
          maxWidth: "420px",
          width: "100%",
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: "20px",
          padding: "28px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "44px", marginBottom: "14px" }}>🔐</div>
        <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 800, color: theme.text }}>
          Session expired
        </h2>
        <p
          style={{ margin: "10px 0 0", color: theme.textMuted, fontSize: "14px", lineHeight: 1.6 }}
        >
          Please sign in again to continue.
        </p>
        <div style={{ display: "grid", gap: "10px", marginTop: "18px" }}>
          {onLoginPress && (
            <button
              type="button"
              onClick={onLoginPress}
              style={{
                border: "none",
                borderRadius: "12px",
                padding: "12px 16px",
                background: theme.primary,
                color: theme.onPrimary,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Sign in
            </button>
          )}
          {onRetryPress && (
            <button
              type="button"
              onClick={onRetryPress}
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: "12px",
                padding: "12px 16px",
                background: theme.surface,
                color: theme.text,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
