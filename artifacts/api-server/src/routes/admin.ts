import { db } from "@workspace/db";
import {
  ordersTable,
  productsTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { and, count, eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger.js";
import { csrfProtection } from "../middleware/admin-auth.js";
import { adminAuth } from "./admin-shared.js";
import adminAccountsRoutes from "./admin/admin-accounts.js";
import analyticsRoutes from "./admin/analytics.js";
import authControlRoutes from "./admin/auth-control.js";
import broadcastsRoutes from "./admin/broadcasts.js";
import businessRulesRoutes from "./admin/business-rules.js";
import chatMonitorRoutes from "./admin/chat-monitor.js";
import communicationAdminRoutes from "./admin/communication.js";
import conditionsRoutes from "./admin/conditions.js";
import contentRoutes from "./admin/content.js";
import deepLinksRoutes from "./admin/deep-links.js";
import deliveryAccessRoutes from "./admin/delivery-access.js";
import experimentsRoutes from "./admin/experiments.js";
import faqAdminRoutes from "./admin/faq.js";
import financeRoutes from "./admin/finance/wallets.js";
import ridesRoutes from "./admin/fleet/rides.js";
import serviceZonesRoutes from "./admin/fleet/zones.js";
import inventorySettingsRoutes from "./admin/inventory-settings.js";
import launchRoutes, { ensureLaunchData } from "./admin/launch.js";
import loyaltyAdminRoutes from "./admin/loyalty.js";
import ordersRoutes from "./admin/orders.js";
import otpRoutes from "./admin/otp.js";
import platformSettingsRoutes from "./admin/platform-settings.js";
import popupsRoutes from "./admin/popups.js";
import qrCodesRoutes from "./admin/qr-codes.js";
import releaseNotesRoutes from "./admin/release-notes.js";
import searchAnalyticsRoutes from "./admin/search-analytics.js";
import securityRoutes from "./admin/security.js";
import smsGatewaysRoutes from "./admin/sms-gateways.js";
import { router as statsRoutes } from "./admin/stats.js";
import supportChatAdminRoutes from "./admin/support-chat.js";
import rbacRoutes from "./admin/system/rbac.js";
import usersRoutes from "./admin/system/users.js";
import userAddressesRoutes from "./admin/user-addresses.js";
import weatherConfigRoutes from "./admin/weather-config.js";
import webhookRegistrationsRoutes from "./admin/webhook-registrations.js";
import whatsappDeliveryRoutes from "./admin/whatsapp-delivery.js";
import whitelistRoutes from "./admin/whitelist.js";
import wishlistAnalyticsRoutes from "./admin/wishlist-analytics.js";
import sosRoutes from "./sos.js";
export {
  adminAuth,
  DEFAULT_PLATFORM_SETTINGS,
  DEFAULT_RIDE_SERVICES,
  ensureAuthMethodColumn,
  ensureCommunicationTables,
  ensureComplianceTables,
  ensureDefaultLocations,
  ensureDefaultRideServices,
  ensureFaqsTable,
  ensureOrdersGpsColumns,
  ensurePromotionsTables,
  ensureRideBidsMigration,
  ensureSupportMessagesTable,
  ensureVanServiceUpgrade,
  ensureVendorLocationColumns,
  ensureWalletP2PColumns,
  getAdminSecret,
  getCachedSettings,
  getPlatformSettings,
  type AdminRequest,
} from "./admin-shared.js";
export { ensureLaunchData };
const router: IRouter = Router();
router.use(adminAuth);
router.use(csrfProtection);
router.use(usersRoutes);
router.use(ordersRoutes);
router.use(ridesRoutes);
router.use(financeRoutes);
router.use(contentRoutes);
router.use("/system/rbac", rbacRoutes);
router.use("/service-zones", serviceZonesRoutes);
router.use(deliveryAccessRoutes);
router.use(conditionsRoutes);
router.use(popupsRoutes);
router.use("/support-chat", supportChatAdminRoutes);
router.use("/faqs", faqAdminRoutes);
router.use(communicationAdminRoutes);
router.use(loyaltyAdminRoutes);
router.use("/chat-monitor", chatMonitorRoutes);
router.use(wishlistAnalyticsRoutes);
router.use(analyticsRoutes);
router.use(searchAnalyticsRoutes);
router.use("/qr-codes", qrCodesRoutes);
router.use("/weather-config", weatherConfigRoutes);
router.use(userAddressesRoutes);
router.use(experimentsRoutes);
router.use("/whatsapp", whatsappDeliveryRoutes);
router.use("/business-rules", businessRulesRoutes);
router.use(webhookRegistrationsRoutes);
router.use(deepLinksRoutes);
router.use(releaseNotesRoutes);
router.use("/launch", launchRoutes);
router.use(otpRoutes);
router.use("/sms-gateways", smsGatewaysRoutes);
router.use("/whitelist", whitelistRoutes);
router.use(platformSettingsRoutes);
router.use(inventorySettingsRoutes);
router.use(securityRoutes);
router.use(broadcastsRoutes);
router.use(authControlRoutes);
router.use(adminAccountsRoutes);
router.use(statsRoutes);
router.use("/sos", sosRoutes);
router.get("/pending-counts", async (_req: Request, res: Response) => {
  try {
    const [
      [pendingRiders],
      [pendingOrders],
      [pendingWithdrawals],
      [pendingDeposits],
      [pendingProducts],
    ] = await Promise.all([
      db
        .select({ count: count() })
        .from(usersTable)
        .where(and(eq(usersTable.approvalStatus, "pending"), sql`roles LIKE '%rider%'`)),
      db.select({ count: count() }).from(ordersTable).where(eq(ordersTable.status, "pending")),
      db
        .select({ count: count() })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.type, "withdrawal"),
            eq(walletTransactionsTable.reference, "pending")
          )
        ),
      db
        .select({ count: count() })
        .from(walletTransactionsTable)
        .where(
          and(sql`type IN ('topup', 'deposit')`, eq(walletTransactionsTable.reference, "pending"))
        ),
      db
        .select({ count: count() })
        .from(productsTable)
        .where(and(eq(productsTable.approvalStatus, "pending"), sql`deleted_at IS NULL`)),
    ]);
    res.json({
      pendingRiders: Number(pendingRiders?.count ?? 0),
      pendingOrders: Number(pendingOrders?.count ?? 0),
      pendingWithdrawals: Number(pendingWithdrawals?.count ?? 0),
      pendingDeposits: Number(pendingDeposits?.count ?? 0),
      pendingProducts: Number(pendingProducts?.count ?? 0),
    });
  } catch (err) {
    logger.warn({ err }, "[pending-counts] query failed");
    res.json({
      pendingRiders: 0,
      pendingOrders: 0,
      pendingWithdrawals: 0,
      pendingDeposits: 0,
      pendingProducts: 0,
    });
  }
});
export default router;
