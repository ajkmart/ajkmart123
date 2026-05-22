/**
 * Overlay.tsx — admin
 *
 * Full-screen overlay screens for admin auth state transitions.
 * Admin only shows maintenance (no pending/rejected/biometric).
 *
 * All colors come from useTheme() so they stay in sync with adminTheme.
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
        background: theme.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-15%",
          left: "-10%",
          width: "45%",
          height: "45%",
          borderRadius: "50%",
          background: `${theme.primaryDark}14`,
          filter: "blur(120px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-15%",
          right: "-10%",
          width: "45%",
          height: "45%",
          borderRadius: "50%",
          background: `${theme.primary}0F`,
          filter: "blur(120px)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 400 }}>
        {children}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${theme.border}`,
        borderRadius: 20,
        padding: "32px 28px",
        backdropFilter: "blur(12px)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}
    >
      {children}
    </div>
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
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow: `0 4px 20px ${theme.primary}4D`,
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.surface}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </div>
        <h1 style={{ color: theme.text, fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>
          AJKMart Admin
        </h1>
      </div>

      <Card>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ color: theme.text, fontSize: 18, fontWeight: 700, margin: "0 0 10px" }}>
            System Maintenance
          </h2>
          <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.65, margin: "0 0 20px" }}>
            {message ?? "The admin panel is temporarily unavailable for scheduled maintenance."}
          </p>

          {(supportPhone || supportEmail) && (
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
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
                  margin: "0 0 6px",
                }}
              >
                Emergency Contact
              </p>
              {supportPhone && (
                <p style={{ color: theme.text, fontSize: 14, margin: "0 0 4px" }}>
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
