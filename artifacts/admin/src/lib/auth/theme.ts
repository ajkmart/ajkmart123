/**
 * Admin-app brand palette — indigo on deep dark.
 *
 * Overrides the DEFAULT_THEMES.admin defaults from @workspace/auth-react to
 * match the exact hex values used in the admin panel CSS.
 * Pass this object as the `theme` prop on ThemeProvider to apply:
 *
 *   <ThemeProvider role="admin" theme={adminTheme}>…</ThemeProvider>
 */
import type { AuthTheme } from "@workspace/auth-react";

export const adminTheme: Partial<AuthTheme> = {
  primary: "#6366F1",
  primaryDark: "#4338CA",
  primaryLight: "rgba(99,102,241,0.12)",
  background: "#0f1117",
  text: "#f1f5f9",
  textMuted: "#64748b",
  border: "rgba(255,255,255,0.07)",
  pendingOverlay: "#0f1117",
  rejectedOverlay: "#0f1117",
  maintenanceOverlay: "#0f1117",
  surface: "#131720",
};
