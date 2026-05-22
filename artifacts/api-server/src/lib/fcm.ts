/**
 * FCM (Firebase Cloud Messaging) helper for native Capacitor push delivery.
 *
 * Uses the Firebase Admin SDK initialised via services/firebase.ts (lazy,
 * env-driven).  When Firebase is not configured every function is a no-op.
 *
 * APNs note: To enable iOS background delivery upload your APNs authentication
 * key (or certificate) to the Firebase Console under
 * Project Settings → Cloud Messaging → iOS app configuration.  No server-side
 * code change is needed — the Admin SDK routes FCM messages to APNs
 * automatically once the key is registered.
 */

import { getFirebaseAdmin } from "../services/firebase.js";
import { logger } from "./logger.js";

interface FcmPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, string>;
}

/** Maximum tokens per Firebase `sendEachForMulticast` call. */
const FCM_CHUNK_SIZE = 500;

/**
 * Send a notification to a single FCM device token.
 * Returns true on success, false on any failure.
 */
export async function sendFcmToToken(token: string, payload: FcmPayload): Promise<boolean> {
  const admin = await getFirebaseAdmin();
  if (!admin) return false;

  const dataEntries = buildDataEntries(payload);
  try {
    await admin.messaging().send({
      token,
      notification: { title: payload.title, body: payload.body },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
          ...(payload.icon ? { icon: payload.icon } : {}),
        },
      },
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
      },
      data: dataEntries,
    });
    return true;
  } catch (err: any) {
    const code: string = err?.errorInfo?.code ?? err?.code ?? "";
    if (isStaleTokenError(code)) {
      logger.info({ token: token.slice(0, 20) }, "[fcm] stale token");
    } else {
      logger.warn({ err: err?.message, code }, "[fcm] send failed");
    }
    return false;
  }
}

/**
 * Send to multiple FCM tokens, returning the list of stale tokens
 * that should be removed from the database.
 * Internally chunks into batches of ≤500 to respect Firebase limits.
 */
export async function sendFcmToTokens(
  tokens: string[],
  payload: FcmPayload
): Promise<{ stale: string[]; delivered: number }> {
  if (tokens.length === 0) return { stale: [], delivered: 0 };
  const admin = await getFirebaseAdmin();
  if (!admin) return { stale: [], delivered: 0 };

  const dataEntries = buildDataEntries(payload);
  const stale: string[] = [];
  let delivered = 0;

  /* Process in chunks of FCM_CHUNK_SIZE (≤500 per Firebase restriction). */
  for (let i = 0; i < tokens.length; i += FCM_CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + FCM_CHUNK_SIZE);
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title: payload.title, body: payload.body },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            ...(payload.icon ? { icon: payload.icon } : {}),
          },
        },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
        },
        data: dataEntries,
      });

      response.responses.forEach((r, idx) => {
        if (r.success) {
          delivered++;
        } else {
          const code = r.error?.code ?? "";
          if (isStaleTokenError(code)) {
            stale.push(chunk[idx]!);
          } else {
            logger.warn({ err: r.error?.message, code }, "[fcm] multicast: one token failed");
          }
        }
      });
    } catch (err: any) {
      logger.warn({ err: err?.message }, "[fcm] multicast chunk send failed");
    }
  }

  return { stale, delivered };
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function buildDataEntries(payload: FcmPayload): Record<string, string> {
  const out: Record<string, string> = {};
  if (payload.tag) out["tag"] = payload.tag;
  if (payload.icon) out["icon"] = payload.icon;
  if (payload.data) {
    for (const [k, v] of Object.entries(payload.data)) {
      out[k] = String(v);
    }
  }
  return out;
}

function isStaleTokenError(code: string): boolean {
  return (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token"
  );
}
