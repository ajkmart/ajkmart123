import React, { useEffect } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { log, _domain } from "./_shared";

export function ImpersonationHandler() {
  const { login } = useAuth();

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const impersonateToken = params.get("impersonateToken");
    if (!impersonateToken) return;

    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("impersonateToken");
      window.history.replaceState({}, "", url.pathname + (url.search || "") + (url.hash || ""));
    } catch (e) { log.warn("ImpersonationHandler: Failed to clean URL", e); }

    const doImpersonate = async () => {
      try {
        const base = `https://${_domain}`;
        const profileRes = await fetch(`${base}/api/users/profile`, {
          headers: { Authorization: `Bearer ${impersonateToken}` },
        });
        if (!profileRes.ok) {
          log.warn("ImpersonationHandler: Profile fetch failed:", profileRes.status);
          return;
        }
        const profileData = await profileRes.json();
        const userData = profileData.data || profileData.user || profileData;
        if (userData && userData.id) {
          await login(userData, impersonateToken);
          router.replace("/(tabs)");
        }
      } catch (err: unknown) {
        log.warn("ImpersonationHandler Error:", err instanceof Error ? err.message : String(err));
      }
    };

    doImpersonate();
  }, []);

  return null;
}

export default null;
