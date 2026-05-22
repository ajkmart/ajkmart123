/**
 * Rider-app brand palette — dark gold on pitch black.
 *
 * Overrides the DEFAULT_THEMES.rider defaults from @workspace/auth-react to
 * match the exact hex values used throughout the rider CSS (--login-brand etc).
 * Pass this object as the `theme` prop on ThemeProvider to apply:
 *
 *   <ThemeProvider role="rider" theme={riderTheme}>…</ThemeProvider>
 */
import type { AuthTheme } from "@workspace/auth-react";

export const riderTheme: Partial<AuthTheme> = {
  primary: "#F0B90B",
  primaryDark: "#D97706",
  primaryLight: "rgba(240,185,11,0.10)",
  background: "#0B0E11",
  text: "#E8E9EF",
  textMuted: "#6B7280",
  border: "#252836",
  pendingOverlay: "#0D1017",
  rejectedOverlay: "#110B0B",
  maintenanceOverlay: "#0D1017",
  surface: "#131720",
};
