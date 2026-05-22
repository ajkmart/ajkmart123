import { isAuthMethodEnabled, isAuthMethodEnabledStrict } from "@workspace/auth-utils/server";
import { db } from "@workspace/db";
import { trustedDevicesTable, usersTable } from "@workspace/db/schema";
import { randomBytes } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { AUTH_ERROR_CODES, logAuthEvent } from "../../lib/auth-response.js";
import { fireAndForget } from "../../lib/fireAndForget.js";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import {
  sendError,
  sendErrorWithData,
  sendForbidden,
  sendSuccess,
  sendUnauthorized,
} from "../../lib/response.js";
import { emitWebhookEvent } from "../../lib/webhook-emitter.js";
import {
  addSecurityEvent,
  getCachedSettings,
  getClientIp,
  sign2faChallengeToken,
  writeAuthAuditLog,
} from "../../middleware/security.js";
import { validateBody as sharedValidateBody } from "../../middleware/validate.js";
import { AuditService } from "../../services/admin-audit.service.js";
import {
  extractAuthUser,
  FirebaseVerifySchema,
  isDeviceTrusted,
  issueTokensForUser,
  LinkFacebookSchema,
  LinkGoogleSchema,
  SocialFacebookSchema,
  SocialGoogleSchema,
} from "./helpers.js";

function getRoleFromRequest(req: Request): string {
  const role = typeof req.body?.role === "string" ? req.body.role : "customer";
  return role === "rider" || role === "vendor" ? role : "customer";
}

function isWrongRole(userRoles: string | null | undefined, requestedRole: string): boolean {
  if (!userRoles) return requestedRole !== "customer";
  return !userRoles
    .split(",")
    .map((r) => r.trim())
    .includes(requestedRole);
}

const router: IRouter = Router();

router.post("/social/google", sharedValidateBody(SocialGoogleSchema), async (req, res) => {
  try {
    const { idToken, deviceFingerprint } = req.body;
    if (!idToken) {
      sendError(res, "idToken required", 400);
      return;
    }

    const ip = getClientIp(req);
    const settings = await getCachedSettings();

    if (!isAuthMethodEnabledStrict(settings, "auth_google_enabled", "auth_social_google")) {
      sendErrorWithData(
        res,
        "Google login is currently disabled.",
        { code: "AUTH_METHOD_DISABLED" },
        400
      );
      return;
    }

    let googlePayload: {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };
    try {
      const resp = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!resp.ok) throw new Error("Invalid token");
      googlePayload = (await resp.json()) as typeof googlePayload;
    } catch (err) {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          code: "GOOGLE_TOKEN_INVALID",
          timestamp: new Date().toISOString(),
        },
        "[auth] Google token verification failed"
      );
      addSecurityEvent({
        type: "social_google_invalid_token",
        ip,
        details: "Invalid Google ID token",
        severity: "medium",
      });
      sendUnauthorized(res, "Invalid Google token");
      return;
    }

    const googleId = googlePayload.sub;
    const email = googlePayload.email?.toLowerCase?.() ?? null;
    const name = googlePayload.name ?? null;
    const avatar = googlePayload.picture ?? null;

    if (!googleId) {
      sendUnauthorized(res, "Google token missing sub");
      return;
    }

    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.googleId, googleId))
      .limit(1);

    if (!user && email) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
      if (user) {
        await db
          .update(usersTable)
          .set({ googleId, updatedAt: new Date() })
          .where(eq(usersTable.id, user.id));
        user.googleId = googleId;
      }
    }

    const isNewUser = !user;

    const requestedSocialRole = getRoleFromRequest(req);
    if (user && isWrongRole(user.roles, requestedSocialRole)) {
      addSecurityEvent({
        type: "cross_role_social_login_attempt",
        ip,
        details: `Social Google cross-role: requested=${requestedSocialRole} user.roles=${user.roles}`,
        severity: "medium",
      });
      sendErrorWithData(
        res,
        `No ${requestedSocialRole} account found for this Google account.`,
        {
          wrongApp: true,
          redirectTo:
            requestedSocialRole === "rider"
              ? "/rider"
              : requestedSocialRole === "vendor"
                ? "/vendor"
                : "/customer",
          code: AUTH_ERROR_CODES.WRONG_APP,
        },
        403
      );
      return;
    }

    const googleEffectiveRole = user?.roles ?? "customer";
    if (
      !isAuthMethodEnabledStrict(
        settings,
        "auth_google_enabled",
        "auth_social_google",
        googleEffectiveRole
      )
    ) {
      sendErrorWithData(
        res,
        "Google login is currently disabled for your account type.",
        { code: "AUTH_METHOD_DISABLED" },
        400
      );
      return;
    }

    if (!user) {
      if (settings["feature_new_users"] === "off") {
        sendForbidden(res, "New user registration is currently disabled");
        return;
      }
      const requireApproval = settings["user_require_approval"] === "on";
      const id = generateId();
      [user] = await db
        .insert(usersTable)
        .values({
          id,
          name,
          email,
          avatar,
          googleId,
          roles: "customer",
          walletBalance: "0",
          emailVerified: !!email,
          isActive: !requireApproval,
          approvalStatus: requireApproval ? "pending" : "approved",
        })
        .returning();
      fireAndForget(
        emitWebhookEvent("user_registered", {
          userId: id,
          email,
          role: "customer",
          method: "social_google",
        }),
        "auth:webhook:user_registered:social_google",
        logger,
        { userId: id, code: "WEBHOOK_EMIT" }
      );
    }

    if (user!.isBanned) {
      sendForbidden(res, "Account suspended");
      return;
    }
    if (!user!.isActive && user!.approvalStatus !== "pending") {
      sendForbidden(res, "Account inactive");
      return;
    }

    if (
      user!.totpEnabled &&
      isAuthMethodEnabled(settings, "auth_2fa_enabled", user!.roles ?? undefined)
    ) {
      const trustedDays = parseInt(settings["auth_trusted_device_days"] ?? "30", 10);
      if (!isDeviceTrusted(user!, deviceFingerprint, trustedDays)) {
        const tempToken = sign2faChallengeToken(
          user!.id,
          user!.phone ?? "",
          user!.roles ?? "customer",
          user!.roles ?? "customer",
          "social_google"
        );
        sendSuccess(res, { requires2FA: true, tempToken, userId: user!.id });
        return;
      }
    }

    AuditService.log({
      action: "social_google_login",
      ip,
      details: `Google login: ${email ?? googleId}`,
      result: "success",
    });
    logAuthEvent({
      eventType: "login_success",
      userId: user!.id,
      ip,
      userAgent: req.headers["user-agent"] as string | undefined,
      channel: "google",
      role: user!.roles ?? "customer",
      success: true,
      metadata: { googleId, isNewUser },
    });
    const result = await issueTokensForUser(
      user!,
      ip,
      "social_google",
      req.headers["user-agent"] as string,
      req,
      res
    );
    sendSuccess(res, {
      ...result,
      isNewUser,
      needsProfileCompletion: isNewUser || !user!.cnic || !user!.name,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/social/facebook
   Verify Facebook access token, match or create user, return JWT.
   Body: { accessToken, deviceFingerprint? }
══════════════════════════════════════════════════════════════ */

router.post("/social/facebook", sharedValidateBody(SocialFacebookSchema), async (req, res) => {
  try {
    const { accessToken: fbToken, deviceFingerprint } = req.body;
    if (!fbToken) {
      sendError(res, "accessToken required", 400);
      return;
    }

    const ip = getClientIp(req);
    const settings = await getCachedSettings();

    if (!isAuthMethodEnabledStrict(settings, "auth_facebook_enabled", "auth_social_facebook")) {
      sendErrorWithData(
        res,
        "Facebook login is currently disabled.",
        { code: "AUTH_METHOD_DISABLED" },
        400
      );
      return;
    }

    let fbPayload: {
      id?: string;
      email?: string;
      name?: string;
      picture?: { data?: { url?: string } };
    };
    try {
      const resp = await fetch(
        `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${encodeURIComponent(fbToken)}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!resp.ok) throw new Error("Invalid token");
      fbPayload = (await resp.json()) as typeof fbPayload;
    } catch (err) {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          code: "FACEBOOK_TOKEN_INVALID",
          timestamp: new Date().toISOString(),
        },
        "[auth] Facebook token verification failed"
      );
      addSecurityEvent({
        type: "social_facebook_invalid_token",
        ip,
        details: "Invalid Facebook access token",
        severity: "medium",
      });
      sendUnauthorized(res, "Invalid Facebook token");
      return;
    }

    const facebookId = fbPayload.id;
    const email = fbPayload.email?.toLowerCase?.() ?? null;
    const name = fbPayload.name ?? null;
    const avatar = fbPayload.picture?.data?.url ?? null;

    if (!facebookId) {
      sendUnauthorized(res, "Facebook token missing id");
      return;
    }

    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.facebookId, facebookId))
      .limit(1);

    if (!user && email) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
      if (user) {
        await db
          .update(usersTable)
          .set({ facebookId, updatedAt: new Date() })
          .where(eq(usersTable.id, user.id));
        user.facebookId = facebookId;
      }
    }

    const isNewUser = !user;

    const requestedFbSocialRole = getRoleFromRequest(req);
    if (user && isWrongRole(user.roles, requestedFbSocialRole)) {
      addSecurityEvent({
        type: "cross_role_social_login_attempt",
        ip,
        details: `Social Facebook cross-role: requested=${requestedFbSocialRole} user.roles=${user.roles}`,
        severity: "medium",
      });
      sendErrorWithData(
        res,
        `No ${requestedFbSocialRole} account found for this Facebook account.`,
        {
          wrongApp: true,
          redirectTo:
            requestedFbSocialRole === "rider"
              ? "/rider"
              : requestedFbSocialRole === "vendor"
                ? "/vendor"
                : "/customer",
          code: AUTH_ERROR_CODES.WRONG_APP,
        },
        403
      );
      return;
    }

    const fbEffectiveRole = user?.roles ?? "customer";
    if (
      !isAuthMethodEnabledStrict(
        settings,
        "auth_facebook_enabled",
        "auth_social_facebook",
        fbEffectiveRole
      )
    ) {
      sendErrorWithData(
        res,
        "Facebook login is currently disabled for your account type.",
        { code: "AUTH_METHOD_DISABLED" },
        400
      );
      return;
    }

    if (!user) {
      if (settings["feature_new_users"] === "off") {
        sendForbidden(res, "New user registration is currently disabled");
        return;
      }
      const requireApproval = settings["user_require_approval"] === "on";
      const id = generateId();
      [user] = await db
        .insert(usersTable)
        .values({
          id,
          name,
          email,
          avatar,
          facebookId,
          roles: "customer",
          walletBalance: "0",
          emailVerified: !!email,
          isActive: !requireApproval,
          approvalStatus: requireApproval ? "pending" : "approved",
        })
        .returning();
      fireAndForget(
        emitWebhookEvent("user_registered", {
          userId: id,
          email,
          role: "customer",
          method: "social_facebook",
        }),
        "auth:webhook:user_registered:social_facebook",
        logger,
        { userId: id, code: "WEBHOOK_EMIT" }
      );
    }

    if (user!.isBanned) {
      sendForbidden(res, "Account suspended");
      return;
    }
    if (!user!.isActive && user!.approvalStatus !== "pending") {
      sendForbidden(res, "Account inactive");
      return;
    }

    if (
      user!.totpEnabled &&
      isAuthMethodEnabled(settings, "auth_2fa_enabled", user!.roles ?? undefined)
    ) {
      const trustedDays = parseInt(settings["auth_trusted_device_days"] ?? "30", 10);
      if (!isDeviceTrusted(user!, deviceFingerprint, trustedDays)) {
        const tempToken = sign2faChallengeToken(
          user!.id,
          user!.phone ?? "",
          user!.roles ?? "customer",
          user!.roles ?? "customer",
          "social_facebook"
        );
        sendSuccess(res, { requires2FA: true, tempToken, userId: user!.id });
        return;
      }
    }

    AuditService.log({
      action: "social_facebook_login",
      ip,
      details: `Facebook login: ${email ?? facebookId}`,
      result: "success",
    });
    logAuthEvent({
      eventType: "login_success",
      userId: user!.id,
      ip,
      userAgent: req.headers["user-agent"] as string | undefined,
      channel: "facebook",
      role: user!.roles ?? "customer",
      success: true,
      metadata: { facebookId, isNewUser },
    });
    const result = await issueTokensForUser(
      user!,
      ip,
      "social_facebook",
      req.headers["user-agent"] as string,
      req,
      res
    );
    sendSuccess(res, {
      ...result,
      isNewUser,
      needsProfileCompletion: isNewUser || !user!.cnic || !user!.name,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /auth/2fa/setup
   Generate TOTP secret + QR code URI. Requires valid JWT.
══════════════════════════════════════════════════════════════ */

router.post("/link-google", sharedValidateBody(LinkGoogleSchema), async (req, res) => {
  try {
    const auth = extractAuthUser(req);
    if (!auth) {
      sendUnauthorized(res, "Authentication required");
      return;
    }

    const { idToken } = req.body;
    if (!idToken) {
      sendError(res, "idToken is required", 400);
      return;
    }

    const ip = getClientIp(req);

    try {
      /* Verify Google JWT signature by calling Google's tokeninfo endpoint */
      const tokenInfoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
      );
      if (!tokenInfoRes.ok) throw new Error("Token verification failed");
      const tokenInfo = (await tokenInfoRes.json()) as { sub?: string; email?: string };
      const googleId = tokenInfo.sub as string;
      const email = tokenInfo.email as string | undefined;

      if (!googleId) {
        sendError(res, "Could not extract Google ID from token", 400);
        return;
      }

      /* Check if another user already has this googleId */
      const [conflict] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.googleId, googleId), sql`id != ${auth.userId}`))
        .limit(1);

      if (conflict) {
        sendError(res, "This Google account is already linked to another user", 409);
        return;
      }

      const updates: Record<string, unknown> = { googleId, updatedAt: new Date() };
      if (email) updates["email"] = email;

      await db.update(usersTable).set(updates).where(eq(usersTable.id, auth.userId));

      AuditService.log({
        action: "google_account_linked",
        ip,
        details: `Google account linked: ${email ?? googleId}`,
        result: "success",
      });
      sendSuccess(res, undefined, "Google account linked successfully");
    } catch (err: unknown) {
      sendErrorWithData(
        res,
        "Invalid Google token",
        { detail: err instanceof Error ? err.message : String(err) },
        400
      );
    }
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/link-facebook
   Link a Facebook account to the currently authenticated user.
   Body: { accessToken: string }
══════════════════════════════════════════════════════════════ */

router.post("/link-facebook", sharedValidateBody(LinkFacebookSchema), async (req, res) => {
  try {
    const auth = extractAuthUser(req);
    if (!auth) {
      sendUnauthorized(res, "Authentication required");
      return;
    }

    const { accessToken } = req.body;
    if (!accessToken) {
      sendError(res, "accessToken is required", 400);
      return;
    }

    const ip = getClientIp(req);

    try {
      /* Fetch Facebook user info */
      const fbRes = await fetch(
        `https://graph.facebook.com/me?fields=id,email,name&access_token=${accessToken}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!fbRes.ok) {
        sendError(res, "Invalid Facebook access token", 400);
        return;
      }

      const fbPayload = (await fbRes.json()) as { id: string; email?: string; name?: string };
      const facebookId = fbPayload.id;

      if (!facebookId) {
        sendError(res, "Could not extract Facebook ID", 400);
        return;
      }

      /* Check conflict */
      const [conflict] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.facebookId, facebookId), sql`id != ${auth.userId}`))
        .limit(1);

      if (conflict) {
        sendError(res, "This Facebook account is already linked to another user", 409);
        return;
      }

      const updates: Record<string, unknown> = { facebookId, updatedAt: new Date() };
      if (fbPayload.email) updates["email"] = fbPayload.email;

      await db.update(usersTable).set(updates).where(eq(usersTable.id, auth.userId));

      AuditService.log({
        action: "facebook_account_linked",
        ip,
        details: `Facebook account linked: ${facebookId}`,
        result: "success",
      });
      sendSuccess(res, undefined, "Facebook account linked successfully");
    } catch (err: unknown) {
      sendErrorWithData(
        res,
        "Failed to link Facebook account",
        { detail: err instanceof Error ? err.message : String(err) },
        400
      );
    }
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/biometric/status", async (req, res) => {
  try {
    const auth = extractAuthUser(req);
    if (!auth) {
      sendUnauthorized(res, "Authentication required");
      return;
    }
    const settings = await getCachedSettings();
    sendSuccess(res, { enabled: settings["auth_biometric_enabled"] === "on" });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/biometric/register", async (req, res) => {
  try {
    const auth = extractAuthUser(req);
    if (!auth) {
      sendUnauthorized(res, "Authentication required");
      return;
    }
    const { biometricCredentialId, deviceId, deviceName, deviceType, fingerprint } = req.body ?? {};
    if (!biometricCredentialId || !deviceId) {
      sendError(res, "biometricCredentialId and deviceId are required", 400);
      return;
    }
    const settings = await getCachedSettings();
    if (settings["auth_biometric_enabled"] !== "on") {
      sendErrorWithData(res, "Biometric login is disabled.", { code: "AUTH_METHOD_DISABLED" }, 400);
      return;
    }
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const existing = await db
      .select()
      .from(trustedDevicesTable)
      .where(
        and(eq(trustedDevicesTable.userId, auth.userId), eq(trustedDevicesTable.deviceId, deviceId))
      )
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(trustedDevicesTable)
        .set({
          deviceName: deviceName ?? null,
          deviceType: deviceType ?? null,
          fingerprint: fingerprint ?? biometricCredentialId,
          expiresAt,
          isRevoked: false,
          lastUsedAt: new Date(),
        })
        .where(
          and(
            eq(trustedDevicesTable.userId, auth.userId),
            eq(trustedDevicesTable.deviceId, deviceId)
          )
        );
    } else {
      await db.insert(trustedDevicesTable).values({
        id: generateId(),
        userId: auth.userId,
        deviceId,
        deviceName: deviceName ?? null,
        deviceType: deviceType ?? null,
        fingerprint: fingerprint ?? biometricCredentialId,
        expiresAt,
      });
    }
    const biometricToken = randomBytes(48).toString("hex");
    logAuthEvent({
      eventType: "device_trusted",
      userId: auth.userId,
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] as string | undefined,
      channel: "biometric",
      role: auth.role ?? "customer",
      success: true,
      metadata: { deviceId },
    });
    sendSuccess(res, { biometricToken });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/firebase-verify
   Verify a Firebase idToken and return a platform JWT.
   Enables Firebase Phone Auth / Google Sign-In as an alternative
   entry point that returns the same token format as OTP login.
   Body: { idToken: string, role?: string }
══════════════════════════════════════════════════════════════ */

router.post("/firebase-verify", sharedValidateBody(FirebaseVerifySchema), async (req, res) => {
  try {
    const { idToken, role: requestedRole } = req.body;
    if (!idToken) {
      sendError(res, "idToken is required", 400);
      return;
    }

    if (requestedRole !== undefined && !["customer", "rider", "vendor"].includes(requestedRole)) {
      sendError(res, "Invalid role", 400);
      return;
    }

    const ip = getClientIp(req);

    /* Dynamic import — only works if FIREBASE_SERVICE_ACCOUNT_JSON is set */
    const { verifyFirebaseToken, setFirebaseCustomClaims } =
      await import("../../services/firebase.js");
    const decoded = await verifyFirebaseToken(idToken);

    if (!decoded) {
      sendUnauthorized(
        res,
        "Invalid or expired Firebase token. Ensure Firebase is configured on the server."
      );
      return;
    }

    /* Find user by firebaseUid, then by phone, then by email */
    let user: typeof usersTable.$inferSelect | undefined;

    const [byUid] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.firebaseUid, decoded.uid))
      .limit(1);
    user = byUid;

    if (!user && decoded.phone) {
      const normalized = decoded.phone.replace(/\D/g, "").replace(/^92/, "0");
      const [byPhone] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.phone, `0${normalized.slice(-10)}`))
        .limit(1);
      user = byPhone;
    }

    if (!user && decoded.email) {
      const [byEmail] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, decoded.email))
        .limit(1);
      user = byEmail;
    }

    /* Auto-create if not found */
    if (!user) {
      const newId = generateId();
      const role = (requestedRole ?? "customer") as string;
      await db.insert(usersTable).values({
        id: newId,
        firebaseUid: decoded.uid,
        email: decoded.email ?? null,
        phone: decoded.phone ?? null,
        name: decoded.name ?? null,
        roles: role,
        emailVerified: decoded.email_verified ?? false,
        phoneVerified: !!decoded.phone,
      });
      const [created] = await db.select().from(usersTable).where(eq(usersTable.id, newId)).limit(1);
      user = created;
    } else if (!user.firebaseUid) {
      /* Link firebaseUid to existing account */
      await db
        .update(usersTable)
        .set({ firebaseUid: decoded.uid, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      user.firebaseUid = decoded.uid;
    }

    if (user.isBanned || (!user.isActive && user.approvalStatus !== "pending")) {
      sendErrorWithData(
        res,
        "Account suspended",
        { reason: user.banReason ?? "Contact support" },
        403
      );
      return;
    }

    /* Set Firebase Custom Claims so next Firebase idToken refresh carries the role */
    fireAndForget(
      setFirebaseCustomClaims(decoded.uid, {
        role: user.roles ?? "customer",
        roles: user.roles ?? "customer",
        userId: user.id,
      }),
      "auth:firebase-custom-claims",
      logger,
      { uid: decoded.uid, userId: user.id, code: "AUTH_FIREBASE_CLAIMS_FAILED" }
    );

    /* Issue platform tokens */
    const userAgent = req.headers["user-agent"] as string | undefined;
    const tokenData = await issueTokensForUser(user, ip, "firebase", userAgent, req, res);

    void writeAuthAuditLog("firebase_login", {
      userId: user.id,
      ip,
      userAgent,
      metadata: { uid: decoded.uid },
    });

    const { passwordHash: _ph, totpSecret: _ts, backupCodes: _bc, ...safeUser } = user;
    sendSuccess(res, { ...tokenData, user: safeUser });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
