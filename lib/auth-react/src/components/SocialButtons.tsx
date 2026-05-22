import { useEffect } from "react";

export interface SocialButtonsProps {
  onGoogle?: () => void;
  onFacebook?: () => void;
  googleLoading?: boolean;
  facebookLoading?: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
}

const s = {
  wrapper: { display: "flex", flexDirection: "column" as const, gap: "10px" },
  dividerRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    margin: "4px 0",
  },
  dividerLine: { flex: 1, height: "1px", background: "#e5e7eb" },
  dividerText: { fontSize: "12px", color: "#9ca3af", whiteSpace: "nowrap" as const },
  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    padding: "11px 16px",
    borderRadius: "8px",
    border: "2px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 600,
    color: "#374151",
    transition: "border-color 0.15s, background 0.15s",
    width: "100%",
  },
  btnDisabled: { opacity: 0.55, cursor: "not-allowed" },
  fbBtn: { background: "#1877f2", border: "2px solid #1877f2", color: "#fff" },
  spinner: {
    width: "16px",
    height: "16px",
    border: "2px solid #d1d5db",
    borderTopColor: "#f59e0b",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    display: "inline-block",
  },
};

let _spinKeyframeInjected = false;

function ensureSpinKeyframe() {
  if (_spinKeyframeInjected) return;
  if (typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(style);
  _spinKeyframeInjected = true;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#fff"
        d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.932-1.956 1.886v2.283h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
      />
    </svg>
  );
}

function Spinner() {
  return <span style={s.spinner} aria-hidden="true" />;
}

export function SocialButtons({
  onGoogle,
  onFacebook,
  googleLoading = false,
  facebookLoading = false,
  disabled = false,
  className,
  label = "Or continue with",
}: SocialButtonsProps) {
  useEffect(() => {
    ensureSpinKeyframe();
  }, []);

  const isDisabled = disabled || googleLoading || facebookLoading;

  return (
    <div style={s.wrapper} className={className}>
      <div style={s.dividerRow}>
        <span style={s.dividerLine} />
        <span style={s.dividerText}>{label}</span>
        <span style={s.dividerLine} />
      </div>
      {onGoogle && (
        <button
          type="button"
          style={{ ...s.btn, ...(isDisabled ? s.btnDisabled : {}) }}
          onClick={onGoogle}
          disabled={isDisabled}
          aria-label="Sign in with Google"
        >
          {googleLoading ? <Spinner /> : <GoogleIcon />}
          Sign in with Google
        </button>
      )}
      {onFacebook && (
        <button
          type="button"
          style={{ ...s.btn, ...s.fbBtn, ...(isDisabled ? s.btnDisabled : {}) }}
          onClick={onFacebook}
          disabled={isDisabled}
          aria-label="Sign in with Facebook"
        >
          {facebookLoading ? <Spinner /> : <FacebookIcon />}
          Sign in with Facebook
        </button>
      )}
    </div>
  );
}
