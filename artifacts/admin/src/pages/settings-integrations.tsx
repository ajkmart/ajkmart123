import { Field, SecretInput, SLabel, Toggle } from "@/components/AdminShared";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MapsMgmtSection } from "@/components/MapsMgmtSection";
import { ManageInSettingsLink } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { adminAbsoluteFetch, adminFetch } from "@/lib/adminFetcher";
import { parseIntegrationTestResponse } from "@/lib/integrationsApi";
import {
  loadIntegrationTestHistory,
  recordIntegrationTestResult,
} from "@/lib/integrationTestHistory";
import { isValidPhone } from "@/lib/validation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bug,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Flame,
  FlaskConical,
  Globe,
  Info,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  Shield,
  ToggleRight,
} from "lucide-react";
import { useEffect, useState } from "react";

/* ─── Integrations Section ───────────────────────────────────────────────── */
type IntTab = "firebase" | "sms" | "email" | "whatsapp" | "analytics" | "sentry" | "maps";

const INT_TABS: {
  id: IntTab;
  label: string;
  emoji: string;
  color: string;
  active: string;
  desc: string;
}[] = [
  {
    id: "firebase",
    label: "Firebase",
    emoji: "🔥",
    color: "text-orange-700",
    active: "bg-orange-600",
    desc: "Push notifications for riders & customers",
  },
  {
    id: "sms",
    label: "SMS",
    emoji: "📱",
    color: "text-blue-700",
    active: "bg-blue-600",
    desc: "OTP, order alerts & ride updates",
  },
  {
    id: "email",
    label: "Email",
    emoji: "📧",
    color: "text-teal-700",
    active: "bg-teal-600",
    desc: "SMTP email alerts to admins",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    emoji: "💬",
    color: "text-green-700",
    active: "bg-green-600",
    desc: "WhatsApp Business API notifications",
  },
  {
    id: "analytics",
    label: "Analytics",
    emoji: "📊",
    color: "text-purple-700",
    active: "bg-purple-600",
    desc: "Google Analytics or Mixpanel tracking",
  },
  {
    id: "sentry",
    label: "Sentry",
    emoji: "🐛",
    color: "text-red-700",
    active: "bg-red-600",
    desc: "Error monitoring & performance traces",
  },
  {
    id: "maps",
    label: "Maps",
    emoji: "🗺️",
    color: "text-sky-700",
    active: "bg-sky-600",
    desc: "Google Maps for routing & tracking",
  },
];

/* ─── Integration Health Panel ────────────────────────────────────────────── */

type HealthStatus = "configured" | "partial" | "missing" | "disabled" | "manual";

interface IntegrationHealth {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: HealthStatus;
  missingFields: string[];
  hint?: string;
  testType?: "email" | "sms" | "whatsapp" | "maps" | "fcm" | "jazzcash" | "easypaisa";
  needsPhone?: boolean;
  needsToken?: boolean;
  navigateTo?: IntTab;
}

function computeHealth(localValues: Record<string, string>): IntegrationHealth[] {
  const v = (k: string) => (localValues[k] ?? "").trim();
  const on = (k: string, def = "off") => (localValues[k] ?? def) === "on";

  /* Firebase FCM */
  const fcmEnabled = on("integration_push_notif");
  const fcmKeys = { "FCM Server Key": v("fcm_server_key"), "Project ID": v("fcm_project_id") };
  const fcmMissing = Object.entries(fcmKeys)
    .filter(([, val]) => !val)
    .map(([k]) => k);
  const fcmStatus: HealthStatus = !fcmEnabled
    ? "disabled"
    : fcmMissing.length === 0
      ? "configured"
      : fcmMissing.length < Object.keys(fcmKeys).length
        ? "partial"
        : "missing";

  /* SMS — provider-specific required fields */
  const smsEnabled = on("integration_sms");
  const smsProvider = v("sms_provider") || "console";
  const smsIsConsole = smsProvider === "console";
  const smsMissing: string[] = [];
  if (!smsIsConsole) {
    if (smsProvider === "twilio") {
      if (!v("sms_account_sid")) smsMissing.push("Account SID");
      if (!v("sms_api_key")) smsMissing.push("Auth Token");
      if (!v("sms_sender_id")) smsMissing.push("From Phone Number");
    } else if (smsProvider === "msg91") {
      if (!v("sms_msg91_key")) smsMissing.push("MSG91 Auth Key");
      if (!v("sms_sender_id")) smsMissing.push("Sender ID");
    } else {
      if (!v("sms_api_key")) smsMissing.push("API Key");
      if (!v("sms_sender_id")) smsMissing.push("Sender ID");
    }
  }
  const smsStatus: HealthStatus = !smsEnabled
    ? "disabled"
    : smsIsConsole
      ? "partial"
      : smsMissing.length === 0
        ? "configured"
        : smsMissing.length < (smsProvider === "twilio" ? 3 : 2)
          ? "partial"
          : "missing";

  /* Email / SMTP */
  const emailEnabled = on("integration_email");
  const smtpFields = {
    "SMTP Host": v("smtp_host"),
    Username: v("smtp_user"),
    Password: v("smtp_password"),
  };
  const smtpMissing = Object.entries(smtpFields)
    .filter(([, val]) => !val)
    .map(([k]) => k);
  const emailStatus: HealthStatus = !emailEnabled
    ? "disabled"
    : smtpMissing.length === 0
      ? "configured"
      : smtpMissing.length < Object.keys(smtpFields).length
        ? "partial"
        : "missing";

  /* WhatsApp */
  const waEnabled = on("integration_whatsapp");
  const waFields = {
    "Phone Number ID": v("wa_phone_number_id"),
    "Access Token": v("wa_access_token"),
  };
  const waMissing = Object.entries(waFields)
    .filter(([, val]) => !val)
    .map(([k]) => k);
  const waStatus: HealthStatus = !waEnabled
    ? "disabled"
    : waMissing.length === 0
      ? "configured"
      : waMissing.length < Object.keys(waFields).length
        ? "partial"
        : "missing";

  /* Analytics */
  const analyticsPlatform = v("analytics_platform") || "none";
  const analyticsTrackingId = v("analytics_tracking_id");
  const analyticsStatus: HealthStatus =
    analyticsPlatform === "none" ? "disabled" : analyticsTrackingId ? "configured" : "missing";
  const analyticsMissing = analyticsTrackingId ? [] : ["Tracking ID / API Key"];

  /* Sentry */
  const sentryDsn = v("sentry_dsn");
  const sentryEnabled = on("integration_sentry");
  const sentryStatus: HealthStatus = !sentryEnabled
    ? "disabled"
    : sentryDsn
      ? "configured"
      : "missing";

  /* Weather Widget */
  const weatherEnabled = on("feature_weather", "on");
  const weatherStatus: HealthStatus = weatherEnabled ? "configured" : "disabled";

  /* Maps */
  const mapsEnabled = on("integration_maps");
  const mapsProvider = v("maps_provider") || "google";
  const mapsKey =
    v("google_maps_api_key") || v("maps_api_key") || v("mapbox_api_key") || v("locationiq_api_key");
  const mapsMissing = mapsKey
    ? []
    : [
        `${mapsProvider === "mapbox" ? "Mapbox" : mapsProvider === "locationiq" ? "LocationIQ" : "Google Maps"} API Key`,
      ];
  const mapsStatus: HealthStatus = !mapsEnabled ? "disabled" : mapsKey ? "configured" : "missing";

  /* JazzCash */
  const jcEnabled = on("jazzcash_enabled");
  const jcType = v("jazzcash_type") || "manual";
  const jcApiReady = !!(v("jazzcash_merchant_id") && v("jazzcash_password") && v("jazzcash_salt"));
  const jcApiMissing = [
    ...(!v("jazzcash_merchant_id") ? ["Merchant ID"] : []),
    ...(!v("jazzcash_password") ? ["Password"] : []),
    ...(!v("jazzcash_salt") ? ["Integrity Salt"] : []),
  ];
  const jcStatus: HealthStatus = !jcEnabled
    ? "disabled"
    : jcType === "manual"
      ? "manual"
      : jcApiReady
        ? "configured"
        : jcApiMissing.length < 3
          ? "partial"
          : "missing";
  const jcMissing = jcType === "manual" ? [] : jcApiMissing;

  /* EasyPaisa */
  const epEnabled = on("easypaisa_enabled");
  const epType = v("easypaisa_type") || "manual";
  const epApiReady = !!(v("easypaisa_store_id") && v("easypaisa_hash_key"));
  const epApiMissing = [
    ...(!v("easypaisa_store_id") ? ["Store ID"] : []),
    ...(!v("easypaisa_hash_key") ? ["Hash Key"] : []),
  ];
  const epStatus: HealthStatus = !epEnabled
    ? "disabled"
    : epType === "manual"
      ? "manual"
      : epApiReady
        ? "configured"
        : epApiMissing.length < 2
          ? "partial"
          : "missing";
  const epMissing = epType === "manual" ? [] : epApiMissing;

  return [
    {
      id: "firebase",
      label: "Firebase FCM",
      icon: <Flame className="h-4 w-4 text-orange-500" />,
      status: fcmStatus,
      missingFields: fcmMissing,
      hint: fcmStatus === "partial" ? "Server Key or Project ID missing" : undefined,
      testType: fcmStatus === "configured" ? ("fcm" as const) : undefined,
      needsToken: true,
      navigateTo: "firebase",
    },
    {
      id: "sms",
      label: "SMS Gateway",
      icon: <Phone className="h-4 w-4 text-blue-500" />,
      status: smsStatus,
      missingFields: smsMissing,
      hint:
        smsIsConsole && smsEnabled ? "Console (Dev) mode — OTP logs to terminal only" : undefined,
      testType: smsStatus === "configured" ? "sms" : undefined,
      needsPhone: true,
      navigateTo: "sms",
    },
    {
      id: "email",
      label: "Email / SMTP",
      icon: <Mail className="h-4 w-4 text-teal-500" />,
      status: emailStatus,
      missingFields: smtpMissing,
      testType: emailStatus === "configured" ? "email" : undefined,
      navigateTo: "email",
    },
    {
      id: "whatsapp",
      label: "WhatsApp Business",
      icon: <MessageSquare className="h-4 w-4 text-green-500" />,
      status: waStatus,
      missingFields: waMissing,
      testType: waStatus === "configured" ? "whatsapp" : undefined,
      needsPhone: true,
      navigateTo: "whatsapp",
    },
    {
      id: "maps",
      label: "Maps API",
      icon: <MapPin className="h-4 w-4 text-sky-500" />,
      status: mapsStatus,
      missingFields: mapsMissing,
      testType: mapsStatus === "configured" ? "maps" : undefined,
      navigateTo: "maps",
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: <BarChart3 className="h-4 w-4 text-purple-500" />,
      status: analyticsStatus,
      missingFields: analyticsMissing,
      hint:
        analyticsPlatform !== "none" && !analyticsTrackingId
          ? `${analyticsPlatform} tracking ID required`
          : undefined,
      navigateTo: "analytics",
    },
    {
      id: "sentry",
      label: "Sentry",
      icon: <Bug className="h-4 w-4 text-red-500" />,
      status: sentryStatus,
      missingFields: sentryDsn ? [] : ["Sentry DSN URL"],
      navigateTo: "sentry",
    },
    {
      id: "weather",
      label: "Weather Widget",
      icon: <Activity className="h-4 w-4 text-sky-500" />,
      status: weatherStatus,
      missingFields: [],
      hint: weatherEnabled
        ? "Widget enabled — configure cities in Widgets → Weather"
        : "Widget disabled in feature flags",
    },
    {
      id: "jazzcash",
      label: `JazzCash ${jcType === "manual" ? "(Manual)" : "(API)"}`,
      icon: <CreditCard className="h-4 w-4 text-red-600" />,
      status: jcStatus,
      missingFields: jcMissing,
      hint:
        jcType === "manual" && jcStatus === "manual"
          ? "Manual mode — always ready, no API needed"
          : undefined,
      testType:
        jcStatus === "configured" || jcStatus === "manual" ? ("jazzcash" as const) : undefined,
    },
    {
      id: "easypaisa",
      label: `EasyPaisa ${epType === "manual" ? "(Manual)" : "(API)"}`,
      icon: <CreditCard className="h-4 w-4 text-green-600" />,
      status: epStatus,
      missingFields: epMissing,
      hint:
        epType === "manual" && epStatus === "manual"
          ? "Manual mode — always ready, no API needed"
          : undefined,
      testType:
        epStatus === "configured" || epStatus === "manual" ? ("easypaisa" as const) : undefined,
    },
  ];
}

const STATUS_CONFIG: Record<HealthStatus, { label: string; badge: string; dot: string }> = {
  configured: {
    label: "Configured",
    badge: "bg-green-100 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
  partial: {
    label: "Partial",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-400",
  },
  missing: { label: "Missing", badge: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-400" },
  disabled: {
    label: "Disabled",
    badge: "bg-gray-100 text-gray-500 border-gray-200",
    dot: "bg-gray-300",
  },
  manual: {
    label: "Manual Ready",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-400",
  },
};

function IntegrationHealthPanel({
  localValues,
  switchTab,
}: {
  localValues: Record<string, string>;
  switchTab: (tab: IntTab) => void;
}) {
  const { toast } = useToast();
  const [phoneInputs, setPhoneInputs] = useState<Record<string, string>>({});
  const [testingMap, setTestingMap] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; msg: string } | null>
  >({});

  /**
   * Hydrate previously persisted test results so admins see the last
   * known state of each integration after a reload, rather than having
   * to re-run every probe. Persistence is best-effort (see
   * `integrationTestHistory.ts`) and never throws into the React tree.
   */
  useEffect(() => {
    const history = loadIntegrationTestHistory();
    if (Object.keys(history).length === 0) return;
    const seed: Record<string, { ok: boolean; msg: string } | null> = {};
    for (const [id, entry] of Object.entries(history)) {
      seed[id] = { ok: entry.ok, msg: entry.msg };
    }
    setTestResults((prev) => ({ ...seed, ...prev }));
  }, []);

  const rows = computeHealth(localValues);
  const configuredCount = rows.filter(
    (r) => r.status === "configured" || r.status === "manual"
  ).length;
  const missingCount = rows.filter((r) => r.status === "missing").length;
  const partialCount = rows.filter((r) => r.status === "partial").length;

  async function handleTest(row: IntegrationHealth) {
    if (!row.testType) return;
    const id = row.id;
    setTestingMap((prev) => ({ ...prev, [id]: true }));
    setTestResults((prev) => ({ ...prev, [id]: null }));
    try {
      let data: unknown;
      if (row.testType === "jazzcash" || row.testType === "easypaisa") {
        data = await adminAbsoluteFetch(`/api/payments/test-connection/${row.testType}`, {
          method: "GET",
        });
      } else {
        const body: Record<string, string> = {};
        if (row.testType === "sms" || row.testType === "whatsapp") {
          const phone = (phoneInputs[id + "_phone"] ?? "").trim();
          if (!phone) {
            setPhoneInputs((p) => ({ ...p, [id + "_phone_err"]: "1" }));
            setTestingMap((prev) => ({ ...prev, [id]: false }));
            return;
          }
          if (!isValidPhone(phone)) {
            setPhoneInputs((p) => ({ ...p, [id + "_phone_err"]: "1" }));
            setTestingMap((prev) => ({ ...prev, [id]: false }));
            toast({
              title: "Invalid phone",
              description: "Use E.164 (+countrycode...) or local 03xxxxxxxxx.",
              variant: "destructive",
            });
            return;
          }
          body["phone"] = phone;
        } else if (row.testType === "fcm") {
          const token = (phoneInputs[id + "_token"] ?? "").trim();
          if (!token) {
            setPhoneInputs((p) => ({ ...p, [id + "_token_err"]: "1" }));
            setTestingMap((prev) => ({ ...prev, [id]: false }));
            return;
          }
          body["deviceToken"] = token;
        }
        data = await adminFetch(`/system/test-integration/${row.testType}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      // Use the typed normaliser instead of `(data as any)` accesses so
      // that the integration health card honours backend `ok`/`error`
      // fields consistently across endpoints.
      const parsed = parseIntegrationTestResponse(data, `${row.label} test passed`);
      const entry = { ok: parsed.ok, msg: parsed.message };
      setTestResults((prev) => ({ ...prev, [id]: entry }));
      recordIntegrationTestResult(id, entry);
      toast({
        title: parsed.ok ? `${row.label} ✅` : `${row.label} ⚠️`,
        description: parsed.message,
        ...(parsed.ok ? {} : { variant: "destructive" as const }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : `${row.label} test failed`;
      const entry = { ok: false, msg };
      setTestResults((prev) => ({ ...prev, [id]: entry }));
      recordIntegrationTestResult(id, entry);
      toast({ title: "Test Failed ❌", description: msg, variant: "destructive" });
    } finally {
      setTestingMap((prev) => ({ ...prev, [id]: false }));
    }
  }

  const isTesting = (id: string) => !!testingMap[id];
  const result = (id: string) => testResults[id] ?? null;

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-indigo-200/70 bg-indigo-50/80 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Activity className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-indigo-900">Integration Health</h3>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
            {configuredCount}/{rows.length} Ready
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-semibold">
          {missingCount > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
              {missingCount} Missing
            </span>
          )}
          {partialCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
              {partialCount} Partial
            </span>
          )}
        </div>
      </div>

      {/* Grid of rows */}
      <div className="divide-y divide-indigo-100/60">
        {rows.map((row) => {
          const cfg = STATUS_CONFIG[row.status];
          const testing = isTesting(row.id);
          const res = result(row.id);
          const needPhone = row.testType === "sms" || row.testType === "whatsapp";
          const needToken = row.testType === "fcm";
          const phoneVal = phoneInputs[row.id + "_phone"] ?? "";
          const phoneErr = phoneInputs[row.id + "_phone_err"];
          const tokenVal = phoneInputs[row.id + "_token"] ?? "";
          const tokenErr = phoneInputs[row.id + "_token_err"];
          const canTest = !!row.testType && row.status !== "disabled";

          return (
            <div
              key={row.id}
              className="group flex flex-col gap-2 px-4 py-2.5 transition-colors hover:bg-indigo-50/40 sm:flex-row sm:items-center"
            >
              {/* Icon + Name + Status */}
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-white shadow-sm">
                  {row.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-foreground text-xs font-bold">{row.label}</span>
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${cfg.badge} inline-flex items-center gap-1`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                    {res && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${res.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                      >
                        {res.ok ? "✓ OK" : "✗ Fail"}
                      </span>
                    )}
                  </div>
                  {row.hint && (
                    <p className="text-muted-foreground mt-0.5 truncate text-[10px]">{row.hint}</p>
                  )}
                  {row.missingFields.length > 0 && row.status !== "disabled" && (
                    <p className="mt-0.5 truncate text-[10px] text-red-600">
                      Missing: {row.missingFields.join(", ")}
                    </p>
                  )}
                  {res && (
                    <p
                      className={`mt-0.5 truncate text-[10px] ${res.ok ? "text-green-700" : "text-red-600"}`}
                      title={res.msg}
                    >
                      {res.msg}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-shrink-0 items-center gap-1.5 pl-9 sm:pl-0">
                {needPhone && canTest && (
                  <div className="relative">
                    <Input
                      value={phoneVal}
                      onChange={(e) =>
                        setPhoneInputs((p) => ({
                          ...p,
                          [row.id + "_phone"]: e.target.value,
                          [row.id + "_phone_err"]: "",
                        }))
                      }
                      placeholder="03xxxxxxxxx"
                      className={`h-7 w-32 font-mono text-xs ${phoneErr ? "border-red-400" : ""}`}
                    />
                    {phoneErr && (
                      <p className="absolute -bottom-3.5 left-0 text-[9px] text-red-500">
                        Phone required
                      </p>
                    )}
                  </div>
                )}
                {needToken && canTest && (
                  <div className="relative">
                    <Input
                      value={tokenVal}
                      onChange={(e) =>
                        setPhoneInputs((p) => ({
                          ...p,
                          [row.id + "_token"]: e.target.value,
                          [row.id + "_token_err"]: "",
                        }))
                      }
                      placeholder="FCM device token"
                      className={`h-7 w-36 font-mono text-xs ${tokenErr ? "border-red-400" : ""}`}
                    />
                    {tokenErr && (
                      <p className="absolute -bottom-3.5 left-0 text-[9px] text-red-500">
                        Token required
                      </p>
                    )}
                  </div>
                )}
                {canTest && (
                  <button
                    type="button"
                    onClick={() => handleTest(row)}
                    disabled={testing}
                    title={`Test ${row.label}`}
                    className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white transition-all hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                  >
                    {testing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    {testing ? "Testing…" : "Test"}
                  </button>
                )}
                {row.navigateTo && (
                  <button
                    type="button"
                    onClick={() => switchTab(row.navigateTo!)}
                    title={`Open ${row.label} settings`}
                    className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 transition-colors hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Config
                  </button>
                )}
                {row.status === "disabled" && !row.navigateTo && (
                  <span className="text-muted-foreground text-[10px]">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="flex items-center gap-1.5 border-t border-indigo-100/70 bg-indigo-50/40 px-4 py-2">
        <Info className="h-3 w-3 flex-shrink-0 text-indigo-400" />
        <p className="text-[10px] text-indigo-600">
          Status updates instantly when settings are changed. Use Config to open each integration's
          settings.
        </p>
      </div>
    </div>
  );
}

function IntStatusBadge({ enabled, configured }: { enabled: boolean; configured: boolean }) {
  if (!enabled)
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
        DISABLED
      </span>
    );
  if (!configured)
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
        NOT CONFIGURED
      </span>
    );
  return (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
      ● ACTIVE
    </span>
  );
}

function IntCard({
  title,
  emoji,
  description,
  enableKey,
  localValues,
  dirtyKeys,
  handleToggle,
  configured,
  children,
}: {
  title: string;
  emoji: string;
  description: string;
  enableKey: string;
  localValues: Record<string, string>;
  dirtyKeys: Set<string>;
  handleToggle: (k: string, v: boolean) => void;
  configured: boolean;
  children: React.ReactNode;
}) {
  const enabled = (localValues[enableKey] ?? "off") === "on";
  return (
    <div
      className={`rounded-2xl border-2 transition-all ${enabled ? "border-green-200 bg-white" : "border-border bg-muted/20 border-dashed"}`}
    >
      {/* Card Header */}
      <div className="border-border/50 flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{emoji}</span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-foreground text-sm font-bold">{title}</h4>
              <IntStatusBadge enabled={enabled} configured={configured} />
              {dirtyKeys.has(enableKey) && (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                >
                  CHANGED
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleToggle(enableKey, !enabled)}
          aria-label={enabled ? `Disable ${title}` : `Enable ${title}`}
          className="focus-visible:ring-primary ml-3 flex-shrink-0 rounded-full focus:outline-none focus-visible:ring-2"
        >
          <div
            className={`relative h-6 w-12 rounded-full transition-colors ${enabled ? "bg-green-500" : "bg-gray-300"}`}
          >
            <div
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-0.5"}`}
            />
          </div>
        </button>
      </div>
      {/* Card Body — only when enabled */}
      {enabled ? (
        <div className="p-4">{children}</div>
      ) : (
        <div className="text-muted-foreground p-4 text-center text-sm">
          Enable this integration to configure its settings
        </div>
      )}
    </div>
  );
}

export function IntegrationsSection({
  localValues,
  dirtyKeys,
  handleChange,
  handleToggle,
}: {
  localValues: Record<string, string>;
  dirtyKeys: Set<string>;
  handleChange: (k: string, v: string) => void;
  handleToggle: (k: string, v: boolean) => void;
}) {
  const [intTab, setIntTab] = useState<IntTab>("firebase");

  /* Per-integration test state (keyed by type) */
  const [testPhones, setTestPhones] = useState<Record<string, string>>({});
  const [testingMap, setTestingMap] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; msg: string } | null>
  >({});
  const [fcmDeviceToken, setFcmDeviceToken] = useState("");

  const { toast } = useToast();

  /* Hydrate persisted test results — see IntegrationHealthMatrix above. */
  useEffect(() => {
    const history = loadIntegrationTestHistory();
    const seed: Record<string, { ok: boolean; msg: string } | null> = {};
    for (const type of ["email", "sms", "whatsapp", "fcm", "maps"] as const) {
      const entry = history[`runTest:${type}`];
      if (entry) seed[type] = { ok: entry.ok, msg: entry.msg };
    }
    if (Object.keys(seed).length > 0) {
      setTestResults((prev) => ({ ...seed, ...prev }));
    }
  }, []);

  const val = (k: string) => localValues[k] ?? "";
  const dirty = (k: string) => dirtyKeys.has(k);
  const tog = (k: string, def: string = "off") => (localValues[k] ?? def) === "on";

  /* Clear stale test results when switching tabs */
  const switchTab = (tab: IntTab) => {
    setIntTab(tab);
  };

  async function runTest(type: "email" | "sms" | "whatsapp" | "fcm" | "maps") {
    setTestingMap((prev) => ({ ...prev, [type]: true }));
    setTestResults((prev) => ({ ...prev, [type]: null }));
    try {
      const body: Record<string, string> = {};
      if (type === "sms" || type === "whatsapp") {
        const phone = (testPhones[type] ?? "").trim();
        if (!phone) {
          toast({
            title: "Phone required",
            description: "Enter a phone number to test SMS/WhatsApp",
            variant: "destructive",
          });
          setTestingMap((prev) => ({ ...prev, [type]: false }));
          return;
        }
        if (!isValidPhone(phone)) {
          toast({
            title: "Invalid phone",
            description: "Use E.164 (+countrycode...) or local 03xxxxxxxxx.",
            variant: "destructive",
          });
          setTestingMap((prev) => ({ ...prev, [type]: false }));
          return;
        }
        body["phone"] = phone;
      }
      if (type === "fcm") {
        const token = fcmDeviceToken.trim();
        if (!token) {
          toast({
            title: "Device token required",
            description: "Enter an FCM device token to test push notifications",
            variant: "destructive",
          });
          setTestingMap((prev) => ({ ...prev, [type]: false }));
          return;
        }
        body["deviceToken"] = token;
      }
      const data = await adminFetch(`/system/test-integration/${type}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const parsed = parseIntegrationTestResponse(data, `${type} test sent successfully`);
      const entry = { ok: parsed.ok, msg: parsed.message };
      setTestResults((prev) => ({ ...prev, [type]: entry }));
      recordIntegrationTestResult(`runTest:${type}`, entry);
      toast({
        title: parsed.ok ? "Test Passed ✅" : "Test Failed ❌",
        description: parsed.message,
        ...(parsed.ok ? {} : { variant: "destructive" as const }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : `${type} test failed`;
      const entry = { ok: false, msg };
      setTestResults((prev) => ({ ...prev, [type]: entry }));
      recordIntegrationTestResult(`runTest:${type}`, entry);
      toast({ title: "Test Failed ❌", description: msg, variant: "destructive" });
    } finally {
      setTestingMap((prev) => ({ ...prev, [type]: false }));
    }
  }

  function TestRow({ type, label }: { type: "email" | "sms" | "whatsapp"; label: string }) {
    const needsPhone = type !== "email";
    const isTesting = !!testingMap[type];
    const result = testResults[type] ?? null;
    return (
      <div className="bg-muted/30 border-border/50 flex flex-col items-start gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FlaskConical className="text-muted-foreground h-4 w-4 flex-shrink-0" />
          <span className="text-foreground text-xs font-semibold">{label}</span>
          {result && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${result.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
            >
              {result.ok ? "✓ PASSED" : "✗ FAILED"}
            </span>
          )}
        </div>
        {needsPhone && (
          <Input
            value={testPhones[type] ?? ""}
            onChange={(e) => setTestPhones((prev) => ({ ...prev, [type]: e.target.value }))}
            placeholder="03xxxxxxxxx"
            className="h-7 w-40 font-mono text-xs"
          />
        )}
        <button
          type="button"
          onClick={() => runTest(type)}
          disabled={isTesting}
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 disabled:opacity-50"
        >
          {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          {isTesting ? "Sending…" : "Send Test"}
        </button>
        {result && (
          <p
            className="text-muted-foreground w-full max-w-xs truncate text-[10px] sm:w-auto"
            title={result.msg}
          >
            {result.msg}
          </p>
        )}
      </div>
    );
  }

  const F = ({
    label,
    k,
    placeholder,
    mono,
    hint,
  }: {
    label: string;
    k: string;
    placeholder?: string;
    mono?: boolean;
    hint?: string;
  }) => (
    <Field
      label={label}
      value={val(k)}
      onChange={(v) => handleChange(k, v)}
      isDirty={dirty(k)}
      placeholder={placeholder}
      mono={mono}
      hint={hint}
    />
  );
  const S = ({ label, k, placeholder }: { label: string; k: string; placeholder?: string }) => (
    <SecretInput
      label={label}
      value={val(k)}
      onChange={(v) => handleChange(k, v)}
      isDirty={dirty(k)}
      placeholder={placeholder}
    />
  );
  const T = ({
    label,
    k,
    sub,
    def = "off",
  }: {
    label: string;
    k: string;
    sub?: string;
    def?: string;
  }) => (
    <Toggle
      label={label}
      checked={tog(k, def)}
      onChange={(v) => handleToggle(k, v)}
      isDirty={dirty(k)}
      sub={sub}
    />
  );

  /* ── Firebase ── */
  const fcmConfigured = !!(val("fcm_server_key") || val("fcm_project_id"));
  /* ── SMS ── */
  const smsProvider = val("sms_provider") || "console";
  const smsEnabled = (localValues["integration_sms"] ?? "off") === "on";
  const smsConsoleActive = smsEnabled && smsProvider === "console";
  const smsConfigured =
    smsEnabled && smsProvider !== "console" && !!(val("sms_api_key") || val("sms_msg91_key"));
  /* ── Email ── */
  const emailEnabled = (localValues["integration_email"] ?? "off") === "on";
  const smtpConfigured =
    emailEnabled && !!(val("smtp_host") && val("smtp_user") && val("smtp_password"));
  /* ── WhatsApp ── */
  const waEnabled = (localValues["integration_whatsapp"] ?? "off") === "on";
  const waConfigured = waEnabled && !!(val("wa_phone_number_id") && val("wa_access_token"));
  /* ── Analytics ── */
  const analyticsPlatform = val("analytics_platform") || "none";
  const analyticsConfigured = analyticsPlatform !== "none" && !!val("analytics_tracking_id");
  /* ── Sentry ── */
  const sentryConfigured = !!val("sentry_dsn");
  /* ── Maps ── */
  const mapsEnabled = (localValues["integration_maps"] ?? "off") === "on";
  const mapsConfigured = !!(
    val("maps_api_key") ||
    val("mapbox_api_key") ||
    val("google_maps_api_key") ||
    val("locationiq_api_key")
  );

  /* Dynamic webhook URL */
  const webhookBaseUrl = window.location.origin;
  const whatsappWebhookUrl = `${webhookBaseUrl}/api/webhooks/whatsapp`;

  /* ── OTP delivery health ── */
  /* Console mode counts as active (OTP goes to server terminal) */
  const anyOtpProviderReady = smsConfigured || smsConsoleActive || smtpConfigured || waConfigured;
  const strictWhenNoProvider = (localValues["otp_require_when_no_provider"] ?? "off") === "on";

  return (
    <div className="space-y-4">
      {/* ── Integration Health Panel ── */}
      <IntegrationHealthPanel localValues={localValues} switchTab={switchTab} />

      {/* ── OTP Default Control Panel ── */}
      <div
        className={`space-y-4 rounded-2xl border-2 p-4 ${anyOtpProviderReady ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50"}`}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {anyOtpProviderReady ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            )}
            <div>
              <p
                className={`text-sm font-bold ${anyOtpProviderReady ? "text-green-800" : "text-amber-800"}`}
              >
                {anyOtpProviderReady
                  ? "OTP Delivery Active"
                  : "OTP Delivery — No Provider Configured"}
              </p>
              <p
                className={`mt-0.5 text-xs ${anyOtpProviderReady ? "text-green-700" : "text-amber-700"}`}
              >
                {anyOtpProviderReady
                  ? `Active: ${[
                      smsConfigured && "SMS",
                      smsConsoleActive && !smsConfigured && "SMS Console (Dev)",
                      waConfigured && "WhatsApp",
                      smtpConfigured && "Email",
                    ]
                      .filter(Boolean)
                      .join(", ")}`
                  : "SMS, WhatsApp aur Email — koi bhi configured nahi hai."}
              </p>
              {smsConsoleActive && !smsConfigured && (
                <p className="mt-1 text-[10px] font-medium text-amber-600">
                  ⚠️ Console (Dev) mode active — OTP sirf server terminal mein print hota hai, real
                  SMS nahi jaata.
                </p>
              )}
            </div>
          </div>
          <span
            className={`flex-shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${anyOtpProviderReady ? "bg-green-200 text-green-800" : "bg-amber-200 text-amber-800"}`}
          >
            {anyOtpProviderReady ? "● ACTIVE" : "NOT CONFIGURED"}
          </span>
        </div>

        {/* ── OTP Enable / Disable when no provider ── */}
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${anyOtpProviderReady ? "border-green-200 bg-white/60" : "border-amber-200 bg-white/60"}`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-xs font-bold">OTP Default Mode (when no provider)</p>
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              {strictWhenNoProvider
                ? "🔒 Strict — OTP required; login blocked if no provider configured."
                : "🔓 Bypass — OTP auto-disabled; users can log in without a code."}
            </p>
            <p className="text-muted-foreground mt-1 text-[10px] italic">
              Jab koi SMS/WhatsApp/Email provider set nahi ho tab kya ho?
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${strictWhenNoProvider ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}
              >
                {strictWhenNoProvider ? "OTP ON (Block)" : "OTP OFF (Bypass)"}
              </span>
              <button
                type="button"
                onClick={() => handleToggle("otp_require_when_no_provider", !strictWhenNoProvider)}
                aria-label="Toggle OTP strict mode"
                className="focus-visible:ring-primary rounded-full focus:outline-none focus-visible:ring-2"
              >
                <div
                  className={`relative h-5 w-10 rounded-full transition-colors ${strictWhenNoProvider ? "bg-red-500" : "bg-blue-400"}`}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${strictWhenNoProvider ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </div>
              </button>
            </div>
            {dirtyKeys.has("otp_require_when_no_provider") && (
              <span className="text-[9px] font-bold text-amber-600">● Unsaved</span>
            )}
          </div>
        </div>

        {/* Quick-setup shortcuts (only when not configured) */}
        {!anyOtpProviderReady && (
          <div className="flex flex-wrap gap-2">
            <p className="w-full text-[10px] font-medium text-amber-700">Provider setup karo:</p>
            {[
              { tab: "sms" as IntTab, icon: "📱", label: "Setup SMS" },
              { tab: "whatsapp" as IntTab, icon: "💬", label: "Setup WhatsApp" },
              { tab: "email" as IntTab, icon: "📧", label: "Setup Email" },
            ].map(({ tab, icon, label }) => (
              <button
                key={tab}
                type="button"
                onClick={() => switchTab(tab)}
                className="rounded-lg bg-amber-200 px-3 py-1 text-[10px] font-bold text-amber-800 transition-colors hover:bg-amber-300"
              >
                {icon} {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sub-tab bar — horizontally scrollable on mobile */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="bg-muted/50 flex w-max min-w-full gap-1.5 rounded-xl p-1.5">
          {INT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={`focus-visible:ring-primary flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 ${intTab === t.id ? `${t.active} text-white shadow-sm` : `text-muted-foreground hover:bg-white`}`}
            >
              <span>{t.emoji}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <p className="text-muted-foreground px-1 text-xs">
        {INT_TABS.find((t) => t.id === intTab)?.desc}
      </p>

      {/* ─── Firebase FCM ─── */}
      {intTab === "firebase" && (
        <IntCard
          title="Firebase FCM"
          emoji="🔥"
          description="Real-time push notifications to mobile & web"
          enableKey="integration_push_notif"
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleToggle={handleToggle}
          configured={fcmConfigured}
        >
          <div className="space-y-5">
            <div className="flex gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">
              <span className="flex-shrink-0 text-lg">📋</span>
              <div>
                <strong>Setup:</strong> Go to{" "}
                <span className="rounded bg-white/70 px-1 font-mono">
                  console.firebase.google.com
                </span>{" "}
                → Project Settings → Cloud Messaging → Server Key. Also note your Project ID and
                Sender ID.
              </div>
            </div>
            <div>
              <SLabel icon={KeyRound}>Core Credentials</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {S({
                  label: "FCM Server Key / Legacy API Key",
                  k: "fcm_server_key",
                  placeholder: "AAAA...",
                })}
                {F({
                  label: "Firebase Project ID",
                  k: "fcm_project_id",
                  placeholder: "ajkmart-12345",
                  mono: true,
                })}
                {F({
                  label: "Sender ID",
                  k: "fcm_sender_id",
                  placeholder: "123456789012",
                  mono: true,
                })}
                {F({
                  label: "App ID",
                  k: "fcm_app_id",
                  placeholder: "1:123456789:web:abc123",
                  mono: true,
                })}
              </div>
            </div>
            <div>
              <SLabel icon={Globe}>Web Push (PWA)</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-4">
                {S({
                  label: "VAPID Web Push Key (for browser push)",
                  k: "fcm_vapid_key",
                  placeholder: "BPsc...",
                })}
              </div>
            </div>
            <div>
              <SLabel icon={Phone}>Notification Channels</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { k: "notif_new_order", label: "New Order Received", sub: "Vendor receives" },
                  {
                    k: "notif_order_ready",
                    label: "Order Ready for Pickup",
                    sub: "Rider receives",
                  },
                  { k: "notif_ride_request", label: "New Ride Request", sub: "Rider receives" },
                  {
                    k: "notif_promo",
                    label: "Promotional Notifications",
                    sub: "Customer receives",
                  },
                ].map(({ k, label, sub }) => (
                  <Toggle
                    key={k}
                    label={label}
                    sub={sub}
                    checked={tog(k, "on")}
                    onChange={(v) => handleToggle(k, v)}
                    isDirty={dirty(k)}
                  />
                ))}
              </div>
            </div>
            {fcmConfigured && (
              <div>
                <SLabel icon={FlaskConical}>Test Push Notification</SLabel>
                <div className="bg-muted/30 border-border/50 mt-3 flex flex-col items-start gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FlaskConical className="text-muted-foreground h-4 w-4 flex-shrink-0" />
                    <span className="text-foreground text-xs font-semibold">
                      Send test push to FCM device token
                    </span>
                    {testResults["fcm"] && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${testResults["fcm"]?.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                      >
                        {testResults["fcm"]?.ok ? "✓ PASSED" : "✗ FAILED"}
                      </span>
                    )}
                  </div>
                  <Input
                    value={fcmDeviceToken}
                    onChange={(e) => setFcmDeviceToken(e.target.value)}
                    placeholder="FCM device registration token"
                    className="h-7 w-52 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => runTest("fcm")}
                    disabled={!!testingMap["fcm"]}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 disabled:opacity-50"
                  >
                    {testingMap["fcm"] ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    {testingMap["fcm"] ? "Sending…" : "Send Test Push"}
                  </button>
                  {testResults["fcm"] && (
                    <p
                      className="text-muted-foreground w-full max-w-xs truncate text-[10px] sm:w-auto"
                      title={testResults["fcm"]?.msg}
                    >
                      {testResults["fcm"]?.msg}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </IntCard>
      )}

      {/* ─── SMS Gateway ─── */}
      {intTab === "sms" && (
        <div className="space-y-4">
          <ManageInSettingsLink
            label="SMS Gateway Configuration"
            value="Managed in SMS Gateways"
            description="Configure SMS provider (Twilio, MSG91, Zong), API keys, and sender IDs. The dedicated SMS Gateways page is the canonical location for all SMS settings."
            tone="info"
            to="/sms-gateways"
            linkLabel="Open SMS Gateways"
          />
        </div>
      )}

      {/* ─── Email SMTP ─── */}
      {intTab === "email" && (
        <IntCard
          title="Email (SMTP)"
          emoji="📧"
          description="Send admin alerts, receipts and reports via email"
          enableKey="integration_email"
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleToggle={handleToggle}
          configured={smtpConfigured}
        >
          <div className="space-y-5">
            <div className="flex gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <strong>Quick Setup:</strong> For Gmail, use{" "}
                <span className="rounded bg-white/70 px-1 font-mono">smtp.gmail.com</span>, port
                587, TLS mode, and an <em>App Password</em> (not your Gmail password).{" "}
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Create App Password →
                </a>
              </div>
            </div>
            <div>
              <SLabel icon={Globe}>SMTP Server</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  {F({
                    label: "SMTP Host",
                    k: "smtp_host",
                    placeholder: "smtp.gmail.com",
                    mono: true,
                  })}
                </div>
                {F({ label: "Port", k: "smtp_port", placeholder: "587", mono: true })}
              </div>
              {/* Encryption quick select */}
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <label className="text-foreground text-xs font-semibold">Encryption Mode</label>
                  {dirty("smtp_secure") && (
                    <Badge
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-[9px] font-bold text-amber-700"
                    >
                      CHANGED
                    </Badge>
                  )}
                </div>
                <div className="mt-1.5 flex gap-2">
                  {["tls", "ssl", "none"].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleChange("smtp_secure", mode)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${val("smtp_secure") === mode ? "border-teal-600 bg-teal-600 text-white" : "border-border hover:bg-muted/30"} ${dirty("smtp_secure") ? "ring-1 ring-amber-300" : ""}`}
                    >
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <SLabel icon={KeyRound}>Authentication</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {F({
                  label: "SMTP Username / Email",
                  k: "smtp_user",
                  placeholder: "alerts@ajkmart.pk",
                  mono: true,
                })}
                {S({
                  label: "Password / App Password",
                  k: "smtp_password",
                  placeholder: "xxxx xxxx xxxx xxxx",
                })}
              </div>
            </div>
            <div>
              <SLabel icon={MessageSquare}>Sender Identity</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {F({
                  label: "From Email Address",
                  k: "smtp_from_email",
                  placeholder: "noreply@ajkmart.pk",
                  mono: true,
                })}
                {F({ label: "From Display Name", k: "smtp_from_name", placeholder: "AJKMart" })}
                <div className="sm:col-span-2">
                  {F({
                    label: "Admin Alert Recipient Email",
                    k: "smtp_admin_alert_email",
                    placeholder: "admin@ajkmart.pk",
                    mono: true,
                    hint: "Where to send order alerts, low stock, fraud warnings etc.",
                  })}
                </div>
              </div>
            </div>
            {/* Alert topics */}
            <div>
              <SLabel icon={AlertTriangle}>Alert Events</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { k: "email_alert_new_vendor", label: "New Vendor Registration" },
                  { k: "email_alert_high_value_order", label: "High Value Order Alert" },
                  { k: "email_alert_fraud", label: "Fraud / Fake Order Alert" },
                  { k: "email_alert_low_balance", label: "Low Wallet Balance Warning" },
                  { k: "email_alert_daily_summary", label: "Daily Summary Report" },
                  { k: "email_alert_weekly_report", label: "Weekly Revenue Report" },
                ].map(({ k, label }) => (
                  <Toggle
                    key={k}
                    label={label}
                    checked={(localValues[k] ?? "on") === "on"}
                    onChange={(v) => handleToggle(k, v)}
                    isDirty={dirty(k)}
                  />
                ))}
              </div>
            </div>
            {smtpConfigured && (
              <div>
                <SLabel icon={FlaskConical}>Test Connection</SLabel>
                <div className="mt-3">
                  <TestRow type="email" label="Send test alert email to admin recipient" />
                </div>
              </div>
            )}
          </div>
        </IntCard>
      )}

      {/* ─── WhatsApp Business ─── */}
      {intTab === "whatsapp" && (
        <IntCard
          title="WhatsApp Business API"
          emoji="💬"
          description="Send order updates, OTP & promotions via WhatsApp"
          enableKey="integration_whatsapp"
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleToggle={handleToggle}
          configured={waConfigured}
        >
          <div className="space-y-5">
            <div className="flex gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <strong>Setup:</strong> Create a Meta Business account → WhatsApp Business API →
                Phone Numbers. Get your <em>Phone Number ID</em>, <em>Business Account ID</em> and a{" "}
                <em>Permanent Access Token</em> from{" "}
                <span className="rounded bg-white/70 px-1 font-mono">developers.facebook.com</span>.
              </div>
            </div>
            <div>
              <SLabel icon={KeyRound}>API Credentials</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {F({
                  label: "Phone Number ID",
                  k: "wa_phone_number_id",
                  placeholder: "123456789012345",
                  mono: true,
                })}
                {F({
                  label: "WhatsApp Business Account ID",
                  k: "wa_business_account_id",
                  placeholder: "987654321098765",
                  mono: true,
                })}
                <div className="sm:col-span-2">
                  {S({
                    label: "Permanent Access Token",
                    k: "wa_access_token",
                    placeholder: "EAAxxxxxxx...",
                  })}
                </div>
              </div>
            </div>
            <div>
              <SLabel icon={Globe}>Webhook Configuration</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-4">
                {S({
                  label: "Webhook Verify Token (set same in Meta Developer Console)",
                  k: "wa_verify_token",
                  placeholder: "my_secure_verify_token_123",
                })}
                <div className="bg-muted/50 border-border space-y-1 rounded-xl border p-3">
                  <p className="text-foreground text-xs font-semibold">
                    Webhook Callback URL (set in Meta console):
                  </p>
                  <p className="text-muted-foreground font-mono text-xs break-all">
                    {whatsappWebhookUrl}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Subscribe to:{" "}
                    <span className="font-mono">messages, message_deliveries, message_reads</span>
                  </p>
                </div>
                <ManageInSettingsLink
                  label="Business Event Webhooks"
                  value="Managed in Webhook Manager"
                  description="Configure outbound webhook endpoints for business events (order placed, rider assigned, payment confirmed). These are separate from the WhatsApp inbound webhook above."
                  tone="info"
                  to="/webhook-manager"
                  linkLabel="Open Webhook Manager"
                />
              </div>
            </div>
            <div>
              <SLabel icon={MessageSquare}>Message Templates</SLabel>
              <div className="mb-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  Template names must be approved by Meta before use. Use only approved template
                  names below.
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {F({
                  label: "Order Notification Template",
                  k: "wa_order_template",
                  placeholder: "order_notification",
                  mono: true,
                })}
                {F({
                  label: "OTP Verification Template",
                  k: "wa_otp_template",
                  placeholder: "otp_verification",
                  mono: true,
                })}
              </div>
            </div>
            {/* WA notification channels */}
            <div>
              <SLabel icon={ToggleRight}>Notification Channels</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    k: "wa_send_otp",
                    label: "OTP / Login Verification",
                    sub: "Customer receives",
                    def: "on",
                  },
                  {
                    k: "wa_send_order_update",
                    label: "Order Status Updates",
                    sub: "Customer receives",
                    def: "on",
                  },
                  {
                    k: "wa_send_ride_update",
                    label: "Ride Status Updates",
                    sub: "Customer receives",
                    def: "on",
                  },
                  {
                    k: "wa_send_promo",
                    label: "Promotional Messages",
                    sub: "Marketing opt-in required",
                    def: "off",
                  },
                  {
                    k: "wa_send_rider_notif",
                    label: "Rider Assignment Alerts",
                    sub: "Rider receives",
                    def: "on",
                  },
                  {
                    k: "wa_send_vendor_notif",
                    label: "New Order to Vendor",
                    sub: "Vendor receives",
                    def: "on",
                  },
                ].map(({ k, label, sub, def }) => (
                  <Toggle
                    key={k}
                    label={label}
                    sub={sub}
                    checked={tog(k, def)}
                    onChange={(v) => handleToggle(k, v)}
                    isDirty={dirty(k)}
                  />
                ))}
              </div>
            </div>
            {waConfigured && (
              <div>
                <SLabel icon={FlaskConical}>Test Connection</SLabel>
                <div className="mt-3">
                  <TestRow type="whatsapp" label="Send test OTP via WhatsApp (OTP: 123456)" />
                </div>
              </div>
            )}
          </div>
        </IntCard>
      )}

      {/* ─── Analytics ─── */}
      {intTab === "analytics" && (
        <IntCard
          title="Analytics & Tracking"
          emoji="📊"
          description="Track user behavior, orders and revenue"
          enableKey="integration_analytics"
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleToggle={handleToggle}
          configured={analyticsConfigured}
        >
          <div className="space-y-5">
            {/* Platform selector */}
            <div>
              <SLabel icon={BarChart3}>Analytics Platform</SLabel>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { id: "none", emoji: "🚫", label: "None", desc: "No analytics" },
                  { id: "google", emoji: "🔍", label: "Google Analytics", desc: "GA4 / gtag.js" },
                  { id: "mixpanel", emoji: "🧪", label: "Mixpanel", desc: "Event analytics" },
                  { id: "amplitude", emoji: "📈", label: "Amplitude", desc: "Product analytics" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleChange("analytics_platform", p.id)}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${analyticsPlatform === p.id ? "border-purple-500 bg-purple-50" : "border-border hover:bg-muted/30"} ${dirty("analytics_platform") ? "ring-1 ring-amber-300" : ""}`}
                  >
                    <div className="mb-1 text-xl">{p.emoji}</div>
                    <div className="text-xs font-bold">{p.label}</div>
                    <div className="text-muted-foreground text-[10px]">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            {analyticsPlatform !== "none" && (
              <div className="space-y-4">
                {analyticsPlatform === "google" && (
                  <div className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      Go to{" "}
                      <span className="rounded bg-white/70 px-1 font-mono">
                        analytics.google.com
                      </span>{" "}
                      → Admin → Data Streams → Measurement ID (G-XXXXXXXXXX) and API Secret.
                    </span>
                  </div>
                )}
                {analyticsPlatform === "mixpanel" && (
                  <div className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      Go to <span className="rounded bg-white/70 px-1 font-mono">mixpanel.com</span>{" "}
                      → Project Settings → Project Token.
                    </span>
                  </div>
                )}
                {analyticsPlatform === "amplitude" && (
                  <div className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      Go to{" "}
                      <span className="rounded bg-white/70 px-1 font-mono">amplitude.com</span> →
                      Settings → Projects → select your project → API Key.
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {F({
                    label:
                      analyticsPlatform === "google"
                        ? "Measurement ID (G-XXXXXXXXXX)"
                        : "Project Token / API Key",
                    k: "analytics_tracking_id",
                    placeholder: analyticsPlatform === "google" ? "G-XXXXXXXXXX" : "your_token",
                    mono: true,
                  })}
                  {S({
                    label:
                      analyticsPlatform === "google"
                        ? "API Secret (for server-side events)"
                        : "API Secret",
                    k: "analytics_api_secret",
                    placeholder: "your_api_secret",
                  })}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {T({
                    label: "Debug Mode (verbose logging)",
                    k: "analytics_debug_mode",
                    sub: "Disable in production",
                  })}
                </div>
              </div>
            )}
            {/* Tracked events */}
            <div>
              <SLabel icon={CheckCircle2}>Events to Track</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    k: "track_order_placed",
                    label: "Order Placed",
                    sub: "With value & category",
                    def: "on",
                  },
                  {
                    k: "track_ride_booked",
                    label: "Ride Booked",
                    sub: "With distance & fare",
                    def: "on",
                  },
                  {
                    k: "track_user_signup",
                    label: "User Signup",
                    sub: "Registration funnel",
                    def: "on",
                  },
                  {
                    k: "track_wallet_topup",
                    label: "Wallet Top-Up",
                    sub: "Payment amounts",
                    def: "on",
                  },
                  {
                    k: "track_screen_views",
                    label: "Screen Views",
                    sub: "Page hit tracking",
                    def: "on",
                  },
                  {
                    k: "track_search_queries",
                    label: "Search Queries",
                    sub: "What users search",
                    def: "off",
                  },
                ].map(({ k, label, sub, def }) => (
                  <Toggle
                    key={k}
                    label={label}
                    sub={sub}
                    checked={tog(k, def)}
                    onChange={(v) => handleToggle(k, v)}
                    isDirty={dirty(k)}
                  />
                ))}
              </div>
            </div>

            <ManageInSettingsLink
              label="Search Analytics"
              value="Managed in Search Analytics"
              description="View in-app search query reports, popular search terms, zero-result searches, and tune search ranking weights."
              tone="info"
              to="/search-analytics"
              linkLabel="Open Search Analytics"
            />
          </div>
        </IntCard>
      )}

      {/* ─── Sentry ─── */}
      {intTab === "sentry" && (
        <IntCard
          title="Sentry — Error Monitoring"
          emoji="🐛"
          description="Capture crashes, JS errors & API failures in real time"
          enableKey="integration_sentry"
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleToggle={handleToggle}
          configured={sentryConfigured}
        >
          <div className="space-y-5">
            <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <strong>Setup:</strong> Create a project at{" "}
                <span className="rounded bg-white/70 px-1 font-mono">sentry.io</span> → Settings →
                Client Keys → DSN. Copy the full DSN URL including project ID.
              </div>
            </div>
            <div>
              <SLabel icon={KeyRound}>Sentry DSN</SLabel>
              <div className="mt-3">
                {S({
                  label: "Sentry DSN URL",
                  k: "sentry_dsn",
                  placeholder: "https://examplePublicKey@o0.ingest.sentry.io/0",
                })}
              </div>
            </div>
            <div>
              <SLabel icon={Globe}>Environment & Sampling</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <div className="flex items-center gap-2">
                    <label className="text-foreground text-xs font-semibold">Environment</label>
                    {dirty("sentry_environment") && (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-[9px] font-bold text-amber-700"
                      >
                        CHANGED
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1.5 flex gap-2">
                    {["production", "staging", "development"].map((env) => (
                      <button
                        key={env}
                        type="button"
                        onClick={() => handleChange("sentry_environment", env)}
                        className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-all ${val("sentry_environment") === env ? "border-red-600 bg-red-600 text-white" : "border-border hover:bg-muted/30"} ${dirty("sentry_environment") ? "ring-1 ring-amber-300" : ""}`}
                      >
                        {env}
                      </button>
                    ))}
                  </div>
                </div>
                <Field
                  label="Error Sample Rate (%)"
                  value={val("sentry_sample_rate")}
                  onChange={(v) => handleChange("sentry_sample_rate", v)}
                  isDirty={dirty("sentry_sample_rate")}
                  type="number"
                  suffix="%"
                  placeholder="100"
                  hint="100 = capture all errors"
                />
                <Field
                  label="Performance Traces Rate (%)"
                  value={val("sentry_traces_sample_rate")}
                  onChange={(v) => handleChange("sentry_traces_sample_rate", v)}
                  isDirty={dirty("sentry_traces_sample_rate")}
                  type="number"
                  suffix="%"
                  placeholder="10"
                  hint="Keep low to avoid quota"
                />
              </div>
            </div>
            {/* Capture targets */}
            <div>
              <SLabel icon={Shield}>Capture Targets</SLabel>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    k: "sentry_capture_api",
                    label: "API Server Errors",
                    sub: "Express 5xx errors",
                    def: "on",
                  },
                  {
                    k: "sentry_capture_admin",
                    label: "Admin Panel Errors",
                    sub: "React frontend",
                    def: "on",
                  },
                  {
                    k: "sentry_capture_vendor",
                    label: "Vendor App Errors",
                    sub: "React frontend",
                    def: "off",
                  },
                  {
                    k: "sentry_capture_rider",
                    label: "Rider App Errors",
                    sub: "React frontend",
                    def: "off",
                  },
                  {
                    k: "sentry_capture_unhandled",
                    label: "Unhandled Rejections",
                    sub: "Promise failures",
                    def: "on",
                  },
                  {
                    k: "sentry_capture_perf",
                    label: "Performance Monitoring",
                    sub: "Slow API traces",
                    def: "on",
                  },
                ].map(({ k, label, sub, def }) => (
                  <Toggle
                    key={k}
                    label={label}
                    sub={sub}
                    checked={tog(k, def)}
                    onChange={(v) => handleToggle(k, v)}
                    isDirty={dirty(k)}
                  />
                ))}
              </div>
            </div>
          </div>
        </IntCard>
      )}

      {/* ─── Maps ─── */}
      {intTab === "maps" && (
        <IntCard
          title="Maps Management"
          emoji="🗺️"
          description="Multi-provider map configuration, routing engine, fare settings, usage analytics & geocoding cache"
          enableKey="integration_maps"
          localValues={localValues}
          dirtyKeys={dirtyKeys}
          handleToggle={handleToggle}
          configured={mapsConfigured}
        >
          <div className="space-y-5">
            <ErrorBoundary
              fallback={
                <div className="rounded-xl border border-red-200 bg-red-50 py-4 text-center text-sm text-red-500">
                  Maps configuration unavailable. Please refresh.
                </div>
              }
            >
              <MapsMgmtSection
                localValues={localValues}
                dirtyKeys={dirtyKeys}
                handleChange={handleChange}
                handleToggle={handleToggle}
              />
            </ErrorBoundary>
            {mapsEnabled && mapsConfigured && (
              <div>
                <SLabel icon={FlaskConical}>Test Geocoding</SLabel>
                <div className="bg-muted/30 border-border/50 mt-3 flex flex-col items-start gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FlaskConical className="text-muted-foreground h-4 w-4 flex-shrink-0" />
                    <span className="text-foreground text-xs font-semibold">
                      Geocode "Muzaffarabad, Azad Kashmir"
                    </span>
                    {testResults["maps"] && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${testResults["maps"]?.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                      >
                        {testResults["maps"]?.ok ? "✓ PASSED" : "✗ FAILED"}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => runTest("maps")}
                    disabled={!!testingMap["maps"]}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 disabled:opacity-50"
                  >
                    {testingMap["maps"] ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <MapPin className="h-3 w-3" />
                    )}
                    {testingMap["maps"] ? "Testing…" : "Test Geocoding"}
                  </button>
                  {testResults["maps"] && (
                    <p
                      className="text-muted-foreground w-full max-w-xs truncate text-[10px] sm:w-auto"
                      title={testResults["maps"]?.msg}
                    >
                      {testResults["maps"]?.msg}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </IntCard>
      )}
    </div>
  );
}
