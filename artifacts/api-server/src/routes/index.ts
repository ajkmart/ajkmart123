import type { NextFunction, Request, Response } from "express";
import { Router, type IRouter } from "express";

import { checkSessionRevocation, verifyTokenFamily } from "../middleware/auth.js";
import { publicLimiter, userApiLimiter } from "../middleware/rate-limit.js";
import { adminAuth } from "./admin-shared.js";

// ── Infrastructure / health ────────────────────────────────────────────────
import healthRouter from "./health.js";

// ── Auth ───────────────────────────────────────────────────────────────────
import adminAuthV2Router from "./admin-auth-v2.js";
import authRouter from "./auth/index.js";

// ── Customer-facing routers ────────────────────────────────────────────────
import addressesRouter from "./addresses.js";
import bannersRouter from "./banners.js";
import cartRouter from "./cart.js";
import categoriesRouter from "./categories.js";
import kycRouter from "./kyc.js";
import locationsRouter from "./locations.js";
import loyaltyFullRouter from "./loyalty-full.js";
import loyaltyRouter from "./loyalty.js";
import notificationsRouter from "./notifications.js";
import ordersRouter from "./orders.js";
import parcelRouter from "./parcel.js";
import paymentsRouter from "./payments.js";
import pharmacyRouter from "./pharmacy.js";
import productsRouter from "./products.js";
import pushRouter from "./push.js";
import referralsRouter from "./referrals.js";
import reviewsRouter from "./reviews.js";
import ridesRouter from "./rides/index.js";
import settingsRouter from "./settings.js";
import sosRouter from "./sos.js";
import usersRouter from "./users.js";
import variantsRouter from "./variants.js";
import walletRouter from "./wallet.js";
import wishlistRouter from "./wishlist.js";

// ── Rider routers ──────────────────────────────────────────────────────────
// rider/index.ts is the single canonical rider router — rider.ts (root-level)
// was a superseded copy and has been removed.  All active rider logic lives in
// rider/index.ts which also exports clearSpoofHits() used by auth sub-routes.
import riderRouter from "./rider/index.js";

// ── Vendor routers ─────────────────────────────────────────────────────────
import publicVendorsRouter from "./public-vendors.js";
import vendorRouter from "./vendor.js";

// ── Shared / public surface ────────────────────────────────────────────────
import deepLinksPublicRouter from "./deep-links-public.js";
import docsRouter from "./docs.js";
import mapsRouter, { adminMapsRouter } from "./maps.js";
import metricsRouter from "./metrics.js";
import platformConfigRouter from "./platform-config.js";
import recommendationsRouter from "./recommendations.js";
import schoolRouter, { adminSchoolRouter } from "./school.js";
import statsRouter from "./stats.js";
import uploadsRouter from "./uploads.js";

// ── Admin routers ──────────────────────────────────────────────────────────
import adminRouter from "./admin.js";
import errorReportsRouter from "./error-reports.js";
import legalRouter from "./legal.js";
import sentryWebhookRouter from "./sentry-webhook.js";
import systemRouter from "./system.js";

// ── Feature / domain routers ───────────────────────────────────────────────
import businessRulesRouter from "./business-rules.js";
import communicationRouter from "./communication.js";
import deliveryEligibilityRouter from "./delivery-eligibility.js";
import experimentsRouter from "./experiments.js";
import popupsRouter from "./popups.js";
import promotionsRouter from "./promotions/index.js";
import supportChatRouter from "./support-chat.js";
import vanRouter from "./van.js";
import weatherConfigRouter from "./weather-config.js";
import webhooksRouter from "./webhooks.js";
import whatsappDeliveryRouter from "./whatsapp-delivery.js";

// ── Dev-only ───────────────────────────────────────────────────────────────
import seedRouter from "./seed.js";

/**
 * publicGetLimiter — rate-limits only GET / HEAD requests.
 * POST / PATCH / DELETE routes (e.g. POST /recommendations/track) are excluded
 * so mutation endpoints are not subject to the read-scraping limit.
 */
function publicGetLimiter(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }
  publicLimiter(req, res, next);
}

const router: IRouter = Router();

// ── 1. Infrastructure ──────────────────────────────────────────────────────
router.use("/health", healthRouter);

// ── 2. Auth ────────────────────────────────────────────────────────────────
/**
 * Legacy customer /api/auth router — OTP, login, refresh, 2FA, social sign-in
 * for AJKMart users.  The admin SSoT lives entirely under /api/admin/auth/*
 * (admin-auth-v2).  Set ADMIN_LEGACY_AUTH_DISABLED=1 to unmount this once all
 * clients have migrated.  Defaults to mounted to keep the mobile app working.
 */
if (process.env["ADMIN_LEGACY_AUTH_DISABLED"] !== "1") {
  router.use("/auth", authRouter);
}

/**
 * Admin auth (v2) must be mounted BEFORE the resource adminRouter so its
 * public sub-endpoints (forgot-password, reset-password, login) are not
 * shadowed by adminRouter's blanket adminAuth middleware.
 */
router.use("/admin/auth", adminAuthV2Router);

// ── 3. Admin surface ───────────────────────────────────────────────────────
/**
 * Sentry webhook is public (HMAC-verified) — must come BEFORE adminRouter so
 * it is never blocked by adminAuth.  Owns POST /api/admin/sentry-webhook.
 */
router.use(sentryWebhookRouter);

/**
 * /api/admin/system/* — legacy monolith system router.  Mounted with an
 * explicit /admin/system prefix so it is reachable alongside the newer
 * adminRouter sub-router tree (which owns /api/admin/*).
 */
router.use("/admin/system", adminAuth, systemRouter);

/**
 * Primary admin barrel router — mounts all /api/admin/* resource sub-routers
 * (orders, rides, finance, content, RBAC, …) behind a single adminAuth guard.
 */
router.use("/admin", adminRouter);

/**
 * /api/admin/maps — dedicated admin maps router so admin clients using the
 * /api/admin prefix reach the map-test / usage / cache-clear handlers without
 * being caught by the public /api/maps router below.
 */
router.use("/admin/maps", adminMapsRouter);

/**
 * /api/admin/school — paginated subscriptions + cancel (admin-only).
 */
router.use("/admin/school", adminSchoolRouter);

/**
 * /api/whatsapp — WhatsApp delivery analytics and retry (admin-only writes).
 */
router.use("/whatsapp", adminAuth, whatsappDeliveryRouter);

/**
 * /api/business-rules — dynamic platform business-rules engine (admin-only writes).
 */
router.use("/business-rules", adminAuth, businessRulesRouter);

/**
 * Legal / consent surface — GDPR terms versions and consent log.
 *
 * Dual mount:
 *   /api/legal           → for external tooling / API contracts (adminAuth required)
 *   /api/admin/legal     → used by the admin panel (fetchAdmin prepends /api/admin)
 *
 * Both mounts enforce adminAuth because the consent log is GDPR-sensitive and
 * POST publishes new policy versions.  No public or customer-facing endpoint
 * lives in this router.
 */
router.use("/legal", adminAuth, legalRouter);
router.use("/admin/legal", adminAuth, legalRouter);

// ── 4. Rider surface ───────────────────────────────────────────────────────
router.use("/riders", riderRouter);

// ── 5. Vendor surface ──────────────────────────────────────────────────────
/**
 * Vendor browsing dual mount:
 *   /api/vendors (GET/HEAD only) → publicVendorsRouter  — public store listing
 *   /api/vendors (all methods)   → vendorRouter          — authenticated management
 *
 * The method gate prevents publicVendorsRouter from shadowing authenticated
 * vendorRouter GET routes (e.g. GET /vendors/me, GET /vendors/orders).
 * Express walks middleware in order so the public router short-circuits on
 * GET/HEAD and falls through to vendorRouter for mutating methods.
 */
router.use(
  "/vendors",
  publicGetLimiter,
  (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === "GET" || req.method === "HEAD") {
      publicVendorsRouter(req, res, next);
      return;
    }
    next();
  }
);
router.use("/vendors", vendorRouter);

// ── 6. Customer-facing authenticated routes ────────────────────────────────
router.use("/users", checkSessionRevocation, verifyTokenFamily, usersRouter);
router.use("/orders", checkSessionRevocation, verifyTokenFamily, userApiLimiter, ordersRouter);
router.use("/cart", checkSessionRevocation, verifyTokenFamily, userApiLimiter, cartRouter);
router.use("/wallet", checkSessionRevocation, verifyTokenFamily, userApiLimiter, walletRouter);
router.use("/rides", checkSessionRevocation, verifyTokenFamily, userApiLimiter, ridesRouter);
router.use(
  "/pharmacy-orders",
  checkSessionRevocation,
  verifyTokenFamily,
  userApiLimiter,
  pharmacyRouter
);
router.use(
  "/parcel-bookings",
  checkSessionRevocation,
  verifyTokenFamily,
  userApiLimiter,
  parcelRouter
);
router.use(
  "/notifications",
  checkSessionRevocation,
  verifyTokenFamily,
  userApiLimiter,
  notificationsRouter
);
router.use(
  "/addresses",
  checkSessionRevocation,
  verifyTokenFamily,
  userApiLimiter,
  addressesRouter
);
router.use("/sos", checkSessionRevocation, verifyTokenFamily, userApiLimiter, sosRouter);
router.use("/push", checkSessionRevocation, verifyTokenFamily, userApiLimiter, pushRouter);
router.use("/kyc", checkSessionRevocation, verifyTokenFamily, userApiLimiter, kycRouter);
router.use("/wishlist", checkSessionRevocation, verifyTokenFamily, userApiLimiter, wishlistRouter);
router.use("/referrals", userApiLimiter, referralsRouter);

// ── 7. Public / lightly-gated customer routes ─────────────────────────────
router.use("/products", publicGetLimiter, productsRouter);
router.use("/categories", publicGetLimiter, categoriesRouter);
router.use("/banners", publicGetLimiter, bannersRouter);
router.use("/recommendations", publicGetLimiter, userApiLimiter, recommendationsRouter);
router.use("/locations", locationsRouter);
router.use("/settings", settingsRouter);
router.use("/payments", paymentsRouter);
router.use("/reviews", userApiLimiter, reviewsRouter);
router.use("/maps", mapsRouter);
router.use("/school", schoolRouter);
router.use("/uploads", uploadsRouter);
router.use("/variants", variantsRouter);
router.use("/platform-config", platformConfigRouter);
router.use("/dl", publicGetLimiter, deepLinksPublicRouter);

// ── 8. Feature domains ─────────────────────────────────────────────────────
router.use("/van", vanRouter);
router.use("/webhooks", webhooksRouter);
router.use("/delivery/eligibility", deliveryEligibilityRouter);
router.use("/popups", popupsRouter);
router.use("/support-chat", supportChatRouter);
router.use("/communication", communicationRouter);
router.use("/weather-config", weatherConfigRouter);
router.use("/experiments", experimentsRouter);

/**
 * Promotions dual mount:
 *   /api/promotions        → public browsing (GET /promotions/public, apply promo codes,
 *                            vendor campaign participation).  publicGetLimiter guards reads.
 *   /api/admin/promotions  → full admin management behind adminAuth.
 *
 * Every write endpoint inside promotionsRouter (campaigns, offers, templates)
 * carries its own adminAuth / marketingAuth guard so mutations remain protected
 * even when reached via the public /api/promotions prefix.
 */
router.use("/promotions", publicGetLimiter, promotionsRouter);
router.use("/admin/promotions", adminAuth, promotionsRouter);

/**
 * Error reports dual mount:
 *   /api/error-reports        → public ingestion endpoint (POST /) used by vendor,
 *                               rider, and customer frontends to report JS errors.
 *   /api/admin/error-reports  → admin management surface (GET list, PATCH status,
 *                               POST scan/resolve) used by the admin panel via
 *                               fetchAdmin (which prepends /api/admin).
 *
 * The router enforces adminAuth internally on every admin-only handler so the
 * dual mount does not expose management endpoints to unauthenticated callers.
 */
router.use("/error-reports", errorReportsRouter);
router.use("/admin/error-reports", errorReportsRouter);

// ── 9. Stats / metrics / docs ──────────────────────────────────────────────
router.use("/stats", statsRouter);
router.use("/metrics", metricsRouter);
router.use("/docs", docsRouter);

// ── 10. Loyalty (two complementary routers — no path overlap) ─────────────
/**
 * loyaltyRouter owns POST /loyalty/redeem and GET /loyalty/balance.
 * loyaltyFullRouter owns /loyalty/settings, /loyalty/leaderboard, /loyalty/stats
 * and all admin CRUD for campaigns and rewards.
 * Express resolves sequentially; the first router to match wins, so there are
 * no handler collisions between the two.
 */
router.use("/loyalty", userApiLimiter, loyaltyRouter);
router.use("/loyalty-full", userApiLimiter, loyaltyFullRouter);

// ── 11. Dev / seed (non-production only) ──────────────────────────────────
if (process.env["NODE_ENV"] !== "production") {
  router.use("/seed", seedRouter);
}

export default router;
