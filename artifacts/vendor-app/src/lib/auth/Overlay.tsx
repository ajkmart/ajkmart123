/**
 * Overlay.tsx — vendor-app
 *
 * Full-screen overlay screens shown during auth state transitions:
 *   PendingOverlay      — account awaiting admin approval
 *   RejectedOverlay     — account application was rejected
 *   MaintenanceOverlay  — platform in maintenance mode
 *   BiometricPromptOverlay — offer biometric enrollment after first login
 *
 * All colors come from useTheme() so they stay in sync with vendorTheme.
 * Uses inline styles (no Tailwind dependency) for portability.
 */
import React from "react";
import { useTheme } from "./ThemeContext";

function OverlayShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(135deg, ${theme.background} 0%, ${theme.primaryLight} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 20,
        padding: "32px 28px",
        boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
      }}
    >
      {children}
    </div>
  );
}

function IconCircle({
  color,
  bg,
  children,
}: {
  color: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: 72,
        height: 72,
        borderRadius: 18,
        background: bg,
        border: `2px solid ${color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto 20px",
      }}
    >
      {children}
    </div>
  );
}

/* ── PendingOverlay ────────────────────────────────────────────────────── */
export function PendingOverlay({
  appName = "store",
  onBack,
}: {
  appName?: string;
  onBack?: () => void;
}) {
  const theme = useTheme();
  return (
    <OverlayShell>
      <Card>
        <div style={{ textAlign: "center" }}>
          <IconCircle color={`${theme.primary}50`} bg={`${theme.primary}15`}>
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.primary}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </IconCircle>

          <h2 style={{ color: theme.text, fontSize: 22, fontWeight: 800, margin: "0 0 10px" }}>
            Application Under Review
          </h2>
          <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.65, margin: "0 0 20px" }}>
            Your {appName} application is being reviewed. You'll be notified once it's approved.
          </p>

          <div
            style={{
              background: `${theme.primary}12`,
              border: `1px solid ${theme.primary}30`,
              borderRadius: 12,
              padding: "10px 16px",
              marginBottom: 20,
            }}
          >
            <p style={{ color: theme.primary, fontSize: 13, fontWeight: 600, margin: 0 }}>
              ⏱ Typical review time: 24–48 hours
            </p>
          </div>

          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: theme.primary,
                color: theme.surface,
                border: "none",
                borderRadius: 12,
                padding: "12px 20px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                width: "100%",
              }}
            >
              Back to Login
            </button>
          )}
        </div>
      </Card>
    </OverlayShell>
  );
}

/* ── RejectedOverlay ───────────────────────────────────────────────────── */
export function RejectedOverlay({
  reason,
  onBack,
}: {
  reason?: string | null;
  onBack?: () => void;
}) {
  const theme = useTheme();
  return (
    <OverlayShell>
      <Card>
        <div style={{ textAlign: "center" }}>
          <IconCircle color="rgba(239,68,68,0.4)" bg="rgba(239,68,68,0.10)">
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.error ?? "#ef4444"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </IconCircle>

          <h2 style={{ color: theme.text, fontSize: 22, fontWeight: 800, margin: "0 0 10px" }}>
            Application Not Approved
          </h2>
          <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.65, margin: "0 0 16px" }}>
            We're unable to approve your application at this time.
          </p>

          {reason && (
            <div
              style={{
                background: theme.rejectedOverlay,
                border: `1px solid rgba(239,68,68,0.3)`,
                borderRadius: 10,
                padding: "10px 14px",
                marginBottom: 20,
                textAlign: "left",
              }}
            >
              <p
                style={{
                  color: theme.error ?? "#dc2626",
                  fontSize: 13,
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {reason}
              </p>
            </div>
          )}

          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: theme.rejectedOverlay,
                color: theme.error ?? "#dc2626",
                border: `1px solid rgba(239,68,68,0.3)`,
                borderRadius: 12,
                padding: "12px 20px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                width: "100%",
              }}
            >
              Back to Login
            </button>
          )}
        </div>
      </Card>
    </OverlayShell>
  );
}

/* ── MaintenanceOverlay ────────────────────────────────────────────────── */
export function MaintenanceOverlay({
  message,
  supportPhone,
  supportEmail,
}: {
  message?: string;
  supportPhone?: string;
  supportEmail?: string;
}) {
  const theme = useTheme();
  return (
    <OverlayShell>
      <Card>
        <div style={{ textAlign: "center" }}>
          <IconCircle color={`${theme.primary}50`} bg={`${theme.primary}15`}>
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.primary}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </IconCircle>

          <h2 style={{ color: theme.text, fontSize: 22, fontWeight: 800, margin: "0 0 10px" }}>
            Under Maintenance
          </h2>
          <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.65, margin: "0 0 20px" }}>
            {message ?? "We're making improvements to serve you better. We'll be back shortly!"}
          </p>

          {(supportPhone || supportEmail) && (
            <div
              style={{
                background: theme.background,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                padding: "12px 16px",
                textAlign: "left",
              }}
            >
              <p
                style={{
                  color: theme.primary,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  margin: "0 0 8px",
                }}
              >
                Need Help?
              </p>
              {supportPhone && (
                <p style={{ color: theme.text, fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
                  📞 {supportPhone}
                </p>
              )}
              {supportEmail && (
                <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>{supportEmail}</p>
              )}
            </div>
          )}
        </div>
      </Card>
    </OverlayShell>
  );
}

/* ── BiometricPromptOverlay ────────────────────────────────────────────── */
export function BiometricPromptOverlay({
  onAccept,
  onDecline,
  loading,
}: {
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}) {
  const theme = useTheme();
  return (
    <OverlayShell>
      <Card>
        <div style={{ textAlign: "center" }}>
          <IconCircle color={`${theme.primary}50`} bg={`${theme.primary}15`}>
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.primary}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 10a2 2 0 0 0-2 2c0 1.02.5 1.96 1.34 2.53a.5.5 0 0 1 .16.58L10.5 18h3l-1-2.89a.5.5 0 0 1 .16-.58A2.5 2.5 0 0 0 14 12a2 2 0 0 0-2-2z" />
              <path d="M12 4C9.38 4 6 5.55 6 9v3a6 6 0 0 0 12 0V9c0-3.45-3.38-5-6-5z" />
            </svg>
          </IconCircle>

          <h2 style={{ color: theme.text, fontSize: 22, fontWeight: 800, margin: "0 0 10px" }}>
            Enable Quick Login?
          </h2>
          <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.65, margin: "0 0 24px" }}>
            Use your fingerprint or face scan to sign in instantly next time.
          </p>

          <button
            onClick={onAccept}
            disabled={loading}
            style={{
              background: theme.primary,
              color: theme.surface,
              border: "none",
              borderRadius: 12,
              padding: "13px 20px",
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              width: "100%",
              marginBottom: 10,
              opacity: loading ? 0.65 : 1,
            }}
          >
            {loading ? "Setting up…" : "Yes, enable biometrics"}
          </button>

          <button
            onClick={onDecline}
            disabled={loading}
            style={{
              background: "transparent",
              color: theme.textMuted,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              padding: "11px 20px",
              fontSize: 14,
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              width: "100%",
            }}
          >
            Skip for now
          </button>
        </div>
      </Card>
    </OverlayShell>
  );
}
