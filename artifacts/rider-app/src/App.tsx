import { useVersionCheck } from "@/hooks/useVersionCheck";
import { createLogger } from "@/lib/logger";
import { Capacitor } from "@capacitor/core";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { AnnouncementBar } from "./components/AnnouncementBar";
import { BottomNav } from "./components/BottomNav";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MaintenanceScreen } from "./components/MaintenanceScreen";
import { PopupEngine } from "./components/PopupEngine";
import { PwaInstallBanner } from "./components/PwaInstallBanner";
import { Toaster } from "./components/ui/toaster";
import { RiderAuthConfigProvider } from "./lib/AuthConfigContext";
import { initAnalytics } from "./lib/analytics";
import { api, apiFetch, setApiTimeoutMs } from "./lib/api";
import { ThemeProvider } from "./lib/auth/ThemeContext";
import { riderTheme } from "./lib/auth/theme";
import { riderEnv } from "./lib/envValidation";
import { initErrorReporter } from "./lib/error-reporter";
import { setGeofencePolygon, setMaxSpeedKmh } from "./lib/gps/validation";
import {
  registerDrainHandler,
  setDismissedRequestTtlSec,
  setGpsQueueMax,
  type QueuedPing,
} from "./lib/gpsQueue";
import {
  PermanentQueueError,
  registerActionExecutor,
  syncQueue,
  type QueuedAction,
} from "./lib/offline/queueManager";
import { consumePendingNotificationTap, registerPush } from "./lib/push";
import { RiderAuthProvider, useAuth } from "./lib/rider-auth";
import { initSentry } from "./lib/sentry";
import { SocketProvider } from "./lib/socket";
import { getRiderModules, usePlatformConfig } from "./lib/useConfig";
import { LanguageProvider, useLanguage } from "./lib/useLanguage";
const log = createLogger("[App]");

/* PF4 / R3: All pages are lazy-loaded so the initial bundle only downloads
   the app shell, providers, and routing logic. Each page (and its transitive
   imports, including Leaflet for Active/Home) is fetched on-demand the first
   time the user navigates to that route. Suspense fallbacks are already in
   place at all three render paths (unauthenticated, VanDriver, authenticated). */
const Active = lazy(() => import("./pages/Active"));
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Profile = lazy(() => import("./pages/Profile"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const GuestLanding = lazy(() => import("./pages/GuestLanding"));
const Register = lazy(() => import("./pages/Register"));
const NotFound = lazy(() => import("./pages/not-found"));
const History = lazy(() => import("./pages/History"));
const Earnings = lazy(() => import("./pages/Earnings"));
const Wallet = lazy(() => import("./pages/Wallet"));
const Notifications = lazy(() => import("./pages/Notifications"));
const SecuritySettings = lazy(() => import("./pages/SecuritySettings"));
const VanDriver = lazy(() => import("./pages/VanDriver"));
const Chat = lazy(() => import("./pages/Chat"));
const Reviews = lazy(() => import("./pages/Reviews"));
const PenaltyHistory = lazy(() => import("./pages/PenaltyHistory"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, networkMode: "offlineFirst" } },
});

/* PWA5: Capacitor-aware base resolution. `BASE_URL` may be `./` or a
   `capacitor://` URL on native; resolving against `window.location.origin`
   normalises it to a usable pathname for wouter regardless of platform. */
/**
 * RedirectTo — lightweight client-side redirect for legacy / alias routes.
 * Replaces the current history entry so the back button skips the alias.
 * Uses wouter's useLocation (already imported at the top of this file).
 */
function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to, navigate]);
  return null;
}

function getRouterBase(): string {
  try {
    const raw = riderEnv.baseUrl || "/";
    const u = new URL(raw, window.location.origin);
    return u.pathname.replace(/\/$/, "");
  } catch {
    return "";
  }
}

/* U5: Splash deadline — if `getMe` hangs longer than this, the splash screen
   surfaces a retry CTA so the user is never stuck on the spinner forever. */
const SPLASH_DEADLINE_MS = 15_000;

/* P4: Track once-per-tab whether we've already requested notification
   permission so we don't re-prompt on every `user` change. The browser will
   silently no-op after a "denied" decision, but the call still emits a console
   warning that the error reporter would otherwise capture (PF1).
   We persist this flag in sessionStorage (rather than a module-level let) so
   that HMR reloads in dev and React StrictMode double-invocations don't
   accidentally re-prompt within the same browser tab session. */
const NOTIF_ASKED_KEY = "_ajkm_notifPermissionAsked";

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
        style={{ borderColor: "#252836", borderTopColor: "#F0B90B" }}
      />
    </div>
  );
}

function SessionExpiredOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,14,17,0.96)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#131720",
          border: "1px solid #252836",
          borderRadius: 20,
          padding: "28px 24px",
          width: "100%",
          maxWidth: 360,
          textAlign: "center",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(240,185,11,0.12)",
            border: "1px solid rgba(240,185,11,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#F0B90B"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 style={{ color: "#E8E9EF", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
          Session Expired
        </h2>
        <p style={{ color: "#6B7280", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
          Your session has timed out for security. Please sign in again to continue.
        </p>
        <button
          onClick={onDismiss}
          style={{
            width: "100%",
            height: 48,
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(135deg, #F0B90B, #D97706)",
            color: "#0B0E11",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Sign In Again
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading, storageError, logout, sessionExpired, clearSessionExpired } = useAuth();
  const { config } = usePlatformConfig();
  const modules = getRiderModules(config);
  const { language } = useLanguage();
  const qc = useQueryClient();
  const T = (key: TranslationKey) => tDual(key, language);

  useEffect(() => {
    return registerDrainHandler(async (pings: QueuedPing[]) => {
      await api.batchLocation(pings.map(({ id, ...rest }) => rest));
    });
  }, []);

  useEffect(() => {
    registerActionExecutor(async (action: QueuedAction) => {
      /* Pass X-Idempotency-Key so the server can de-duplicate replayed offline
         actions. The action UUID is stable across retries and survives tab close
         via IndexedDB persistence. */
      const idemHdr = { "X-Idempotency-Key": action.id };

      /* Wrap apiFetch to classify errors before re-throwing:
         - HTTP 4xx (except 429 rate-limit): permanent — remove from queue now.
           The server explicitly rejected the request; retrying will not help.
         - HTTP 429 / network errors / 5xx: transient — leave in queue for the
           next sync cycle (when connectivity or server capacity is restored).
         - 409 Conflict: also permanent — the ride/order was already accepted
           by another rider; no point retrying this action. */
      async function run(fn: () => Promise<unknown>): Promise<void> {
        try {
          await fn();
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          if (typeof status === "number" && status >= 400 && status < 500 && status !== 429) {
            /* HTTP 4xx (not 429): permanent rejection. Move to dead-letter. */
            throw new PermanentQueueError(
              `Server rejected action '${action.type}' (HTTP ${status}) — will not retry`,
              status
            );
          }
          /* Transient (network error, 5xx, 429): re-throw so the queue bumps
             the retry counter and halts the drain until the next sync. */
          throw err;
        }
      }

      switch (action.type) {
        case "accept_order":
          await run(() =>
            apiFetch(`/riders/orders/${action.entityId}/accept`, {
              method: "POST",
              body: "{}",
              headers: idemHdr,
            })
          );
          break;
        case "accept_ride":
          await run(() =>
            apiFetch(`/riders/rides/${action.entityId}/accept`, {
              method: "POST",
              body: "{}",
              headers: idemHdr,
            })
          );
          break;
        case "update_order": {
          const { status, proofPhoto } = action.payload as { status: string; proofPhoto?: string };
          /* proofPhoto may be either a server URL (online upload) or a base64 DataURL
             (queued offline); the backend accepts both forms. */
          await run(() =>
            apiFetch(`/riders/orders/${action.entityId}/status`, {
              method: "PATCH",
              body: JSON.stringify({ status, ...(proofPhoto ? { proofPhoto } : {}) }),
              headers: idemHdr,
            })
          );
          break;
        }
        case "update_ride": {
          const { status, lat, lng } = action.payload as {
            status: string;
            lat?: number;
            lng?: number;
          };
          const loc = lat !== undefined && lng !== undefined ? { lat, lng } : {};
          await run(() =>
            apiFetch(`/riders/rides/${action.entityId}/status`, {
              method: "PATCH",
              body: JSON.stringify({ status, ...loc }),
              headers: idemHdr,
            })
          );
          break;
        }
        case "complete_trip": {
          /* complete_trip is enqueued by VanDriver when a van trip completion
             fails offline. entityId = scheduleId, payload.date = trip date. */
          const { date } = action.payload as { date: string };
          await run(() =>
            apiFetch(`/van/driver/schedules/${action.entityId}/date/${date}/complete`, {
              method: "PATCH",
              body: "{}",
              headers: idemHdr,
            })
          );
          break;
        }
        case "board_passenger": {
          /* board_passenger is enqueued by VanDriver when a boarding PATCH
             fails offline. entityId = bookingId, payload.boardedAt = ISO timestamp. */
          const { boardedAt } = action.payload as { boardedAt: string };
          await run(() =>
            apiFetch(`/van/driver/bookings/${action.entityId}/board`, {
              method: "PATCH",
              body: JSON.stringify({ boarded: true, boardedAt }),
              headers: idemHdr,
            })
          );
          break;
        }

        default:
          log.warn(
            { type: (action as { type: string }).type },
            "Unknown offline action type in sync queue — skipping"
          );
          break;
      }
    });
    syncQueue().catch((err) => {
      log.warn("Offline queue sync failed on mount:", err);
    });
  }, []);

  useEffect(() => {
    initErrorReporter();
  }, []);

  useEffect(() => {
    return () => {
      queryClient.clear();
    };
  }, []);

  /* ── Apply network/retry settings from platform config on startup ── */
  useEffect(() => {
    const net = config?.network;
    if (!net) return;
    if (typeof net.apiTimeoutMs === "number") setApiTimeoutMs(net.apiTimeoutMs);
    if (typeof net.riderGpsQueueMax === "number") setGpsQueueMax(net.riderGpsQueueMax);
    if (typeof net.riderDismissedRequestTtlSec === "number")
      setDismissedRequestTtlSec(net.riderDismissedRequestTtlSec);
  }, [config]);

  /* ── Wire platform-config geofence + speed threshold into GPS validation ── */
  useEffect(() => {
    const poly = config?.geofence?.polygon;
    if (Array.isArray(poly) && poly.length >= 3) {
      setGeofencePolygon(poly);
    } else {
      setGeofencePolygon(null);
    }
    /* Reset to default (200 km/h) when platform config does not supply a value
       so stale thresholds from a previous config load don't carry over. */
    setMaxSpeedKmh(config?.security?.maxSpeedKmh ?? 200);
  }, [config?.geofence, config?.security?.maxSpeedKmh]);

  /* ── Sentry + Analytics init from platform config ── */
  useEffect(() => {
    const integ = config?.integrations;
    if (!integ) return;
    if (integ.sentry && integ.sentryDsn) {
      initSentry(
        integ.sentryDsn,
        integ.sentryEnvironment,
        integ.sentrySampleRate,
        integ.sentryTracesSampleRate
      );
    }
    if (integ.analytics && integ.analyticsTrackingId) {
      initAnalytics(
        integ.analyticsPlatform,
        integ.analyticsTrackingId,
        integ.analyticsDebug ?? false
      );
    }
  }, [config?.integrations]);

  /* ── Cold-start notification tap: consume any tap captured before auth loaded ──
     Handles two cases:
     (a) pushNotificationActionPerformed fired at module-load (killed-app tap)
         → drained from _pendingTapData via consumePendingNotificationTap.
     (b) getDeliveredNotifications reveals a notification the rider hasn't
         dismissed yet (backgrounded app case on some Android builds).
     Routes based on data.type so future push types (wallet, etc.) land
     on the correct screen rather than always going to /active. */
  useEffect(() => {
    if (!user) return;
    const routeByData = (data: Record<string, string>) => {
      const type = data.type ?? "";
      if (type === "wallet" || type === "wallet_credit" || type === "wallet_debit") {
        navigate("/wallet");
        return;
      }
      if (type === "ai_chat" || type === "ai_response") {
        navigate("/chat?tab=ai");
        return;
      }
      if (type === "chat" || type === "support" || type === "admin_message") {
        navigate("/chat");
        return;
      }
      if (type === "penalty") {
        navigate("/penalty-history");
        return;
      }
      if (type === "review") {
        navigate("/reviews");
        return;
      }
      if (
        data.rideId ||
        data.orderId ||
        type === "ride_request" ||
        type === "new_ride" ||
        type === "order_request" ||
        type === "new_order"
      ) {
        navigate("/active");
      }
    };
    const pending = consumePendingNotificationTap();
    if (pending && Object.keys(pending).length > 0) {
      routeByData(pending);
      return;
    }
    if (Capacitor.isNativePlatform()) {
      import("@capacitor/push-notifications")
        .then(({ PushNotifications }) => {
          PushNotifications.getDeliveredNotifications()
            .then(({ notifications }) => {
              const first = notifications[0];
              if (first?.data) routeByData(first.data as Record<string, string>);
            })
            .catch((err) => {
              log.warn("getDeliveredNotifications failed:", err);
            });
        })
        .catch((err) => {
          log.warn("PushNotifications import failed:", err);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* ── FCM foreground notification banner ── */
  const [fcmNotif, setFcmNotif] = useState<{ title: string; body: string } | null>(null);
  const fcmCleanupRef = useRef<{ remove: () => void } | null>(null);
  const fcmDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intendedRouteRef = useRef<string | null>(null);
  const [location, navigate] = useLocation();

  /* Deep-link guard: capture the current path when an unauthenticated user
     lands on a protected route (e.g. via a push-notification deep link).
     After the user logs in, we redirect them to the originally-intended path. */
  const PUBLIC_PATHS = ["/", "/login", "/register", "/forgot-password"];
  useEffect(() => {
    if (!loading && !user && !PUBLIC_PATHS.includes(location)) {
      intendedRouteRef.current = location;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, location]);

  useEffect(() => {
    if (user && intendedRouteRef.current) {
      const dest = intendedRouteRef.current;
      intendedRouteRef.current = null;
      navigate(dest, { replace: true });
    }
  }, [user, navigate]);

  /* P4: Only request notification permission when it's still in the "default"
     state. After the user has explicitly granted or denied it, we never re-ask
     — modern browsers silently no-op anyway and the call would emit warnings
     that the global error reporter (PF1) would amplify. We also gate by a
     module-level flag so back-to-back logins/logouts in the same tab don't
     re-prompt on each `user` change.
     On native Capacitor builds registerPush() uses FCM directly and handles
     permission prompts itself — the Notification API guard is bypassed via the
     Capacitor.isNativePlatform() check inside push.ts. */
  useEffect(() => {
    if (!user) return undefined;
    const onForeground = (title: string, body: string) => {
      setFcmNotif({ title, body });
      if (fcmDismissTimer.current) clearTimeout(fcmDismissTimer.current);
      fcmDismissTimer.current = setTimeout(() => setFcmNotif(null), 5000);
    };
    /* When the rider taps a push notification (background / killed app), navigate
       to the Active screen so they can accept the ride immediately. */
    const onNotificationTap = (data: Record<string, string>) => {
      const type = data.type ?? "";
      if (type === "ai_chat" || type === "ai_response") {
        navigate("/chat?tab=ai");
        return;
      }
      if (type === "wallet" || type === "wallet_credit" || type === "wallet_debit") {
        navigate("/wallet");
        return;
      }
      if (type === "chat" || type === "support" || type === "admin_message") {
        navigate("/chat");
        return;
      }
      if (type === "penalty") {
        navigate("/penalty-history");
        return;
      }
      if (type === "review") {
        navigate("/reviews");
        return;
      }
      if (
        data.rideId ||
        data.orderId ||
        type === "ride_request" ||
        type === "new_ride" ||
        type === "order_request" ||
        type === "new_order"
      ) {
        navigate("/active");
      }
    };
    if (Capacitor.isNativePlatform()) {
      registerPush(onForeground, onNotificationTap)
        .then((cleanup) => {
          if (cleanup) fcmCleanupRef.current = cleanup;
        })
        .catch((err) => {
          log.warn("Push registration failed (native):", err);
        });
      return () => {
        fcmCleanupRef.current?.remove();
        if (fcmDismissTimer.current) clearTimeout(fcmDismissTimer.current);
      };
    }
    if (typeof Notification === "undefined") return undefined;
    if (!Notification.requestPermission) return undefined;
    if (sessionStorage.getItem(NOTIF_ASKED_KEY)) return undefined;
    if (Notification.permission !== "default") {
      if (Notification.permission === "granted")
        registerPush().catch((err) => {
          log.warn("Push registration failed (already granted):", err);
        });
      return undefined;
    }
    sessionStorage.setItem(NOTIF_ASKED_KEY, "1");
    Notification.requestPermission()
      .then((perm) => {
        if (perm === "granted")
          registerPush().catch((err) => {
            log.warn("Push registration failed after permission grant:", err);
          });
      })
      .catch((err) => {
        log.warn("Notification.requestPermission() failed:", err);
      });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* Show a subtle toast whenever refreshUser fails persistently */
  const [refreshFailToast, setRefreshFailToast] = useState(false);
  const refreshFailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handler = () => {
      setRefreshFailToast(true);
      if (refreshFailTimer.current) clearTimeout(refreshFailTimer.current);
      refreshFailTimer.current = setTimeout(() => setRefreshFailToast(false), 4000);
    };
    window.addEventListener("ajkmart:refresh-user-failed", handler);
    return () => {
      window.removeEventListener("ajkmart:refresh-user-failed", handler);
      if (refreshFailTimer.current) clearTimeout(refreshFailTimer.current);
    };
  }, []);

  /* PWA6: Global offline event surfaces a hint to the user immediately rather
     than waiting for the per-request 30s timeout to fire. Offline-aware pages
     (Active.tsx) maintain their own AbortControllers; this listener is purely
     for user feedback and does not abort cross-page requests (which would
     cause double-fire bugs in a single-page-app context). */
  const [offlineHint, setOfflineHint] = useState(false);
  useEffect(() => {
    const onOffline = () => setOfflineHint(true);
    const onOnline = () => setOfflineHint(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    setOfflineHint(typeof navigator !== "undefined" && navigator.onLine === false);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  /* U5: Splash deadline — if loading remains true past SPLASH_DEADLINE_MS,
     show a retry button. We don't unblock automatically because `loading=true`
     might mean a legitimately slow `getMe`; we just give the user an escape. */
  const [splashTimedOut, setSplashTimedOut] = useState(false);
  useEffect(() => {
    if (!loading) {
      setSplashTimedOut(false);
      return;
    }
    const id = setTimeout(() => setSplashTimedOut(true), SPLASH_DEADLINE_MS);
    return () => clearTimeout(id);
  }, [loading]);

  if (storageError)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0B0E11",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            background: "#131720",
            border: "1px solid #252836",
            borderRadius: 20,
            padding: "32px 24px",
            maxWidth: 360,
            width: "100%",
            textAlign: "center",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 style={{ color: "#E8E9EF", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
            Secure Storage Unavailable
          </h2>
          <p style={{ color: "#6B7280", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
            Login credentials cannot be stored safely on this device. Please clear the app's data or
            reinstall and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              height: 46,
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #F0B90B, #D97706)",
              color: "#0B0E11",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );

  if (loading)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0B0E11",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", padding: "0 24px" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 22,
              background: "linear-gradient(135deg, #F0B90B, #D97706)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              boxShadow: "0 8px 28px rgba(240,185,11,0.35)",
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0B0E11"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="5.5" cy="17.5" r="3.5" />
              <circle cx="18.5" cy="17.5" r="3.5" />
              <path d="M15 6H12L9 17.5" />
              <path d="M12 6l4 4-4 4" />
              <path d="M5.5 17.5L9 10l3 3" />
              <path d="M18.5 17.5L16 10h-3" />
            </svg>
          </div>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "3px solid #252836",
              borderTopColor: "#F0B90B",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto",
            }}
          />
          <p style={{ color: "#E8E9EF", marginTop: 16, fontWeight: 600, fontSize: 15 }}>
            {T("loadingRiderPortal")}
          </p>
          {splashTimedOut && (
            <div
              style={{
                marginTop: 20,
                background: "rgba(255,255,255,0.05)",
                borderRadius: 16,
                padding: 16,
                maxWidth: 280,
                margin: "20px auto 0",
                border: "1px solid #252836",
              }}
            >
              <p style={{ color: "#6B7280", fontSize: 13, marginBottom: 12 }}>
                Couldn't reach server. Please check your connection.
              </p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 10,
                  border: "none",
                  background: "#F0B90B",
                  color: "#0B0E11",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {T("retry")}
              </button>
            </div>
          )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );

  if (!user)
    return (
      <>
        {sessionExpired && (
          <SessionExpiredOverlay
            onDismiss={() => {
              clearSessionExpired();
              navigate("/login");
            }}
          />
        )}
        {!sessionExpired && (
          <Suspense fallback={<PageFallback />}>
            <Switch>
              <Route path="/" component={GuestLanding} />
              <Route path="/register">{() => <Register />}</Route>
              <Route path="/forgot-password" component={ForgotPassword} />
              <Route path="/login">{() => <Login />}</Route>
              <Route>
                <GuestLanding />
              </Route>
            </Switch>
          </Suspense>
        )}
      </>
    );

  /* S-Sec10: When entering a non-active branch (pending / rejected /
     maintenance) clear cached query data so a brief route swap can't read
     the previous active session's `rider-active` cache. We do this in a
     module-scope effect so it runs once per branch entry. */
  const supportPhone = (config.content as { supportPhone?: string } | undefined)?.supportPhone;

  /* ── Approval status guard — shown after session rehydration if still pending/rejected ── */
  if (user.approvalStatus === "pending") {
    qc.clear(); /* S-Sec10 */
    const submittedAt = user.createdAt ? new Date(user.createdAt) : null;
    const submittedLabel = submittedAt
      ? (() => {
          const diffMs = Date.now() - submittedAt.getTime();
          const diffMin = Math.floor(diffMs / 60000);
          if (diffMin < 2) return "Submitted just now";
          if (diffMin < 60) return `Submitted ${diffMin} minutes ago`;
          const diffHr = Math.floor(diffMin / 60);
          if (diffHr < 24) return `Submitted ${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
          return `Submitted on ${submittedAt.toLocaleDateString("en-PK", { day: "numeric", month: "short" })}`;
        })()
      : null;
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50 p-5">
        <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-xl">
          {/* Header */}
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 px-6 pt-8 pb-6 text-white">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/15">
              <span className="text-3xl">⏳</span>
            </div>
            <h2 className="mb-1 text-xl font-extrabold">Application Submitted</h2>
            <p className="text-sm text-gray-400">
              Welcome, <span className="font-semibold text-white">{user.name || "Rider"}</span>
            </p>
            {submittedLabel && <p className="mt-1 text-xs text-gray-500">{submittedLabel}</p>}
          </div>

          {/* Progress checklist */}
          <div className="space-y-3 px-6 py-5">
            <p className="mb-3 text-xs font-bold tracking-wider text-gray-500 uppercase">
              Application Progress
            </p>
            {[
              {
                num: 1,
                label: "Registration submitted",
                sub: "Your account details are saved",
                done: true,
                locked: false,
                pulse: false,
              },
              {
                num: 2,
                label: "Documents under review",
                sub: "Admin is reviewing your documents",
                done: false,
                locked: false,
                pulse: true,
              },
              {
                num: 3,
                label: "Go online & accept rides",
                sub: "Unlocks after admin approval",
                done: false,
                locked: true,
                pulse: false,
              },
              {
                num: 4,
                label: "Withdraw earnings",
                sub: "Unlocks after approval + bank info",
                done: false,
                locked: true,
                pulse: false,
              },
            ].map((item) => (
              <div
                key={item.num}
                className={`flex items-start gap-3 rounded-2xl p-3 ${
                  item.done
                    ? "border border-green-100 bg-green-50"
                    : item.locked
                      ? "border border-gray-100 bg-gray-50"
                      : "border border-amber-100 bg-amber-50"
                }`}
              >
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${
                    item.done
                      ? "bg-green-500 text-white"
                      : item.locked
                        ? "bg-gray-200 text-gray-400"
                        : "bg-amber-400 text-white"
                  }`}
                >
                  {item.done ? "✓" : item.locked ? "🔒" : item.num}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-bold ${
                      item.done
                        ? "text-green-700"
                        : item.locked
                          ? "text-gray-400"
                          : "text-amber-700"
                    }`}
                  >
                    {item.label}
                  </p>
                  <p
                    className={`mt-0.5 text-xs ${
                      item.done
                        ? "text-green-600"
                        : item.locked
                          ? "text-gray-400"
                          : "text-amber-600"
                    } ${item.pulse ? "animate-pulse" : ""}`}
                  >
                    {item.sub}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-2 px-6 pb-6">
            {supportPhone && (
              <a
                href={`tel:${supportPhone}`}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                📞 {T("contactSupport")}
              </a>
            )}
            <button
              onClick={async () => {
                try {
                  logout();
                } finally {
                  window.location.reload();
                }
              }}
              className="w-full rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200"
            >
              {T("signOutLabel")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (user.approvalStatus === "rejected") {
    qc.clear(); /* S-Sec10 */
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-rose-100 p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="mb-4 text-5xl">
            <span>❌</span>
          </div>
          <h2 className="mb-2 text-xl font-bold text-gray-800">Account Rejected</h2>
          <p className="mb-2 text-sm leading-relaxed text-gray-500">
            Your rider account application was not approved.
          </p>
          {user.rejectionReason && (
            <p className="mb-6 text-sm font-medium text-red-600">
              {T("reason")}: {user.rejectionReason}
            </p>
          )}
          {supportPhone && (
            <a
              href={`tel:${supportPhone}`}
              className="mb-2 block w-full rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              {T("contactSupport")}
            </a>
          )}
          <button
            onClick={async () => {
              try {
                logout();
              } finally {
                window.location.reload();
              }
            }}
            className="w-full rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200"
          >
            {T("signOutLabel")}
          </button>
        </div>
      </div>
    );
  }

  if (user.isRestricted) {
    qc.clear(); /* S-Sec10 */
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-rose-100 p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="mb-4 text-5xl">
            <span>🚫</span>
          </div>
          <h2 className="mb-2 text-xl font-bold text-gray-800">Account Suspended</h2>
          <p className="mb-6 text-sm leading-relaxed text-gray-500">
            Your account has been suspended. Please contact support for assistance.
          </p>
          {supportPhone && (
            <a
              href={`tel:${supportPhone}`}
              className="mb-2 block w-full rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              {T("contactSupport")}
            </a>
          )}
          <button
            onClick={async () => {
              try {
                logout();
              } finally {
                window.location.reload();
              }
            }}
            className="w-full rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200"
          >
            {T("signOutLabel")}
          </button>
        </div>
      </div>
    );
  }

  if (config.platform.appStatus === "maintenance") {
    qc.clear(); /* S-Sec10 */
    return (
      <MaintenanceScreen
        message={config.content.maintenanceMsg}
        appName={config.platform.appName}
      />
    );
  }

  const isLimited = config.platform.appStatus === "limited";

  const userRoles: string[] = Array.isArray(user.roles) ? user.roles : [];
  const isVanDriver =
    userRoles.includes("van_driver") || user.vehicleType === "van" || user.vehicleType === "bus";

  if (isVanDriver) {
    return (
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col">
        {isLimited && (
          <div className="pointer-events-none fixed inset-x-0 top-0 z-50 bg-orange-400 px-4 py-2 text-center text-xs font-bold text-white shadow">
            ⚠️ Limited service — some features may be temporarily unavailable
          </div>
        )}
        {refreshFailToast && (
          <div className="pointer-events-none fixed top-4 left-1/2 z-[9999] -translate-x-1/2 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-lg">
            {/* U1: At minimum the dynamic data piece is i18n-aware via T("offline"); the
                static refresh-failure phrase is platform-config copy that follows
                the rest of admin-driven content (config.content), not the bundled
                i18n keys. We keep the English string here intentionally rather than
                add a new bundled key just for this one toast. */}
            Connection issue — profile sync failed
          </div>
        )}
        {offlineHint && (
          <div className="pointer-events-none fixed top-12 left-1/2 z-[9999] -translate-x-1/2 rounded-full bg-yellow-400 px-4 py-2 text-xs font-bold text-gray-900 shadow-lg">
            {T("offline")}
          </div>
        )}
        {fcmNotif && (
          <button
            onClick={() => setFcmNotif(null)}
            className="fixed top-4 right-4 left-4 z-[10000] rounded-2xl bg-emerald-700 px-4 py-3 text-left text-sm font-semibold text-white shadow-xl"
          >
            <div className="truncate font-bold">{fcmNotif.title}</div>
            <div className="truncate text-xs opacity-90">{fcmNotif.body}</div>
          </button>
        )}
        <div className="flex-1">
          <Suspense fallback={<PageFallback />}>
            <VanDriver />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col">
      {isLimited && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50 bg-orange-400 px-4 py-2 text-center text-xs font-bold text-white shadow">
          ⚠️ Limited service — some features may be temporarily unavailable
        </div>
      )}
      {refreshFailToast && (
        <div className="pointer-events-none fixed top-4 left-1/2 z-[9999] -translate-x-1/2 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-lg">
          Connection issue — profile sync failed
        </div>
      )}
      {offlineHint && (
        <div className="pointer-events-none fixed top-12 left-1/2 z-[9999] -translate-x-1/2 rounded-full bg-yellow-400 px-4 py-2 text-xs font-bold text-gray-900 shadow-lg">
          {T("offline")}
        </div>
      )}
      {fcmNotif && (
        <button
          onClick={() => setFcmNotif(null)}
          className="fixed top-4 right-4 left-4 z-[10000] rounded-2xl bg-emerald-700 px-4 py-3 text-left text-sm font-semibold text-white shadow-xl"
        >
          <div className="truncate font-bold">{fcmNotif.title}</div>
          <div className="truncate text-xs opacity-90">{fcmNotif.body}</div>
        </button>
      )}

      {/* U2: Cap the announcement bar at a compact strip; long messages scroll
          internally rather than consuming a third of the viewport. */}
      <div className="sticky top-0 z-50 flex max-h-[80px] flex-col overflow-y-auto">
        <AnnouncementBar message={config.content.announcement} />
      </div>
      <PopupEngine />

      <div
        className="flex-1"
        style={{ paddingBottom: "calc(64px + max(8px, env(safe-area-inset-bottom, 8px)))" }}
      >
        <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/">
              {() => (
                <ErrorBoundary>
                  <Home />
                </ErrorBoundary>
              )}
            </Route>
            <Route path="/active">
              {() => (
                <ErrorBoundary>
                  <Active />
                </ErrorBoundary>
              )}
            </Route>
            {modules.history && (
              <Route path="/history">
                {() => (
                  <ErrorBoundary>
                    <History />
                  </ErrorBoundary>
                )}
              </Route>
            )}
            {modules.earnings && (
              <Route path="/earnings">
                {() => (
                  <ErrorBoundary>
                    <Earnings />
                  </ErrorBoundary>
                )}
              </Route>
            )}
            {modules.wallet && (
              <Route path="/wallet">
                {() => (
                  <ErrorBoundary>
                    <Wallet />
                  </ErrorBoundary>
                )}
              </Route>
            )}
            <Route path="/notifications">
              {() => (
                <ErrorBoundary>
                  <Notifications />
                </ErrorBoundary>
              )}
            </Route>
            <Route path="/profile">
              {() => (
                <ErrorBoundary>
                  <Profile />
                </ErrorBoundary>
              )}
            </Route>
            <Route path="/settings/security">
              {() => (
                <ErrorBoundary>
                  <SecuritySettings />
                </ErrorBoundary>
              )}
            </Route>
            {/* /security is a legacy alias — canonical path is /settings/security */}
            <Route path="/security">{() => <RedirectTo to="/settings/security" />}</Route>
            <Route path="/van">
              {() => (
                <ErrorBoundary>
                  <VanDriver />
                </ErrorBoundary>
              )}
            </Route>
            {/* /van-driver is a legacy alias — canonical path is /van */}
            <Route path="/van-driver">{() => <RedirectTo to="/van" />}</Route>
            <Route path="/chat">
              {() => (
                <ErrorBoundary>
                  <Chat />
                </ErrorBoundary>
              )}
            </Route>
            <Route path="/chat/:id">
              {() => (
                <ErrorBoundary>
                  <Chat />
                </ErrorBoundary>
              )}
            </Route>
            <Route path="/reviews">
              {() => (
                <ErrorBoundary>
                  <Reviews />
                </ErrorBoundary>
              )}
            </Route>
            <Route path="/penalty-history">
              {() => (
                <ErrorBoundary>
                  <PenaltyHistory />
                </ErrorBoundary>
              )}
            </Route>
            {/* /dashboard is a legacy alias — canonical root is / */}
            <Route path="/dashboard">{() => <RedirectTo to="/" />}</Route>
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </div>
      <BottomNav />
    </div>
  );
}

function VersionCheckInit() {
  useVersionCheck();
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <VersionCheckInit />
        <LanguageProvider>
          <RiderAuthConfigProvider>
            <RiderAuthProvider>
              <ThemeProvider theme={riderTheme}>
                <SocketProvider>
                  <WouterRouter base={getRouterBase()}>
                    <AppRoutes />
                  </WouterRouter>
                  <Toaster />
                  <PwaInstallBanner />
                </SocketProvider>
              </ThemeProvider>
            </RiderAuthProvider>
          </RiderAuthConfigProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
