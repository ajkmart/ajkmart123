import { Ionicons } from "@expo/vector-icons";
import { createLogger } from "@/utils/logger";
import { router, type Href } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Colors, { radii, spacing } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useAuth, hasRole } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";

const log = createLogger("[AuthGateSheet]");

interface AuthGateSheetProps {
  visible: boolean;
  onClose: () => void;
  returnTo?: string;
  message?: string;
}

function makeSStyles(C: typeof Colors.light) {
  return StyleSheet.create({
    content: { alignItems: "center", paddingTop: 8 },
    iconWrap: { marginBottom: 16 },
    iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
    title: { fontFamily: Font.bold, fontSize: 20, color: C.text, textAlign: "center", marginBottom: 8 },
    message: { fontFamily: Font.regular, fontSize: 14, color: C.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 24, paddingHorizontal: 8 },
    signInBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: "100%", marginBottom: 12 },
    signInTxt: { fontFamily: Font.bold, fontSize: 15, color: "#fff" },
    browseBtn: { paddingVertical: 12, paddingHorizontal: 32 },
    browseTxt: { fontFamily: Font.semiBold, fontSize: 14, color: C.textMuted },
  });
}

export function AuthGateSheet({ visible, onClose, returnTo, message }: AuthGateSheetProps) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeSStyles(C), [C]);
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const handleSignIn = async () => {
    onClose();
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("://")) {
      await AsyncStorage.setItem("@ajkmart_auth_return_to", returnTo);
    }
    router.push("/auth" as Href);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={s.content}>
        <View style={s.iconWrap}>
          <LinearGradient colors={["#0047B3", "#0066FF"]} style={s.iconCircle}>
            <Ionicons name="lock-closed-outline" size={28} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={s.title}>{T("signInToContinue")}</Text>
        <Text style={s.message}>{message || T("signInDefaultMsg")}</Text>
        <Pressable onPress={handleSignIn} style={s.signInBtn} accessibilityRole="button">
          <Ionicons name="person-circle-outline" size={18} color="#fff" />
          <Text style={s.signInTxt}>{T("signInRegister")}</Text>
        </Pressable>
        <Pressable onPress={async () => {
          await AsyncStorage.removeItem("@ajkmart_auth_return_to").catch((e: unknown) => log.warn("[AuthGateSheet] Failed to clear return_to:", e));
          onClose();
        }} style={s.browseBtn} accessibilityRole="button">
          <Text style={s.browseTxt}>{T("continueBrowsing")}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

export function RoleBlockSheet({ visible, onClose, userRole }: { visible: boolean; onClose: () => void; userRole?: string }) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeSStyles(C), [C]);
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={s.content}>
        <View style={s.iconWrap}>
          <View style={[s.iconCircle, { backgroundColor: C.amberSoft }]}>
            <Ionicons name="alert-circle-outline" size={28} color={C.amber} />
          </View>
        </View>
        <Text style={s.title}>{T("customerAccountRequired")}</Text>
        <Text style={s.message}>
          {`You're logged in as a ${userRole || "non-customer"} account. Cart, checkout, and ordering features are only available for customer accounts. Please switch to a customer account to continue.`}
        </Text>
        <Pressable onPress={() => { onClose(); router.back(); }} style={s.signInBtn} accessibilityRole="button">
          <Ionicons name="arrow-back" size={18} color="#fff" />
          <Text style={s.signInTxt}>{T("goBack")}</Text>
        </Pressable>
        <Pressable onPress={onClose} style={s.browseBtn} accessibilityRole="button">
          <Text style={s.browseTxt}>{T("dismiss")}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

export function useAuthGate() {
  const { user } = useAuth();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetMessage, setSheetMessage] = useState<string | undefined>();
  const [sheetReturnTo, setSheetReturnTo] = useState<string | undefined>();

  const requireAuth = useCallback(
    (action: () => void, opts?: { message?: string; returnTo?: string }) => {
      if (!user) {
        setSheetMessage(opts?.message);
        setSheetReturnTo(opts?.returnTo);
        setSheetVisible(true);
        return;
      }
      action();
    },
    [user],
  );

  const isGuest = !user;

  const handleClose = useCallback(() => {
    setSheetVisible(false);
    setSheetMessage(undefined);
    setSheetReturnTo(undefined);
    AsyncStorage.removeItem("@ajkmart_auth_return_to").catch((e: unknown) => log.warn("[AuthGateSheet] Failed to clear return_to:", e));
  }, []);

  const gate = {
    requireAuth,
    isGuest,
    sheetProps: {
      visible: sheetVisible,
      onClose: handleClose,
      message: sheetMessage,
      returnTo: sheetReturnTo,
    },
  };

  return gate;
}

export function useRoleGate() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  const isCustomer = !user || hasRole(user, "customer");

  const requireCustomerRole = useCallback(
    (action: () => void) => {
      if (user && !hasRole(user, "customer")) {
        setVisible(true);
        return;
      }
      action();
    },
    [user],
  );

  return {
    requireCustomerRole,
    isCustomer,
    roleBlockProps: {
      visible,
      onClose: () => setVisible(false),
      userRole: (user?.roles ?? [])[0],
    },
  };
}
