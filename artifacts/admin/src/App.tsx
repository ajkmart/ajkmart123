import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorRetry } from "@/components/ui/ErrorRetry";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePermissions } from "@/hooks/usePermissions";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { AdminAuthProvider, useAdminAuth } from "@/lib/adminAuthContext";
import { setupAdminFetcherHandlers } from "@/lib/adminFetcher";
import { adminTheme } from "@/lib/auth/theme";
import { ThemeProvider } from "@/lib/auth/ThemeContext";
import { auditAdminEnv } from "@/lib/envValidation";
import { initErrorReporter } from "@/lib/error-reporter";
import { createLogger } from "@/lib/logger";
import { initSentry } from "@/lib/sentry";
import { bootAccessibilitySettings } from "@/lib/useAccessibilitySettings";
import { useLanguage } from "@/lib/useLanguage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
const log = createLogger("[App]");

const _adminEnv = auditAdminEnv();
bootAccessibilitySettings();

import { FirstLoginCredentialsDialog } from "@/components/FirstLoginCredentialsDialog";
import { AdminLayout } from "@/components/layout/AdminLayout";

/* ── All page components loaded lazily (separate chunks per page) ── */
const Broadcast = lazy(() => import("@/pages/broadcast"));
const Categories = lazy(() => import("@/pages/categories"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const Login = lazy(() => import("@/pages/login"));
const Orders = lazy(() => import("@/pages/orders"));
const Parcel = lazy(() => import("@/pages/parcel"));
const Pharmacy = lazy(() => import("@/pages/pharmacy"));
const Products = lazy(() => import("@/pages/products"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
const Rides = lazy(() => import("@/pages/rides"));
const Security = lazy(() => import("@/pages/security"));
const SetNewPassword = lazy(() => import("@/pages/set-new-password"));
const Settings = lazy(() => import("@/pages/settings"));
const Transactions = lazy(() => import("@/pages/transactions"));
const Users = lazy(() => import("@/pages/users"));

const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const AppManagement = lazy(() => import("@/pages/app-management"));
const AuditLogs = lazy(() => import("@/pages/audit-logs"));
const AuthControl = lazy(() => import("@/pages/auth-control"));
const AuthMethods = lazy(() => import("@/pages/auth-methods"));
const Banners = lazy(() => import("@/pages/banners"));
const BusinessRulesPage = lazy(() => import("@/pages/business-rules"));
const ChatMonitor = lazy(() => import("@/pages/chat-monitor"));
const Communication = lazy(() => import("@/pages/communication"));
const ConsentLog = lazy(() => import("@/pages/consent-log"));
const DeepLinks = lazy(() => import("@/pages/deep-links"));
const DeliveryAccess = lazy(() => import("@/pages/delivery-access"));
const DepositRequests = lazy(() => import("@/pages/DepositRequests"));
const ErrorMonitor = lazy(() => import("@/pages/error-monitor"));
const Experiments = lazy(() => import("@/pages/experiments"));
const FaqManagement = lazy(() => import("@/pages/faq-management"));
const FlashDeals = lazy(() => import("@/pages/flash-deals"));
const Forbidden = lazy(() => import("@/pages/forbidden"));
const HealthDashboard = lazy(() => import("@/pages/health-dashboard"));
const Kyc = lazy(() => import("@/pages/kyc"));
const LaunchControl = lazy(() => import("@/pages/launch-control"));
const LiveRidersMap = lazy(() => import("@/pages/live-riders-map"));
const Loyalty = lazy(() => import("@/pages/loyalty"));
const NotFound = lazy(() => import("@/pages/not-found"));
const OtpControl = lazy(() => import("@/pages/otp-control"));
const Popups = lazy(() => import("@/pages/popups"));
const PromoCodes = lazy(() => import("@/pages/promo-codes"));
const PromotionsHub = lazy(() => import("@/pages/promotions-hub"));
const QrCodes = lazy(() => import("@/pages/qr-codes"));
const Reviews = lazy(() => import("@/pages/reviews"));
const Riders = lazy(() => import("@/pages/riders"));
const RolesPermissions = lazy(() => import("@/pages/roles-permissions"));
const SearchAnalyticsPage = lazy(() => import("@/pages/search-analytics"));
const SmsGateways = lazy(() => import("@/pages/sms-gateways"));
const SosAlerts = lazy(() => import("@/pages/sos-alerts"));
const SupportChat = lazy(() => import("@/pages/support-chat"));
const VanService = lazy(() => import("@/pages/van"));
const VendorInventorySettings = lazy(() => import("@/pages/vendor-inventory-settings"));
const Vendors = lazy(() => import("@/pages/vendors"));
const WalletTransfers = lazy(() => import("@/pages/wallet-transfers"));
const WebhookManager = lazy(() => import("@/pages/webhook-manager"));
const WhatsAppDeliveryLog = lazy(() => import("@/pages/whatsapp-delivery-log"));
const WishlistInsights = lazy(() => import("@/pages/wishlist-insights"));
const Withdrawals = lazy(() => import("@/pages/Withdrawals"));
const AccountConditions = lazy(() => import("@/pages/account-conditions"));
const ConditionRules = lazy(() => import("@/pages/condition-rules"));
const RevenueAnalytics = lazy(() => import("@/pages/revenue-analytics"));
const AccessibilityPage = lazy(() => import("@/pages/accessibility"));

const QUERY_RETRY_COUNT = 1;
const QUERY_RETRY_DELAY_MS = 1_000;
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: QUERY_RETRY_COUNT,
      retryDelay: QUERY_RETRY_DELAY_MS,
      refetchOnWindowFocus: false,
    },
  },
});

interface QueryAuthError {
  message?: string;
  status?: number;
}
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    const raw = event.action.error;
    const err: QueryAuthError = raw && typeof raw === "object" ? (raw as QueryAuthError) : {};
    const msg = (err.message || "").toLowerCase();
    const is401 =
      msg.includes("unauthorized") ||
      msg.includes("session expired") ||
      msg.includes("please log in") ||
      err.status === 401;
    if (is401) log.warn("Received 401 from query - auth will be handled by fetcher");
  }
});

const LOADER_TIMEOUT_MS = 10_000;
function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to, navigate]);
  return null;
}
function GlobalAuthRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    function handleForceRedirect() {
      navigate("/login", { replace: true });
    }
    window.addEventListener("admin:force-redirect-to-login", handleForceRedirect);
    return () => window.removeEventListener("admin:force-redirect-to-login", handleForceRedirect);
  }, [navigate]);
  return null;
}
function SuspenseLoadingFallback() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), LOADER_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);
  if (timedOut)
    return (
      <ErrorRetry
        variant="page"
        title="Loading timed out"
        description="The page chunk took too long to load. Check your connection and try again."
      />
    );
  return (
    <div className="flex items-center justify-center p-12">
      <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
    </div>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function useLoaderTimeout(loading: boolean, ms = LOADER_TIMEOUT_MS): boolean {
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loading) {
      setTimedOut(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setTimeout(() => setTimedOut(true), ms);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loading, ms]);
  return timedOut;
}
function ProtectedRoute({
  component: Component,
  requirePermission,
  fullScreen = false,
}: {
  component: React.ComponentType;
  requirePermission?: string | string[];
  fullScreen?: boolean;
}) {
  const { has } = usePermissions();
  const allowed =
    !requirePermission ||
    (typeof requirePermission === "string"
      ? has(requirePermission)
      : requirePermission.some((p) => has(p)));
  if (!allowed) return <RedirectTo to="/403" />;
  return fullScreen ? (
    <Component />
  ) : (
    <AdminLayout>
      <Component />
    </AdminLayout>
  );
}

function AppRoutes() {
  const { state } = useAdminAuth();

  /* ── Preload high-traffic pages after initial render ── */
  useEffect(() => {
    const t = setTimeout(() => {
      void import("@/pages/dashboard");
      void import("@/pages/orders");
      void import("@/pages/users");
      void import("@/pages/riders");
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Suspense fallback={<SuspenseLoadingFallback />}>
      <Switch>
        {/* Root redirect */}
        <Route path="/">
          <RedirectTo to={state.accessToken ? "/dashboard" : "/login"} />
        </Route>

        {/* Auth screens */}
        <Route path="/login">
          <Login />
        </Route>
        <Route path="/forgot-password">
          <ForgotPassword />
        </Route>
        <Route path="/reset-password">
          <ResetPassword />
        </Route>
        <Route path="/set-new-password">
          <SetNewPassword />
        </Route>

        {/* Dashboard */}
        <Route path="/dashboard">
          <ProtectedRoute component={Dashboard} requirePermission="dashboard.view" />
        </Route>

        {/* Operations */}
        <Route path="/orders">
          <ProtectedRoute component={Orders} requirePermission="orders.view" />
        </Route>
        <Route path="/rides">
          <ProtectedRoute component={Rides} requirePermission="fleet.rides.view" />
        </Route>
        <Route path="/van">
          <ProtectedRoute component={VanService} requirePermission="fleet.rides.view" />
        </Route>
        <Route path="/pharmacy">
          <ProtectedRoute component={Pharmacy} requirePermission="fleet.pharmacy.view" />
        </Route>
        <Route path="/parcel">
          <ProtectedRoute component={Parcel} requirePermission="fleet.parcel.view" />
        </Route>
        <Route path="/delivery-access">
          <ProtectedRoute component={DeliveryAccess} requirePermission="vendors.view" />
        </Route>

        {/* People */}
        <Route path="/users">
          <ProtectedRoute component={Users} requirePermission="users.view" />
        </Route>
        <Route path="/riders">
          <ProtectedRoute component={Riders} requirePermission="fleet.rides.view" />
        </Route>
        <Route path="/vendors">
          <ProtectedRoute component={Vendors} requirePermission="vendors.view" />
        </Route>
        <Route path="/kyc">
          <ProtectedRoute component={Kyc} requirePermission="finance.kyc.view" />
        </Route>

        {/* Catalog */}
        <Route path="/products">
          <ProtectedRoute component={Products} requirePermission="content.products.view" />
        </Route>
        <Route path="/categories">
          <ProtectedRoute component={Categories} requirePermission="content.products.view" />
        </Route>
        <Route path="/reviews">
          <ProtectedRoute component={Reviews} requirePermission="content.products.view" />
        </Route>
        <Route path="/vendor-inventory-settings">
          <ProtectedRoute component={VendorInventorySettings} requirePermission="vendors.view" />
        </Route>

        {/* Finance */}
        <Route path="/transactions">
          <ProtectedRoute component={Transactions} requirePermission="finance.transactions.view" />
        </Route>
        <Route path="/withdrawals">
          <ProtectedRoute component={Withdrawals} requirePermission="finance.withdrawals.view" />
        </Route>
        <Route path="/deposit-requests">
          <ProtectedRoute component={DepositRequests} requirePermission="finance.deposits.review" />
        </Route>
        <Route path="/wallet-transfers">
          <ProtectedRoute
            component={WalletTransfers}
            requirePermission="finance.transactions.view"
          />
        </Route>
        <Route path="/loyalty">
          <ProtectedRoute component={Loyalty} requirePermission="promotions.view" />
        </Route>

        {/* Marketing */}
        <Route path="/promotions">
          <ProtectedRoute component={PromotionsHub} requirePermission="promotions.view" />
        </Route>
        <Route path="/promo-codes">
          <ProtectedRoute component={PromoCodes} requirePermission="promotions.view" />
        </Route>
        <Route path="/flash-deals">
          <ProtectedRoute component={FlashDeals} requirePermission="promotions.view" />
        </Route>
        <Route path="/banners">
          <ProtectedRoute component={Banners} requirePermission="content.products.view" />
        </Route>
        <Route path="/popups">
          <ProtectedRoute component={Popups} requirePermission="content.products.view" />
        </Route>

        {/* Communications */}
        <Route path="/communications">
          <ProtectedRoute component={Communication} requirePermission="support.broadcast.send" />
        </Route>
        <Route path="/broadcast">
          <ProtectedRoute component={Broadcast} requirePermission="support.broadcast.send" />
        </Route>
        <Route path="/support-chat">
          <ProtectedRoute component={SupportChat} requirePermission="support.chat.view" />
        </Route>
        <Route path="/faq-management">
          <ProtectedRoute component={FaqManagement} requirePermission="content.products.view" />
        </Route>
        <Route path="/sms-gateways">
          <ProtectedRoute component={SmsGateways} requirePermission="support.broadcast.send" />
        </Route>

        {/* Analytics */}
        <Route path="/analytics">
          <ProtectedRoute component={AnalyticsPage} requirePermission="finance.transactions.view" />
        </Route>
        <Route path="/revenue-analytics">
          <ProtectedRoute
            component={RevenueAnalytics}
            requirePermission="finance.transactions.view"
          />
        </Route>
        <Route path="/search-analytics">
          <ProtectedRoute
            component={SearchAnalyticsPage}
            requirePermission="system.settings.view"
          />
        </Route>
        <Route path="/wishlist-insights">
          <ProtectedRoute component={WishlistInsights} requirePermission="content.products.view" />
        </Route>
        <Route path="/qr-codes">
          <ProtectedRoute component={QrCodes} requirePermission="content.products.view" />
        </Route>
        <Route path="/experiments">
          <ProtectedRoute component={Experiments} requirePermission="system.settings.view" />
        </Route>

        {/* Security */}
        <Route path="/security">
          <ProtectedRoute component={Security} requirePermission="system.settings.view" />
        </Route>
        <Route path="/audit-logs">
          <ProtectedRoute component={AuditLogs} requirePermission="system.audit.view" />
        </Route>
        <Route path="/consent-log">
          <ProtectedRoute component={ConsentLog} requirePermission="system.audit.view" />
        </Route>
        <Route path="/roles-permissions">
          <ProtectedRoute component={RolesPermissions} requirePermission="system.roles.manage" />
        </Route>
        <Route path="/sos-alerts">
          <ProtectedRoute component={SosAlerts} requirePermission="fleet.rides.view" />
        </Route>

        {/* Health & Monitoring */}
        <Route path="/health-dashboard">
          <ProtectedRoute component={HealthDashboard} requirePermission="system.settings.view" />
        </Route>
        <Route path="/error-monitor">
          <ProtectedRoute component={ErrorMonitor} requirePermission="system.settings.view" />
        </Route>
        <Route path="/live-riders-map">
          <ProtectedRoute
            component={LiveRidersMap}
            requirePermission="fleet.rides.view"
            fullScreen
          />
        </Route>
        <Route path="/chat-monitor">
          <ProtectedRoute component={ChatMonitor} requirePermission="support.chat.view" />
        </Route>

        {/* Configuration */}
        <Route path="/settings">
          <ProtectedRoute component={Settings} requirePermission="system.settings.view" />
        </Route>
        <Route path="/app-management">
          <ProtectedRoute component={AppManagement} requirePermission="system.settings.view" />
        </Route>
        <Route path="/auth-methods">
          <ProtectedRoute component={AuthMethods} requirePermission="system.settings.edit" />
        </Route>
        <Route path="/auth-control">
          <ProtectedRoute component={AuthControl} requirePermission="system.settings.edit" />
        </Route>
        <Route path="/launch-control">
          <ProtectedRoute component={LaunchControl} requirePermission="system.maintenance" />
        </Route>
        <Route path="/otp-control">
          <ProtectedRoute component={OtpControl} requirePermission="system.settings.edit" />
        </Route>
        <Route path="/business-rules">
          <ProtectedRoute component={BusinessRulesPage} requirePermission="system.settings.view" />
        </Route>
        <Route path="/deep-links">
          <ProtectedRoute component={DeepLinks} requirePermission="content.products.view" />
        </Route>
        <Route path="/webhooks">
          <ProtectedRoute component={WebhookManager} requirePermission="system.settings.view" />
        </Route>
        <Route path="/whatsapp-delivery-log">
          <ProtectedRoute
            component={WhatsAppDeliveryLog}
            requirePermission="system.settings.view"
          />
        </Route>
        <Route path="/account-conditions">
          <ProtectedRoute component={AccountConditions} requirePermission="system.settings.view" />
        </Route>
        <Route path="/condition-rules">
          <ProtectedRoute component={ConditionRules} requirePermission="system.settings.view" />
        </Route>
        <Route path="/accessibility">
          <ProtectedRoute component={AccessibilityPage} requirePermission="system.settings.view" />
        </Route>

        {/* Error pages */}
        <Route path="/403">
          <Forbidden />
        </Route>
        <Route path="/404">
          <NotFound />
        </Route>
        <Route>
          <NotFound />
        </Route>
      </Switch>
    </Suspense>
  );
}

function VersionCheckInit() {
  useVersionCheck();
  return null;
}
function LanguageInit() {
  useLanguage();
  return null;
}
function IntegrationsInit() {
  const { state, refreshAccessToken } = useAdminAuth();
  useEffect(() => {
    setupAdminFetcherHandlers(
      () => state.accessToken,
      () => refreshAccessToken()
    );
  }, [state.accessToken, refreshAccessToken]);
  useEffect(() => {
    initErrorReporter();
    void fetch(`/api/platform-config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (!raw) return;
        const d = raw?.data ?? raw;
        const integ = d?.integrations;
        if (!integ) return;
        if (integ.sentry && integ.sentryDsn)
          initSentry({
            dsn: integ.sentryDsn,
            environment: integ.sentryEnvironment || "production",
            sampleRate: integ.sentrySampleRate ?? 0.2,
            tracesSampleRate: integ.sentryTracesSampleRate ?? 0.1,
          });
      });
  }, []);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ThemeProvider theme={adminTheme}>
            <AdminAuthProvider>
              <WouterRouter base="/admin">
                <GlobalAuthRedirect />
                <VersionCheckInit />
                <LanguageInit />
                <IntegrationsInit />
                <AppRoutes />
                <FirstLoginCredentialsDialog />
                <Toaster />
              </WouterRouter>
            </AdminAuthProvider>
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
