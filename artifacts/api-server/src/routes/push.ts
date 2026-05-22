import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { generateId } from "../lib/id.js";
import { sendError, sendSuccess, sendValidationError } from "../lib/response.js";
import { getVapidPublicKey } from "../lib/webpush.js";
import { anyUserAuth } from "../middleware/security.js";

const router: IRouter = Router();

const ROLE_PRIORITY = ["admin", "vendor", "rider", "customer"] as const;
type AllowedRole = (typeof ROLE_PRIORITY)[number];

/**
 * Derive the subscription role from the authenticated user's actual DB roles.
 * If the client provided a requested role hint, it is only accepted when the
 * user genuinely holds that role — preventing privilege escalation via a
 * forged `role` field in the request body.
 */
function resolveRole(userRolesStr: string | null, requestedRole?: string): AllowedRole {
  const userRoles = new Set(
    (userRolesStr || "customer").split(",").map((r) => r.trim().toLowerCase())
  );
  if (requestedRole && ROLE_PRIORITY.includes(requestedRole as AllowedRole)) {
    if (userRoles.has(requestedRole)) return requestedRole as AllowedRole;
  }
  for (const role of ROLE_PRIORITY) {
    if (userRoles.has(role)) return role;
  }
  return "customer";
}

const vapidSubscribeSchema = z.object({
  type: z.literal("vapid").optional(),
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  role: z.enum(["customer", "rider", "vendor", "admin"]).optional(),
});

const fcmSubscribeSchema = z.object({
  type: z.literal("fcm"),
  token: z.string().min(1),
  role: z.enum(["customer", "rider", "vendor", "admin"]).optional(),
});

const subscribeSchema = z.union([vapidSubscribeSchema, fcmSubscribeSchema]);

router.get("/vapid-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    sendError(res, "Push notifications not configured", 503);
    return;
  }
  sendSuccess(res, { publicKey: key });
});

router.post("/subscribe", anyUserAuth, async (req, res) => {
  try {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues[0]?.message ?? "Invalid subscription data");
      return;
    }
    const userId = req.customerId!;
    const user = req.customerUser!;
    const data = parsed.data;

    const role = resolveRole(user.roles ?? null, data.role);

    if (data.type === "fcm") {
      const { token } = data;
      await db
        .delete(pushSubscriptionsTable)
        .where(
          and(
            eq(pushSubscriptionsTable.userId, userId),
            eq(pushSubscriptionsTable.tokenType, "fcm"),
            eq(pushSubscriptionsTable.role, role)
          )
        );

      const id = generateId();
      await db.insert(pushSubscriptionsTable).values({
        id,
        userId,
        role,
        tokenType: "fcm",
        endpoint: token,
        p256dh: null,
        authKey: null,
      });
      sendSuccess(res, { id });
    } else {
      const { endpoint, p256dh, auth } = data;
      await db
        .delete(pushSubscriptionsTable)
        .where(
          and(
            eq(pushSubscriptionsTable.userId, userId),
            eq(pushSubscriptionsTable.endpoint, endpoint)
          )
        );
      const id = generateId();
      await db.insert(pushSubscriptionsTable).values({
        id,
        userId,
        role,
        tokenType: "vapid",
        endpoint,
        p256dh,
        authKey: auth,
      });
      sendSuccess(res, { id });
    }
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.delete("/unsubscribe", anyUserAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    const { endpoint } = req.body as { endpoint?: string };
    if (endpoint) {
      await db
        .delete(pushSubscriptionsTable)
        .where(
          and(
            eq(pushSubscriptionsTable.userId, userId),
            eq(pushSubscriptionsTable.endpoint, endpoint)
          )
        );
    } else {
      await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
    }
    sendSuccess(res);
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

export default router;
