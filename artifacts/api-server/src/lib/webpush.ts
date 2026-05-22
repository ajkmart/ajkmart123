import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { sendFcmToTokens } from "./fcm.js";
import { logger } from "./logger.js";

let vapidInitialized = false;

export function initVapid() {
  if (vapidInitialized) return;
  const pub = process.env["VAPID_PUBLIC_KEY"] ?? "";
  const priv = process.env["VAPID_PRIVATE_KEY"] ?? "";
  const mail = process.env["VAPID_CONTACT_EMAIL"] ?? "mailto:admin@ajkmart.app";
  if (!pub || !priv) {
    logger.warn("[webpush] VAPID keys not set — web push disabled");
    return;
  }
  webpush.setVapidDetails(mail, pub, priv);
  vapidInitialized = true;
  logger.info("[webpush] VAPID initialized");
}

export function getVapidPublicKey(): string {
  return process.env["VAPID_PUBLIC_KEY"] ?? "";
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/** Delivery stats returned by sendPushToUser / sendPushToSubs. */
export interface PushDeliveryStats {
  /** Total subscription rows found for the target user. */
  attempted: number;
  /** Subscriptions where the send call succeeded. */
  delivered: number;
  /** Stale tokens (410/404 VAPID or FCM unregistered) purged from the DB. */
  stalePurged: number;
  /** True when no subscriptions existed at all — push was never attempted. */
  noSubscriptions: boolean;
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<PushDeliveryStats> {
  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));
  return sendPushToSubs(subs, payload);
}

export async function sendPushToRole(role: string, payload: PushPayload): Promise<void> {
  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.role, role));
  await sendPushToSubs(subs, payload);
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;
  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(inArray(pushSubscriptionsTable.userId, userIds));
  await sendPushToSubs(subs, payload);
}

async function sendPushToSubs(
  subs: (typeof pushSubscriptionsTable.$inferSelect)[],
  payload: PushPayload
): Promise<PushDeliveryStats> {
  if (subs.length === 0) {
    return { attempted: 0, delivered: 0, stalePurged: 0, noSubscriptions: true };
  }

  const vapidSubs = subs.filter((s) => s.tokenType === "vapid");
  const fcmSubs = subs.filter((s) => s.tokenType === "fcm");

  const staleIds: string[] = [];
  let delivered = 0;

  const fcmDataPayload: Record<string, string> = {};
  if (payload.data) {
    for (const [k, v] of Object.entries(payload.data)) {
      fcmDataPayload[k] = String(v);
    }
  }

  const [vapidDelivered, fcmResult] = await Promise.all([
    vapidInitialized ? sendVapidSubs(vapidSubs, payload, staleIds) : Promise.resolve(0),
    fcmSubs.length > 0
      ? sendFcmToTokens(
          fcmSubs.map((s) => s.endpoint),
          {
            title: payload.title,
            body: payload.body,
            icon: payload.icon,
            tag: payload.tag,
            data: Object.keys(fcmDataPayload).length > 0 ? fcmDataPayload : undefined,
          }
        )
      : Promise.resolve({ stale: [] as string[], delivered: 0 }),
  ]);

  delivered += vapidDelivered;

  if (fcmResult && fcmResult.stale.length > 0) {
    const staleTokens = new Set(fcmResult.stale);
    for (const sub of fcmSubs) {
      if (staleTokens.has(sub.endpoint)) staleIds.push(sub.id);
    }
  }
  if (fcmResult) {
    delivered += fcmResult.delivered;
  }

  if (staleIds.length > 0) {
    await db
      .delete(pushSubscriptionsTable)
      .where(inArray(pushSubscriptionsTable.id, staleIds))
      .catch((err: unknown) => {
        logger.error({ err }, "[webpush] Stale subscription cleanup failed");
      });
  }

  return {
    attempted: subs.length,
    delivered,
    stalePurged: staleIds.length,
    noSubscriptions: false,
  };
}

async function sendVapidSubs(
  subs: (typeof pushSubscriptionsTable.$inferSelect)[],
  payload: PushPayload,
  staleIds: string[]
): Promise<number> {
  if (subs.length === 0) return 0;
  const json = JSON.stringify(payload);
  let delivered = 0;
  await Promise.allSettled(
    subs.map(async (sub) => {
      if (!sub.p256dh || !sub.authKey) return;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.authKey } },
          json
        );
        delivered++;
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleIds.push(sub.id);
        } else {
          logger.warn({ err: err?.message }, "[webpush] send failed");
        }
      }
    })
  );
  return delivered;
}
