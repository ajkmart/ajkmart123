import { useAuthTheme } from "../context/ThemeContext";

export interface ApprovalOverlayProps {
  title?: string;
  message?: string;
  status?: "pending" | "rejected" | "maintenance";
  actionLabel?: string;
  onActionPress?: () => void;
  className?: string;
}

export function ApprovalOverlay({
  title,
  message,
  status = "pending",
  actionLabel,
  onActionPress,
  className,
}: ApprovalOverlayProps) {
  const theme = useAuthTheme();
  const background =
    status === "rejected"
      ? theme.rejectedOverlay
      : status === "maintenance"
        ? theme.maintenanceOverlay
        : theme.pendingOverlay;

  return (
    <div
      className={className}
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background,
        color: theme.text,
      }}
    >
      <div
        style={{
          maxWidth: "460px",
          width: "100%",
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: "20px",
          padding: "28px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "44px", marginBottom: "14px" }}>
          {status === "rejected" ? "⛔" : status === "maintenance" ? "🛠️" : "⏳"}
        </div>
        <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 800 }}>
          {title ??
            (status === "rejected"
              ? "Access rejected"
              : status === "maintenance"
                ? "Maintenance in progress"
                : "Awaiting approval")}
        </h2>
        <p
          style={{ margin: "10px 0 0", color: theme.textMuted, fontSize: "14px", lineHeight: 1.6 }}
        >
          {message ??
            (status === "rejected"
              ? "Your account is not approved yet."
              : status === "maintenance"
                ? "This section is temporarily unavailable."
                : "Your account is pending review.")}
        </p>
        {actionLabel && onActionPress && (
          <button
            type="button"
            onClick={onActionPress}
            style={{
              marginTop: "18px",
              width: "100%",
              border: "none",
              borderRadius: "12px",
              padding: "12px 16px",
              background: theme.primary,
              color: theme.onPrimary,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
