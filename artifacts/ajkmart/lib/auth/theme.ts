/**
 * AJKMart customer-app brand palette — electric blue on white.
 *
 * Overrides the DEFAULT_THEMES.customer defaults from @workspace/auth-react to
 * match the exact hex values from constants/colors.ts.
 * Pass this object as the `theme` prop on ThemeProvider to apply:
 *
 *   <ThemeProvider role="customer" theme={customerTheme}>…</ThemeProvider>
 */
import type { AuthTheme } from "@workspace/auth-react";

export const ajkmartTheme: Partial<AuthTheme> = {
  primary:            "#0066FF",
  primaryDark:        "#0047B3",
  primaryLight:       "#EBF2FF",
  background:         "#FFFFFF",
  text:               "#0A0F1E",
  textMuted:          "#64748B",
  border:             "#E2E8F0",
  pendingOverlay:     "#EBF2FF",
  rejectedOverlay:    "#FEF2F2",
  maintenanceOverlay: "#FFFBEB",
  surface:            "#ffffff",
};
