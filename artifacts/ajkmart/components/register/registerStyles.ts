import { Platform, StyleSheet } from "react-native";
import { spacing, radii, shadows, typography } from "@/constants/colors";
import { authColors as C } from "@/components/auth-shared";

export const s = StyleSheet.create({
  gradient: { flex: 1 },
  topSection: { alignItems: "center", paddingBottom: spacing.lg, paddingHorizontal: spacing.xl },
  backBtn: {
    position: "absolute", left: spacing.lg,
    top: Platform.OS === "web" ? 67 : 50,
    width: 40, height: 40, borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  headerLogoRow: { marginBottom: spacing.md },
  headerLogo: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    ...shadows.md,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 26, color: "#fff", marginBottom: 4 },
  headerSub: { ...typography.body, color: "rgba(255,255,255,0.85)", marginBottom: spacing.lg },
  progressRow: { marginBottom: 8 },
  stepLabels: { flexDirection: "row", justifyContent: "center", gap: 16 },
  stepLabel: { ...typography.small, color: "rgba(255,255,255,0.4)" },
  stepLabelActive: { color: "rgba(255,255,255,0.9)" },

  card: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xxl, flex: 1 },

  fieldLabel: { ...typography.captionMedium, color: C.textSecondary, marginBottom: spacing.sm },
  fieldSub: { ...typography.caption, color: C.textMuted, marginBottom: spacing.md },
  fieldHint: { ...typography.small, color: C.textMuted, marginTop: -8, marginBottom: spacing.md, paddingLeft: 2 },

  changeBtn: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: spacing.md },
  changeBtnText: { ...typography.bodyMedium, color: C.primary },

  resendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginBottom: spacing.md },
  resendDisabled: { opacity: 0.5 },
  resendText: { ...typography.bodyMedium, color: C.primary },

  gpsButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: C.primary, borderRadius: radii.lg, paddingVertical: 14,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  gpsButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
  gpsStatusText: { ...typography.caption, color: C.success, textAlign: "center", marginBottom: spacing.sm },
  coordsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: spacing.md },
  coordsText: { ...typography.small, color: C.textMuted },

  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { ...typography.small, color: C.textMuted },

  pickerButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1.5, borderColor: C.border, borderRadius: radii.lg,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    backgroundColor: C.surfaceSecondary,
    marginBottom: spacing.md,
  },
  pickerError: { borderColor: C.danger },
  pickerButtonText: { ...typography.body, color: C.text },

  cityDropdown: {
    borderWidth: 1, borderColor: C.border, borderRadius: radii.lg,
    backgroundColor: C.surface, marginTop: -8, marginBottom: spacing.md,
    maxHeight: 220, overflow: "hidden",
    ...shadows.sm,
  },
  citySearchWrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  cityList: { maxHeight: 170 },
  cityItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: C.border,
  },
  cityItemSelected: { backgroundColor: `${C.primary}10` },
  cityItemText: { ...typography.body, color: C.text },
  cityItemTextSelected: { color: C.primary, fontFamily: "Inter_600SemiBold" },
  noCityText: { ...typography.caption, color: C.textMuted, textAlign: "center", paddingVertical: 16 },

  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: spacing.sm, marginBottom: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxChecked: { backgroundColor: C.primary, borderColor: C.primary },
  termsText: { flex: 1, ...typography.caption, color: C.textSecondary, lineHeight: 19 },

  mismatchText: { ...typography.caption, color: C.danger, marginTop: -8, marginBottom: spacing.md, paddingLeft: 4 },
  loginLink: { alignItems: "center", marginTop: spacing.xl },
  loginLinkText: { ...typography.bodyMedium, color: C.primary },
  skipLink: { alignItems: "center", marginTop: spacing.md },
  skipLinkText: { ...typography.bodyMedium, color: C.textMuted, textDecorationLine: "underline" },

  usernameCheckRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: -8, marginBottom: spacing.md, paddingLeft: 2 },
  usernameCheckText: { ...typography.small, color: C.primary },
  usernameHint: { ...typography.small, marginTop: -8, marginBottom: spacing.md, paddingLeft: 2 },

  successScroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: spacing.xxl },
  successCard: { backgroundColor: C.surface, borderRadius: radii.xxl, padding: spacing.xxxl, alignItems: "center", width: "100%", ...shadows.lg },
  successIconWrap: { marginBottom: spacing.xl },
  successIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.success, alignItems: "center", justifyContent: "center" },
  successTitle: { ...typography.h2, color: C.text, marginBottom: spacing.sm, textAlign: "center" },
  successSub: { ...typography.body, color: C.textMuted, textAlign: "center", marginBottom: spacing.xl, lineHeight: 22 },

  levelBadge: { flexDirection: "row", alignItems: "center", borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1.5, marginBottom: spacing.lg, width: "100%" },
  levelTitle: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 2 },
  levelDesc: { ...typography.caption, color: C.textSecondary },

  bonusBanner: { flexDirection: "row", alignItems: "center", backgroundColor: C.accentSoft, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: "#FFD580", width: "100%" },
  bonusIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF4E5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  bonusTitle: { ...typography.subtitle, color: C.text, marginBottom: 2 },
  bonusSub: { ...typography.caption, color: C.textSecondary },

  kycPrompt: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: `${C.primary}08`, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl, width: "100%", borderWidth: 1, borderColor: `${C.primary}20` },
  kycText: { flex: 1, ...typography.caption, color: C.primary, lineHeight: 18 },
});
