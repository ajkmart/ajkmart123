import { createLogger } from "@/lib/logger";
const log = createLogger("[push]");

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export async function registerPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.register(`${BASE}/sw.js`);
    const existing = await reg.pushManager.getSubscription();
    if (existing) return;

    const vapidRes = await fetch(`${BASE}/api/push/vapid-key`);
    if (!vapidRes.ok) return;
    const vj = await vapidRes.json();
    const { publicKey } = (vj?.success === true && "data" in vj ? vj.data : vj) as {
      publicKey: string;
    };
    if (!publicKey) return;

    const decoded = urlBase64ToUint8Array(publicKey);
    if (!decoded) return;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decoded,
    });

    const { fetchAdminAbsolute } = await import("./adminFetcher");
    await fetchAdminAbsolute(`${BASE}/api/push/subscribe`, {
      method: "POST",
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: sub.toJSON().keys?.p256dh,
        auth: sub.toJSON().keys?.auth,
        role: "admin",
      }),
    });
  } catch (e) {
    log.warn("registration failed:", e);
  }
}

/**
 * Decode a URL-safe base64 VAPID key into a Uint8Array. Validates the
 * input character set and decoder output before returning, so a malformed
 * key (wrong characters, atob failure) returns null instead of throwing
 * deep inside `pushManager.subscribe`.
 */
const URL_SAFE_B64 = /^[A-Za-z0-9_\-]+=*$/;
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> | null {
  if (typeof base64String !== "string" || base64String.length === 0) return null;
  if (!URL_SAFE_B64.test(base64String)) {
    log.warn("vapid key has invalid characters");
    return null;
  }
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  let rawData: string;
  try {
    rawData = window.atob(base64);
  } catch (err) {
    log.warn("vapid key atob failed:", err);
    return null;
  }
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}
