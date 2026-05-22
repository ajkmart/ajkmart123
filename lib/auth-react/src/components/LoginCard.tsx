import React from "react";
import { useAuthTheme } from "../context/ThemeContext";

export interface LoginCardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export function LoginCard({ title, subtitle, children, className }: LoginCardProps) {
  const theme = useAuthTheme();

  return (
    <div
      className={className}
      style={{
        width: "100%",
        maxWidth: "420px",
        background: theme.surface,
        color: theme.text,
        border: `1px solid ${theme.border}`,
        borderRadius: "20px",
        boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)",
        padding: "28px 24px",
      }}
    >
      {(title || subtitle) && (
        <div style={{ marginBottom: "20px", textAlign: "center" }}>
          {title && <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 800 }}>{title}</h2>}
          {subtitle && (
            <p
              style={{
                margin: "8px 0 0",
                color: theme.textMuted,
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
