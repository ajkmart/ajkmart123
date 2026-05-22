/**
 * Push notification registration — rider app.
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
import { z } from "zod";
import { api, getApiBase } from "./api";
import { riderEnv } from "./envValidation";
const log = createLogger("[push]");

const PushPayloadSchema = z
  .object({
    type: z.string().optional(),
    rideId: z.string().optional(),
    orderId: z.string().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    route: z.string().optional(),
  })
  .passthrough();

/* ─── AI tab active flag ───────────────────────────────────────────────────────
 * Chat.tsx sets this to true whenever the rider has the AI Help tab open and
 * in the foreground. The foreground push handler checks this flag to suppress
 * redundant ai_chat notifications while the rider is already reading the reply.
 * ────────────────────────────────────────────────────────────────────────── */
let _aiTabActive = false;

/** Called by Chat.tsx to register or unregister the AI Help tab as active. */
export function setAiTabActive(active: boolean): void {
  _aiTabActive = active;
}

/** Returns true when the rider currently has the AI Help tab open. */
export function isAiTabActive(): boolean {
  return _aiTabActive;
}

type PushPayload = z.infer<typeof PushPayloadSchema>;

function validatePushPayload(raw: unknown): PushPayload | null {
  const result = PushPayloadSchema.safeParse(raw);
  if (!result.success) {
    log.warn("Malformed payload dropped:", raw);
    return null;
  }
  return result.data;
}

/** Listener cleanup handle returned to callers for foreground messages. */
export interface PushCleanup {
  remove: () => void;
}

/** Called when the rider taps a push notification. Receives the raw data payload. */
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
        const raw = action.notification?.data ?? {};
        const validated = validatePushPayload(raw);
        if (validated && Object.keys(validated).length > 0) {
          _pendingTapData = validated as Record<string, string>;
        }
      }).catch((err) => {
        log.warn("pushNotificationActionPerformed listener registration failed:", err);
      });
    })
    .catch((err) => {
      log.warn("registrationError listener registration failed:", err);
    });
}

export async function registerPush(
  onForegroundMessage?: (title: string, body: string) => void,
  onNotificationTap?: NotificationTapHandler
): Promise<PushCleanup | void> {
  if (Capacitor.isNativePlatform()) {
    return registerFcmPush(onForegroundMessage, onNotificationTap);
  }
  return registerVapidPush();
}

/* ─── Native FCM path ─────────────────────────────────────────────────────── */

async function registerFcmPush(
  onForegroundMessage?: (title: string, body: string) => void,
  onNotificationTap?: NotificationTapHandler
): Promise<PushCleanup | void> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") {
      log.warn("FCM permission denied");
      return;
    }

    const cleanups: Array<{ remove: () => void }> = [];
    const apiBase = getApiBase().replace(/\/api$/, "");

    /* Helper: send (or refresh) the FCM token with the server.  Called both on
       initial registration and whenever FCM rotates the token (reinstall, OS
       update, app data clear, etc.).  The server-side handler deletes all old
       FCM rows for this user+role before inserting the new token. */
    const registerTokenWithServer = async (token: string) => {
      const authToken = api.getToken();
      if (!authToken) return;
      const res = await fetch(`${apiBase}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ type: "fcm", token, role: "rider" }),
      });
      if (!res.ok) {
        log.warn("FCM token registration failed:", res.status, res.statusText);
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
          console.warn("[artifacts/rider-app/src/lib/push.ts]", err);
        }); // eslint-disable-line no-console
      })
        .then((h) => cleanups.push(h))
        .catch(reject);

      PushNotifications.addListener("registrationError", (err) => {
        reject(new Error(err.error));
      })
        .then((h) => cleanups.push(h))
        .catch((err) => {
          console.warn("[artifacts/rider-app/src/lib/push.ts]", err);
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
            console.warn("[artifacts/rider-app/src/lib/push.ts]", err);
          }); // eslint-disable-line no-console
      })
      .then((h) => cleanups.push(h))
      .catch((err) => {
        console.warn("[artifacts/rider-app/src/lib/push.ts]", err);
      }); // eslint-disable-line no-console

    if (onForegroundMessage) {
      PushNotifications.addListener("pushNotificationReceived", (notification) => {
        const raw = notification.data ?? {};
        const validated = validatePushPayload(raw);
        if (validated == null) return;
        /* Suppress ai_chat notifications while the rider already has the AI
           Help tab open — they can see the reply directly without a banner. */
        if (validated.type === "ai_chat" && _aiTabActive) return;
        onForegroundMessage(notification.title ?? "", notification.body ?? "");
      })
        .then((h) => cleanups.push(h))
        .catch((err) => {
          console.warn("[artifacts/rider-app/src/lib/push.ts]", err);
        }); // eslint-disable-line no-console
    }

    /* Handle notification tap — fires when rider taps the notification in the
       system tray (background / killed app state).  The data payload (set by
       the server as { rideId }) is available at notification.notification.data. */
    if (onNotificationTap) {
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const raw = action.notification?.data ?? {};
        const validated = validatePushPayload(raw);
        if (validated == null) return;
        onNotificationTap(validated as Record<string, string>);
      })
        .then((h) => cleanups.push(h))
        .catch((err) => {
          console.warn("[artifacts/rider-app/src/lib/push.ts]", err);
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
  }
}

/* ─── Browser VAPID path ──────────────────────────────────────────────────── */

async function registerVapidPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const swBase = (riderEnv.baseUrl || "/").replace(/\/$/, "");
    const apiBase = getApiBase().replace(/\/+$/, "");
    const reg = await navigator.serviceWorker.register(`${swBase}/sw.js`, { scope: swBase + "/" });
    const existing = await reg.pushManager.getSubscription();
    if (existing) return;

    const vapidRes = await fetch(`${apiBase}/push/vapid-key`);
    if (!vapidRes.ok) return;
    const vj = await vapidRes.json();
    const { publicKey } = (vj?.success === true && "data" in vj ? vj.data : vj) as {
      publicKey: string;
    };
    if (!publicKey) return;

    const keyBytes = urlBase64ToUint8Array(publicKey);
    const keyBuffer = new ArrayBuffer(keyBytes.byteLength);
    new Uint8Array(keyBuffer).set(keyBytes);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBuffer,
    });

    const token = api.getToken();
    if (!token) {
      log.warn("VAPID subscription registration skipped — no auth token (rider not logged in)");
      return;
    }
    await fetch(`${apiBase}/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        type: "vapid",
        endpoint: sub.endpoint,
        p256dh: sub.toJSON().keys?.p256dh,
        auth: sub.toJSON().keys?.auth,
        role: "rider",
      }),
    });
  } catch (e) {
    log.warn("VAPID registration failed:", e);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
