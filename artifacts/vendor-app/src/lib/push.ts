/**
 * Push notification registration — vendor app.
 *
 * Strategy:
 *   • Native (Capacitor on Android/iOS): uses @capacitor/push-notifications
 *     to obtain an FCM device token and registers it with the server as
 *     type="fcm".  Foreground notifications are surfaced via a listener
 *     returned from registerPush() so the App can display an in-app banner.
 *   • Browser (PWA): falls back to the existing VAPID / Web Push path.
 *
 * APNs (iOS): No additional server-side code is required.  Upload your APNs
 * auth key to the Firebase Console → Project Settings → Cloud Messaging →
 * iOS app configuration.  The Firebase Admin SDK routes FCM messages to APNs
 * automatically.  The google-services.json (Android) and
 * GoogleService-Info.plist (iOS) must be placed in the respective native
 * project roots before building.
 */

import { createLogger } from "@/lib/logger";
import { Capacitor } from "@capacitor/core";
import { api } from "./api";
import { vendorEnv } from "./envValidation";
const log = createLogger("[push]");

/* API origin for native Capacitor builds; empty string falls through to
   relative paths in web-proxy mode. Sourced from the validated env singleton. */
const API_ORIGIN =
  vendorEnv.isCapacitor && vendorEnv.apiBaseUrl ? vendorEnv.apiBaseUrl.replace(/\/+$/, "") : "";

/** Listener cleanup handle returned to callers for foreground messages. */
export interface PushCleanup {
  remove: () => void;
}

/** Called when the vendor taps a push notification. Receives the raw data payload. */
export type NotificationTapHandler = (data: Record<string, string>) => void;

/* ─── Cold-start tap capture ──────────────────────────────────────────────────
 * When the app is launched from a killed state by tapping a notification,
 * pushNotificationActionPerformed fires before auth is rehydrated.  We
 * capture it eagerly at module load time so it can be consumed later, after
 * the user session is available (see consumePendingNotificationTap in App.tsx).
 * ────────────────────────────────────────────────────────────────────────── */
let _pendingTapData: Record<string, string> | null = null;

/** Returns and clears any notification tap data captured before auth loaded. */
export function consumePendingNotificationTap(): Record<string, string> | null {
  const d = _pendingTapData;
  _pendingTapData = null;
  return d;
}

if (Capacitor.isNativePlatform()) {
  import("@capacitor/push-notifications")
    .then(({ PushNotifications }) => {
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const data = (action.notification?.data ?? {}) as Record<string, string>;
        if (Object.keys(data).length > 0) {
          _pendingTapData = data;
        }
      }).catch((err) => {
        console.warn("[artifacts/vendor-app/src/lib/push.ts]", err);
      }); // eslint-disable-line no-console
    })
    .catch((err) => {
      console.warn("[artifacts/vendor-app/src/lib/push.ts]", err);
    }); // eslint-disable-line no-console
}

/** Called when push registration fails so the UI can show a re-enable prompt. */
export type PushErrorHandler = (
  reason: "permission_denied" | "registration_failed" | "network_error"
) => void;

export async function registerPush(
  onForegroundMessage?: (title: string, body: string, data?: Record<string, string>) => void,
  onNotificationTap?: NotificationTapHandler,
  onError?: PushErrorHandler
): Promise<PushCleanup | void> {
  if (Capacitor.isNativePlatform()) {
    return registerFcmPush(onForegroundMessage, onNotificationTap, onError);
  }
  return registerVapidPush(onError);
}

/* ─── Native FCM path ─────────────────────────────────────────────────────── */

function getAuthToken(): string {
  /* Use the api module's in-memory token — never localStorage, which is purged
     on startup. Reading from localStorage would always return "" and cause all
     push subscription requests to fail with 401. */
  return api.getToken();
}

async function registerFcmPush(
  onForegroundMessage?: (title: string, body: string, data?: Record<string, string>) => void,
  onNotificationTap?: NotificationTapHandler,
  onError?: PushErrorHandler
): Promise<PushCleanup | void> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") {
      log.warn("FCM permission denied");
      onError?.("permission_denied");
      return;
    }

    const cleanups: Array<{ remove: () => void }> = [];

    /* Helper: send (or refresh) the FCM token with the server.  Called both on
       initial registration and whenever FCM rotates the token (reinstall, OS
       update, app data clear, etc.).
       Retries up to MAX_ATTEMPTS times with exponential backoff so transient
       network errors don't silently drop the token registration. */
    const MAX_ATTEMPTS = 3;
    const registerTokenWithServer = async (token: string) => {
      const authToken = getAuthToken();
      if (!authToken) {
        log.warn("FCM token registration skipped — no auth token yet");
        return;
      }
      let lastStatus = 0;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const res = await fetch(`${API_ORIGIN}/api/push/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ type: "fcm", token, role: "vendor" }),
          });
          lastStatus = res.status;
          if (res.ok || res.status === 409) return; /* 409 = already registered, both are success */
          log.warn(
            `FCM token registration attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
            res.status,
            res.statusText
          );
          /* 4xx errors are client-side failures — no point retrying */
          if (res.status >= 400 && res.status < 500) {
            onError?.("registration_failed");
            return;
          }
        } catch (fetchErr) {
          log.warn(
            `FCM token registration attempt ${attempt}/${MAX_ATTEMPTS} network error:`,
            fetchErr
          );
          lastStatus = 0;
        }
        if (attempt < MAX_ATTEMPTS) {
          /* Exponential backoff: 500ms, 1000ms */
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
      /* All retries exhausted */
      log.error(
        `FCM token registration failed after ${MAX_ATTEMPTS} attempts. Last status: ${lastStatus}`,
        { token: token.slice(0, 20) + "…", apiOrigin: API_ORIGIN || "(relative)" }
      );
      if (lastStatus === 0) {
        onError?.("network_error");
      } else {
        onError?.("registration_failed");
      }
    };

    /* Attach ALL listeners BEFORE calling register() so no token/error events
       are missed if they fire synchronously or very quickly after register(). */
    const tokenPromise = new Promise<string>((resolve, reject) => {
      PushNotifications.addListener("registration", async (newToken) => {
        /* resolve() is idempotent — subsequent calls (token rotation) are no-ops
           on the promise but we still re-register the new token with the server. */
        resolve(newToken.value);
        await registerTokenWithServer(newToken.value).catch((err) => {
          console.warn("[artifacts/vendor-app/src/lib/push.ts]", err);
        }); // eslint-disable-line no-console
      })
        .then((h) => cleanups.push(h))
        .catch(reject);

      PushNotifications.addListener("registrationError", (err) => {
        reject(new Error(err.error));
      })
        .then((h) => cleanups.push(h))
        .catch((err) => {
          console.warn("[artifacts/vendor-app/src/lib/push.ts]", err);
        }); // eslint-disable-line no-console
    });

    /* Token refresh listener — fires when FCM rotates the device token without
       the app explicitly calling register() again (e.g. device restore, certain
       OS upgrades).  The official @capacitor/push-notifications types do not
       expose this event yet, but the underlying native layer does emit it on
       some configurations; we handle it defensively alongside the registration
       event so no rotation is missed. */
    (
      PushNotifications as unknown as {
        addListener(
          e: "tokenRefresh",
          fn: (t: { registration?: string; value?: string }) => void
        ): Promise<{ remove: () => void }>;
      }
    )
      .addListener("tokenRefresh", async (newToken) => {
        const token = newToken.registration ?? newToken.value;
        if (token)
          await registerTokenWithServer(token).catch((err) => {
            console.warn("[artifacts/vendor-app/src/lib/push.ts]", err);
          }); // eslint-disable-line no-console
      })
      .then((h) => cleanups.push(h))
      .catch((err) => {
        console.warn("[artifacts/vendor-app/src/lib/push.ts]", err);
      }); // eslint-disable-line no-console

    if (onForegroundMessage) {
      PushNotifications.addListener("pushNotificationReceived", (notification) => {
        const data = (notification.data ?? {}) as Record<string, string>;
        onForegroundMessage(notification.title ?? "", notification.body ?? "", data);
      })
        .then((h) => cleanups.push(h))
        .catch((err) => {
          console.warn("[artifacts/vendor-app/src/lib/push.ts]", err);
        }); // eslint-disable-line no-console
    }

    /* Handle notification tap — fires when vendor taps the notification in the
       system tray (background / killed app state).  data.orderId is included by
       the server so the vendor app can deep-link straight to /orders on tap.
       We also clear _pendingTapData here so the cold-start auth effect doesn't
       replay the same tap a second time. */
    if (onNotificationTap) {
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        _pendingTapData = null;
        const data = (action.notification?.data ?? {}) as Record<string, string>;
        onNotificationTap(data);
      })
        .then((h) => cleanups.push(h))
        .catch((err) => {
          console.warn("[artifacts/vendor-app/src/lib/push.ts]", err);
        }); // eslint-disable-line no-console
    }

    /* Now trigger registration — token/error events may fire after this. */
    await PushNotifications.register();

    /* Wait for the initial FCM token (with a reasonable timeout).
       Token delivery and server registration are handled by the registration listener. */
    const TOKEN_TIMEOUT_MS = 15_000;
    await Promise.race<void>([
      tokenPromise.then(() => {}),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("FCM registration timeout")), TOKEN_TIMEOUT_MS)
      ),
    ]);

    return { remove: () => cleanups.forEach((h) => h.remove()) };
  } catch (e) {
    log.warn("FCM registration failed:", e);
    onError?.("registration_failed");
  }
}

/* ─── Browser VAPID path ──────────────────────────────────────────────────── */

async function registerVapidPush(onError?: PushErrorHandler): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const swBase = (vendorEnv.baseUrl || "/").replace(/\/$/, "");

    /* Check if permission was denied before attempting registration */
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      onError?.("permission_denied");
      return;
    }

    const reg = await navigator.serviceWorker.register(`${swBase}/sw.js`);
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      /* Re-send the existing subscription to keep the server token fresh. */
      const authToken = getAuthToken();
      if (authToken) {
        const res = await fetch(`${API_ORIGIN}/api/push/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            type: "vapid",
            endpoint: existing.endpoint,
            p256dh: existing.toJSON().keys?.p256dh,
            auth: existing.toJSON().keys?.auth,
            role: "vendor",
          }),
        });
        if (!res.ok && res.status !== 409) {
          log.warn("VAPID re-registration failed:", res.status);
          if (res.status >= 400 && res.status < 500) {
            /* 4xx: subscription is stale — unsubscribe and force fresh registration */
            await existing.unsubscribe().catch((err) => {
              console.warn("[artifacts/vendor-app/src/lib/push.ts]", err);
            }); // eslint-disable-line no-console
            onError?.("registration_failed");
          } else if (res.status >= 500) {
            /* 5xx: server error — surface to UI so vendor knows push may be degraded */
            onError?.("network_error");
          }
        }
      }
      return;
    }

    const vapidRes = await fetch(`${API_ORIGIN}/api/push/vapid-key`);
    if (!vapidRes.ok) {
      onError?.("network_error");
      return;
    }
    const vj = await vapidRes.json();
    const { publicKey } = (vj?.success === true && "data" in vj ? vj.data : vj) as {
      publicKey: string;
    };
    if (!publicKey) {
      onError?.("registration_failed");
      return;
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });

    const authToken = getAuthToken();
    if (!authToken) {
      log.warn("VAPID subscription registration skipped — no auth token (user not logged in)");
      return;
    }
    const res = await fetch(`${API_ORIGIN}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        type: "vapid",
        endpoint: sub.endpoint,
        p256dh: sub.toJSON().keys?.p256dh,
        auth: sub.toJSON().keys?.auth,
        role: "vendor",
      }),
    });
    if (!res.ok && res.status !== 409) {
      log.warn("VAPID subscription registration failed:", res.status);
      onError?.("registration_failed");
    }
  } catch (e: unknown) {
    log.warn("VAPID registration failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("permission") || msg.includes("denied") || msg.includes("NotAllowed")) {
      onError?.("permission_denied");
    } else if (
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("Failed to fetch")
    ) {
      onError?.("network_error");
    } else {
      onError?.("registration_failed");
    }
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
