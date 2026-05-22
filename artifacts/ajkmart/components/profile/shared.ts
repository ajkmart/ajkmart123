import { Platform, StyleSheet } from "react-native";
import Colors, { spacing, radii, shadows, typography } from "@/constants/colors";
import { T as Typ, Font } from "@/constants/typography";

export { spacing, radii, shadows, typography, Typ, Font };
export { API_BASE as API, unwrapApiResponse } from "@/utils/api";

export const stripPkCode = (phone: string) => phone.replace(/^\+?92/, "");

export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  return fallback;
}

export function extractApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.message === "string") return b.message;
    if (typeof b.error === "string") return b.error;
  }
  return fallback;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
  meta?: Record<string, string>;
}

export interface Address {
  id: string;
  label: string;
  address: string;
  city: string;
  icon?: string;
  isDefault: boolean;
}

export function relativeTime(iso: string) {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) return "";
  const d = Date.now() - parsed.getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const FALLBACK_CITIES = ["Muzaffarabad", "Mirpur", "Rawalakot", "Bagh", "Kotli", "Bhimber", "Poonch", "Neelum Valley", "Rawalpindi", "Islamabad", "Other"];
export const AJK_CITIES_FALLBACK = ["Muzaffarabad", "Mirpur", "Rawalakot", "Bagh", "Kotli", "Bhimber", "Poonch", "Neelum Valley"];

export function getSharedStyles(C: typeof Colors.light) {
  const sheet = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: C.overlay, justifyContent: "flex-end" },
    container: { backgroundColor: C.surface, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, paddingHorizontal: spacing.xl, paddingBottom: Platform.OS === "web" ? 40 : 48, paddingTop: spacing.md },
    handle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: "center", marginBottom: spacing.xl },
    title: { ...typography.h2, color: C.text, marginBottom: 4 },
    sub: { ...typography.caption, color: C.textMuted, marginBottom: spacing.xl },
  });

  const fld = StyleSheet.create({
    label: { ...typography.captionMedium, color: C.textSecondary, marginBottom: 7 },
    wrap: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: C.border, borderRadius: radii.lg, marginBottom: 6, overflow: "hidden" },
    pre: { paddingHorizontal: spacing.md, paddingVertical: 13, backgroundColor: C.surfaceSecondary, borderRightWidth: 1, borderRightColor: C.border, alignItems: "center", justifyContent: "center" },
    preTxt: { ...typography.bodySemiBold, color: C.text },
    readOnly: { flex: 1, ...typography.body, paddingHorizontal: spacing.md },
    input: { flex: 1, ...typography.body, color: C.text, paddingHorizontal: spacing.md, paddingVertical: 13 },
    lock: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md },
    lockTxt: { ...typography.small, color: C.textMuted },
    hint: { ...typography.small, color: C.textMuted, marginBottom: 4, paddingLeft: 2 },
  });

  const chip = StyleSheet.create({
    base: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radii.full, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
    active: { backgroundColor: C.primarySoft, borderColor: C.primary },
    text: { ...typography.captionMedium, color: C.textMuted },
    textActive: { color: C.primary },
  });

  const errStyle = StyleSheet.create({
    box: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.dangerSoft, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: spacing.sm, borderWidth: 1, borderColor: C.redBorder },
    txt: { ...typography.captionMedium, color: C.danger, flex: 1 },
  });

  const btnStyles = StyleSheet.create({
    cancel: { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: radii.lg, paddingVertical: 14, alignItems: "center" },
    cancelTxt: { ...typography.bodySemiBold, color: C.textSecondary },
    save: { flex: 2, backgroundColor: C.primary, borderRadius: radii.lg, paddingVertical: 14, alignItems: "center" },
    saveTxt: { ...typography.button, color: C.textInverse },
  });

  const primaryBtn = StyleSheet.create({
    base: { backgroundColor: C.primary, borderRadius: radii.lg, paddingVertical: spacing.lg, alignItems: "center", ...shadows.md },
    txt: { ...typography.button, color: C.textInverse },
  });

  const modalHdr = StyleSheet.create({
    wrap: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: C.borderLight },
    title: { ...typography.h3, color: C.text },
    sub: { ...typography.caption, color: C.textMuted, marginTop: 2 },
    action: { backgroundColor: C.primarySoft, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radii.full },
    actionTxt: { ...typography.captionMedium, color: C.primary },
    close: { width: 34, height: 34, borderRadius: radii.md, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  });

  const empty = StyleSheet.create({
    wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: spacing.xxxl },
    title: { ...typography.subtitle, color: C.text },
    sub: { ...typography.caption, color: C.textMuted, textAlign: "center" },
  });

  const notifItem = StyleSheet.create({
    wrap: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.borderLight },
    unread: { backgroundColor: C.primarySoft },
    icon: { width: 42, height: 42, borderRadius: radii.md, alignItems: "center", justifyContent: "center", position: "relative", flexShrink: 0 },
    dot: { position: "absolute", top: -1, right: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: C.danger, borderWidth: 2, borderColor: C.surface },
    title: { ...typography.bodySemiBold, color: C.text, marginBottom: 2 },
    body: { ...typography.caption, color: C.textSecondary, lineHeight: 17 },
    time: { ...typography.small, color: C.textMuted, marginTop: 4 },
    del: { width: 26, height: 26, borderRadius: radii.sm, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  });

  const privRow = StyleSheet.create({
    wrap: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.borderLight },
    icon: { width: 36, height: 36, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
    label: { ...typography.bodyMedium, color: C.text },
    sub: { ...typography.small, color: C.textMuted, marginTop: 1 },
  });

  const secHdr = StyleSheet.create({
    label: { ...typography.subtitle, color: C.text, marginBottom: spacing.sm },
  });

  const secCard = StyleSheet.create({
    wrap: { backgroundColor: C.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: C.borderLight, overflow: "hidden", ...shadows.sm },
  });

  const otpStyle = StyleSheet.create({
    input: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, ...Typ.h2, fontSize: 24, color: C.text, borderWidth: 1.5, borderColor: C.border, borderRadius: radii.lg, textAlign: "center", letterSpacing: 8 },
  });

  const addrHdr = StyleSheet.create({
    addBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md },
    addBtnTxt: { ...typography.captionMedium, color: C.textInverse },
  });

  const addrAdd = StyleSheet.create({
    panel: { borderBottomWidth: 1, borderBottomColor: C.borderLight, padding: spacing.lg, backgroundColor: C.surfaceSecondary },
    fld: { borderWidth: 1.5, borderColor: C.border, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.md, backgroundColor: C.surface },
    fldTxt: { ...typography.body, color: C.text },
  });

  const addrItem = StyleSheet.create({
    wrap: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: C.surface, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: C.borderLight, ...shadows.sm },
    icon: { width: 42, height: 42, borderRadius: radii.md, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    label: { ...typography.bodySemiBold, color: C.text },
    addr: { ...typography.caption, color: C.textSecondary, marginTop: 2 },
    city: { ...typography.small, color: C.textMuted, marginTop: 1 },
    defBadge: { backgroundColor: C.successSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.full },
    defTxt: { ...typography.smallMedium, color: C.success },
    setDefBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.sm, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.blueLightBorder },
    setDefTxt: { ...typography.smallMedium, color: C.primary },
    delBtn: { width: 30, height: 30, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  });

  const LABEL_OPTS = [
    { label: "Home", icon: "home-outline" as const, color: C.success, bg: C.successSoft },
    { label: "Work", icon: "briefcase-outline" as const, color: C.primary, bg: C.primarySoft },
    { label: "Other", icon: "location-outline" as const, color: C.accent, bg: C.accentSoft },
  ];

  return {
    sheet, fld, chip, errStyle, btnStyles, primaryBtn, modalHdr,
    empty, notifItem, privRow, secHdr, secCard, otpStyle,
    addrHdr, addrAdd, addrItem, LABEL_OPTS
  };
}


