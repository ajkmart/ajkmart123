import React, { useEffect } from "react";
import { Alert } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useAuth, hasRole } from "@/context/AuthContext";
import { log, _domain } from "./_shared";

export function MagicLinkHandler() {
  const { login, setTwoFactorPending } = useAuth();

  useEffect(() => {
    const handleUrl = async (url: string) => {
      try {
        const parsed = new URL(url);
        const token =
          parsed.searchParams.get("magic_token") ||
          parsed.searchParams.get("token");
        if (!token) return;
        if (!parsed.pathname.includes("magic-link") && !parsed.pathname.includes("auth")) return;

        const res = await fetch(`https://${_domain}/api/auth/magic-link/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          const errMsg: string = data.error || data.message || "";
          let userMessage: string;
          if (errMsg.toLowerCase().includes("expired") || data.code === "EXPIRED") {
            userMessage = "This magic link has expired. Please request a new login link.";
          } else if (errMsg.toLowerCase().includes("used") || data.code === "USED") {
            userMessage = "This magic link has already been used. Please request a new one.";
          } else if (errMsg.toLowerCase().includes("invalid") || data.code === "INVALID") {
            userMessage = "This magic link is invalid. Please request a new login link.";
          } else {
            userMessage = errMsg || "Invalid or expired magic link. Please request a new one.";
          }
          Alert.alert("Sign-In Failed", userMessage, [{ text: "OK" }]);
          return;
        }
        if (data.requires2FA) {
          setTwoFactorPending({ tempToken: data.tempToken, userId: data.userId });
          router.replace("/auth");
          return;
        }
        if (data.token && data.user) {
          const userData = data.user as import("@/context/AuthContext").AppUser;
          await login(userData, data.token, data.refreshToken);
          if (!hasRole(userData, "customer")) {
            router.replace("/auth/wrong-app");
          } else {
            router.replace("/(tabs)");
          }
        }
      } catch (err: unknown) {
        log.warn("MagicLinkHandler error:", err instanceof Error ? err.message : String(err));
      }
    };

    const sub = Linking.addEventListener("url", (event) => handleUrl(event.url));
    Linking.getInitialURL()
      .then((url) => { if (url) handleUrl(url); })
      .catch((e: unknown) => { log.warn("MagicLinkHandler: getInitialURL failed", e); });
    return () => sub.remove();
  }, []);

  return null;
}

export default null;
