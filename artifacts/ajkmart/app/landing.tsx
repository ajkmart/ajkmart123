import React from "react";
import { router } from "expo-router";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import type { Language } from "@workspace/i18n";
import { tDual, type TranslationKey } from "@workspace/i18n";

const PRIMARY = "#0066FF";
const PRIMARY_DARK = "#0047B3";
const PRIMARY_SOFT = "#E8F1FF";
const WHITE = "#FFFFFF";

const LANG_CYCLE: Language[] = ["en", "ur", "roman"];
const LANG_LABELS: Record<string, string> = { en: "EN", ur: "اردو", roman: "RM" };

const SERVICES = [
  { icon: "🛒", label: { en: T("martTitle"), ur: "مارٹ", roman: T("martTitle") }, color: "#00C48C" },
  { icon: "🍔", label: { en: T("food"), ur: "کھانا", roman: "Khana" }, color: "#FF9500" },
  { icon: "🚗", label: { en: T("ride"), ur: "سواری", roman: "Sawari" }, color: PRIMARY },
  { icon: "💊", label: { en: T("navPharmacy"), ur: "فارمیسی", roman: T("navPharmacy") }, color: "#AF52DE" },
  { icon: "📦", label: { en: T("parcel"), ur: "پارسل", roman: T("parcel") }, color: "#FF6B35" },
  { icon: "🚐", label: { en: T("vanVehicle"), ur: "وین", roman: T("vanVehicle") }, color: "#5856D6" },
];

const CONTENT = {
  en: {
    appName: T("appName"),
    tagline: "Shop. Eat. Ride. Repeat.",
    heroTitle: "Your All-in-One\nSuper App",
    heroSub: "Order food, hail a ride, shop for groceries, and send parcels — all in one place.",
    login: T("loginBtn"),
    register: T("register"),
    servicesTitle: "Explore Services",
    browseGuest: "Browse as Guest",
    footer: "© 2026 AJKMart",
  },
  ur: {
    appName: "اے جے کے مارٹ",
    tagline: "خریداری۔ کھانا۔ سواری۔",
    heroTitle: "آپ کی ہر ضرورت\nایک ایپ میں",
    heroSub: "کھانا آرڈر کریں، سواری بلائیں، گروسری خریدیں اور پارسل بھیجیں — سب ایک جگہ۔",
    login: "لاگ ان",
    register: "رجسٹر",
    servicesTitle: "سروسز دیکھیں",
    browseGuest: "مہمان کے طور پر دیکھیں",
    footer: "© 2026 اے جے کے مارٹ",
  },
  roman: {
    appName: T("appName"),
    tagline: "Shopping. Khana. Sawari.",
    heroTitle: "Aapki Har Zaroorat\nEk App Mein",
    heroSub: "Khana order karein, sawari bulayein, grocery khareedein aur parcel bhejein — sab ek jagah.",
    login: T("loginBtn"),
    register: T("register"),
    servicesTitle: "Services Dekhein",
    browseGuest: "Guest Ke Tor Par Dekhein",
    footer: "© 2026 AJKMart",
  },
};

export default function LandingScreen() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLanguage();

  const C = CONTENT[language as keyof typeof CONTENT] ?? CONTENT.en;
  const isRTL = language === "ur";

  function handleLangCycle() {
    const idx = LANG_CYCLE.indexOf(language as Language);
    const next = LANG_CYCLE[(idx + 1) % LANG_CYCLE.length];
    setLanguage(next);
  }

  return (
    <View style={[styles.root, { backgroundColor: WHITE }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={[styles.headerInner, isRTL ? styles.rowReverse : styles.row]}>
          {/* Logo */}
          <View style={[styles.row, { gap: 8 }]}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoEmoji}>🛒</Text>
            </View>
            <Text style={styles.logoText}>{C.appName}</Text>
          </View>

          {/* Right buttons */}
          <View style={[styles.row, { gap: 8 }]}>
            {/* Language pill */}
            <TouchableOpacity onPress={handleLangCycle} style={styles.langBtn} activeOpacity={0.7}>
              <Text style={styles.langBtnTxt}>🌐 {LANG_LABELS[language] ?? "EN"}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/auth")} style={styles.loginBtn} activeOpacity={0.8}>
              <Text style={styles.loginBtnTxt}>{C.login}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/auth/register")} style={styles.registerBtn} activeOpacity={0.8}>
              <Text style={styles.registerBtnTxt}>{C.register}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.heroBgBlob} />
          <View style={[styles.taglinePill]}>
            <Text style={styles.taglineTxt}>✨ {C.tagline}</Text>
          </View>
          <Text style={[styles.heroTitle, isRTL && styles.textRight]}>{C.heroTitle}</Text>
          <Text style={[styles.heroSub, isRTL && styles.textRight]}>{C.heroSub}</Text>

          <View style={[styles.heroCtas, isRTL ? styles.rowReverse : styles.row]}>
            <TouchableOpacity onPress={() => router.push("/auth/register")} style={styles.heroRegisterBtn} activeOpacity={0.85}>
              <Text style={styles.heroRegisterTxt}>{C.register} →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/auth")} style={styles.heroLoginBtn} activeOpacity={0.85}>
              <Text style={styles.heroLoginTxt}>{C.login}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Services Grid ── */}
        <View style={styles.servicesSection}>
          <Text style={styles.sectionTitle}>{C.servicesTitle}</Text>
          <View style={styles.servicesGrid}>
            {SERVICES.map((svc) => {
              const label = svc.label[language as keyof typeof svc.label] ?? svc.label.en;
              return (
                <TouchableOpacity
                  key={svc.label.en}
                  style={styles.serviceCard}
                  activeOpacity={0.75}
                  onPress={() => router.replace("/(tabs)")}
                >
                  <View style={[styles.serviceIconBg, { backgroundColor: svc.color + "18" }]}>
                    <Text style={styles.serviceIcon}>{svc.icon}</Text>
                  </View>
                  <Text style={styles.serviceLabel}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Browse as Guest ── */}
        <View style={styles.guestSection}>
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)")}
            style={styles.guestBtn}
            activeOpacity={0.8}
          >
            <Text style={styles.guestBtnTxt}>{C.browseGuest}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <Text style={styles.footer}>{C.footer}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  /* Header */
  header: {
    backgroundColor: "rgba(255,255,255,0.97)",
    borderBottomWidth: 1,
    borderBottomColor: "#E8F1FF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  headerInner: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    alignItems: "center",
    justifyContent: "space-between",
  },

  /* Utilities */
  row: { flexDirection: "row", alignItems: "center" },
  rowReverse: { flexDirection: "row-reverse", alignItems: "center" },
  textRight: { textAlign: "right" },

  /* Logo */
  logoIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: PRIMARY,
    alignItems: "center", justifyContent: "center",
  },
  logoEmoji: { fontSize: 18 },
  logoText: {
    fontWeight: "800", fontSize: 16,
    color: PRIMARY_DARK,
    fontFamily: Platform.OS === "web" ? undefined : "Inter_700Bold",
  },

  /* Header buttons */
  langBtn: {
    height: 32, paddingHorizontal: 10, borderRadius: 99,
    backgroundColor: PRIMARY_SOFT,
    alignItems: "center", justifyContent: "center",
  },
  langBtnTxt: { fontSize: 12, fontWeight: "700", color: PRIMARY_DARK },

  loginBtn: {
    height: 32, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1, borderColor: "#BFDBFE",
    alignItems: "center", justifyContent: "center",
  },
  loginBtnTxt: { fontSize: 12, fontWeight: "700", color: PRIMARY_DARK },

  registerBtn: {
    height: 32, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: PRIMARY,
    alignItems: "center", justifyContent: "center",
  },
  registerBtnTxt: { fontSize: 12, fontWeight: "800", color: WHITE },

  /* Hero */
  hero: {
    backgroundColor: WHITE,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
  },
  heroBgBlob: {
    position: "absolute",
    top: -60, left: "25%",
    width: 300, height: 300,
    borderRadius: 150,
    backgroundColor: "#EFF6FF",
    opacity: 0.8,
  },

  taglinePill: {
    borderRadius: 99, paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: PRIMARY_SOFT,
    marginBottom: 20,
  },
  taglineTxt: { fontSize: 12, fontWeight: "700", color: PRIMARY, letterSpacing: 0.4 },

  heroTitle: {
    fontSize: Platform.OS === "web" ? 36 : 30,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
    lineHeight: Platform.OS === "web" ? 44 : 38,
    marginBottom: 14,
    fontFamily: Platform.OS === "web" ? undefined : "Inter_700Bold",
  },
  heroSub: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
    maxWidth: 340,
    fontFamily: Platform.OS === "web" ? undefined : "Inter_400Regular",
  },

  heroCtas: { gap: 12, flexWrap: "wrap", justifyContent: "center" },
  heroRegisterBtn: {
    height: 50, paddingHorizontal: 28, borderRadius: 14,
    backgroundColor: PRIMARY,
    alignItems: "center", justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  heroRegisterTxt: { fontSize: 15, fontWeight: "800", color: WHITE },
  heroLoginBtn: {
    height: 50, paddingHorizontal: 28, borderRadius: 14,
    backgroundColor: PRIMARY_SOFT,
    alignItems: "center", justifyContent: "center",
  },
  heroLoginTxt: { fontSize: 15, fontWeight: "700", color: PRIMARY_DARK },

  /* Services */
  servicesSection: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 8 },
  sectionTitle: {
    fontSize: 18, fontWeight: "800", color: "#0F172A",
    marginBottom: 16,
    fontFamily: Platform.OS === "web" ? undefined : "Inter_700Bold",
  },
  servicesGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 12,
  },
  serviceCard: {
    width: "30%",
    flexGrow: 1,
    minWidth: 90,
    backgroundColor: WHITE,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  serviceIconBg: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    marginBottom: 10,
  },
  serviceIcon: { fontSize: 26 },
  serviceLabel: {
    fontSize: 12, fontWeight: "700", color: "#1E293B",
    textAlign: "center",
    fontFamily: Platform.OS === "web" ? undefined : "Inter_600SemiBold",
  },

  /* Guest CTA */
  guestSection: { paddingHorizontal: 24, paddingTop: 32 },
  guestBtn: {
    height: 52, borderRadius: 14,
    borderWidth: 1.5, borderColor: "#BFDBFE",
    backgroundColor: "#F0F7FF",
    alignItems: "center", justifyContent: "center",
  },
  guestBtnTxt: {
    fontSize: 15, fontWeight: "700", color: PRIMARY,
    fontFamily: Platform.OS === "web" ? undefined : "Inter_600SemiBold",
  },

  /* Footer */
  footer: {
    textAlign: "center", fontSize: 12,
    color: "#94A3B8", marginTop: 28,
    fontFamily: Platform.OS === "web" ? undefined : "Inter_400Regular",
  },
});
