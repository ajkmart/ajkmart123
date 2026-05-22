/**
 * Vendor-app brand palette — AJKMart Blue (#1A56DB) on dark navy.
 *
 * Overrides DEFAULT_THEMES.vendor from @workspace/auth-react to match
 * the professional dark blue branding for the vendor dashboard.
 *
 *   <ThemeProvider theme={vendorTheme}>…</ThemeProvider>
 */
import type { AuthTheme } from "@workspace/auth-react";

export const vendorTheme: Partial<AuthTheme> = {
  primary: "#1A56DB",
  primaryDark: "#1348B5",
  primaryLight: "rgba(26,86,219,0.12)",
  background: "#060A14",
  text: "#E2E8F4",
  textMuted: "#6B7280",
  border: "#1E2A3F",
  pendingOverlay: "#0A1220",
  rejectedOverlay: "#1A0B0B",
  maintenanceOverlay: "#0A0F1A",
  surface: "#0F1827",
};
