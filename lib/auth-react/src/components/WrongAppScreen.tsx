import { useAuthTheme } from "../context/ThemeContext";

export interface WrongAppScreenProps {
  /** Name of the app the user is currently in (wrong one). */
  appName: string;
  /** Name of the app the user should be using instead. */
  correctAppName: string;
  /** Deep-link or URL to redirect the user to the correct app. */
  redirectUrl?: string;
  /** @deprecated Use appName / correctAppName / redirectUrl */
  expectedApp?: string;
  /** @deprecated Use appName */
  currentApp?: string;
  /** @deprecated Use redirectUrl */
  onSwitchPress?: () => void;
  className?: string;
}

export function WrongAppScreen({
  appName,
  correctAppName,
  redirectUrl,
  expectedApp,
  currentApp,
  onSwitchPress,
  className,
}: WrongAppScreenProps) {
  const theme = useAuthTheme();

  const displayCorrect = correctAppName || expectedApp;
  const displayCurrent = appName || currentApp;

  function handleSwitch() {
    if (redirectUrl) {
      window.location.href = redirectUrl;
    } else {
      onSwitchPress?.();
    }
  }

  const showButton = !!(redirectUrl || onSwitchPress);

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
          maxWidth: "440px",
          width: "100%",
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: "20px",
          padding: "28px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "44px", marginBottom: "14px" }}>📱</div>
        <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 800, color: theme.text }}>
          Wrong app
        </h2>
        <p
          style={{ margin: "10px 0 0", color: theme.textMuted, fontSize: "14px", lineHeight: 1.6 }}
        >
          {displayCorrect
            ? `Please use ${displayCorrect} instead.`
            : "Please open this link in the correct app."}
          {displayCurrent ? ` You are currently in ${displayCurrent}.` : ""}
        </p>
        {showButton && (
          <button
            type="button"
            onClick={handleSwitch}
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
            Switch to {displayCorrect ?? "correct app"}
          </button>
        )}
      </div>
    </div>
  );
}
