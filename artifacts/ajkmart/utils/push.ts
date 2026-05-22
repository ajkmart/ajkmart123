/**
 * VAPID Web Push registration for the customer PWA.
 * No-op on native platforms — native push is handled via expo-notifications.
 */
import { Platform } from "react-native";
import { createLogger } from "@/utils/logger";
const log = createLogger("[Push]");

const API_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function registerPush(authToken: string): Promise<void> {
  if (Platform.OS !== "web") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");

    const existing = await reg.pushManager.getSubscription();
    if (existing) return;

    const vapidRes = await fetch(`https://${API_DOMAIN}/api/push/vapid-key`);
    if (!vapidRes.ok) return;
    const vj = await vapidRes.json();
    const { publicKey } = (
      vj?.success === true && "data" in vj ? vj.data : vj
    ) as { publicKey: string };
    if (!publicKey) return;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
    });

    const keys = sub.toJSON().keys ?? {};
    await fetch(`https://${API_DOMAIN}/api/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        role: "customer",
      }),
    });

  } catch (e) {
    log.warn("Registration failed:", e);
  }
}

export async function unregisterPush(): Promise<void> {
  if (Platform.OS !== "web") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  // eslint-disable-next-line ajk-local/no-silent-catch -- push unsubscribe failure is non-critical; subscription expires naturally
  } catch {
    /* ignore */
  }
}
