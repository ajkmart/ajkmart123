import React, { useEffect, useRef } from "react";
import { router, useSegments, type Href } from "expo-router";
import { useAuth, hasRole } from "@/context/AuthContext";
import { hasSeenOnboarding } from "@/app/onboarding";
import { log, GUEST_BROWSABLE, AUTH_REDIRECT_CAP, AUTH_REDIRECT_RESET_MS } from "./_shared";

export function AuthGuard() {
  const { user, isLoading, isSuspended } = useAuth();
  const segments = useSegments();
  const redirectCountRef = useRef(0);
  const redirectResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongAppRedirectedForRef = useRef<string | null>(null);

  const safeReplace = (path: Href) => {
    if (redirectCountRef.current >= AUTH_REDIRECT_CAP) {
      log.error(
        "AuthGuard redirect loop detected — cap hit navigating to",
        path,
        ". Routing to /auth as safe fallback.",
      );
      router.replace("/auth" as Href);
      return;
    }
    redirectCountRef.current += 1;
    if (redirectResetTimerRef.current) clearTimeout(redirectResetTimerRef.current);
    redirectResetTimerRef.current = setTimeout(() => {
      redirectCountRef.current = 0;
    }, AUTH_REDIRECT_RESET_MS);
    router.replace(path);
  };

  useEffect(() => {
    return () => {
      if (redirectResetTimerRef.current) clearTimeout(redirectResetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;

    /* Redirect suspended users to the suspended screen so they see a clear
       message and cannot access app functionality. */
    if (isSuspended && segments[0] !== "auth") {
      safeReplace("/auth/suspended" as import("expo-router").Href);
      return;
    }

    const inAuthGroup = segments[0] === "auth";
    const inTabsGroup = segments[0] === "(tabs)";
    const inRootIndex = (segments as string[]).length === 0;
    const isBrowsable = GUEST_BROWSABLE.has(segments[0] as string);
    const inOnboarding = segments[0] === "onboarding";

    const isPublicRoute = inAuthGroup || inTabsGroup || inRootIndex || isBrowsable || inOnboarding;
    const segs = segments as string[];
    const onWrongAppScreen = segs[0] === "auth" && segs[1] === "wrong-app";

    if (!user && !isPublicRoute) {
      const capturedSegment = segments[0];
      hasSeenOnboarding()
        .then((seen) => {
          if ((segments as string[])[0] !== capturedSegment) return;
          if (!seen) safeReplace("/onboarding");
          else safeReplace("/auth");
        })
        .catch(() => { safeReplace("/auth"); });
    } else if (!user && inRootIndex) {
      const capturedLen = (segments as string[]).length;
      hasSeenOnboarding()
        .then((seen) => {
          if ((segments as string[]).length !== capturedLen) return;
          if (!seen) safeReplace("/onboarding");
          else safeReplace("/landing" as Href);
        })
        .catch(() => { safeReplace("/landing" as Href); });
    } else {
      /* Unified customer-role check — handles both string[] and legacy
         comma-separated string roles returned by older API payloads.   */
      const isCustomer = (
        hasRole(user!, "customer") ||
        String((user as { roles?: unknown })?.roles ?? "").split(",").map(r => r.trim()).includes("customer")
      );

      if (user && !isCustomer && !onWrongAppScreen) {
        if (wrongAppRedirectedForRef.current !== user.id) {
          wrongAppRedirectedForRef.current = user.id;
          safeReplace("/auth/wrong-app");
        }
      } else if (isCustomer && (inAuthGroup || inRootIndex)) {
        safeReplace("/(tabs)");
      }
    }
  }, [user, isLoading, isSuspended, segments]);

  return null;
}

export default null;
