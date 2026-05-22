import { Field, SecretInput, SLabel, Toggle } from "@/components/AdminShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { fetchAdminAbsolute } from "@/lib/adminFetcher";
import {
  AlertTriangle,
  Ban,
  Banknote,
  Bike,
  Building2,
  Calendar,
  Camera,
  Car,
  CheckCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Gem,
  Gift,
  KeyRound,
  Landmark,
  Loader2,
  Package,
  PartyPopper,
  Phone,
  Pill,
  Settings,
  Shield,
  ShoppingCart,
  Smartphone,
  Tag,
  ToggleRight,
  UtensilsCrossed,
  Wallet,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";
import { useState, type ElementType } from "react";

type LucideIcon = ElementType;

type PayTab = "jazzcash" | "easypaisa" | "bank" | "cod" | "wallet" | "rules";

const PAY_TABS: { id: PayTab; label: string; Icon: LucideIcon; color: string; activeBg: string }[] =
  [
    {
      id: "jazzcash",
      label: "JazzCash",
      Icon: Smartphone,
      color: "text-red-600",
      activeBg: "bg-red-500",
    },
    {
      id: "easypaisa",
      label: "EasyPaisa",
      Icon: Smartphone,
      color: "text-green-600",
      activeBg: "bg-green-600",
    },
    {
      id: "bank",
      label: "Bank Transfer",
      Icon: Landmark,
      color: "text-blue-600",
      activeBg: "bg-blue-600",
    },
    {
      id: "cod",
      label: "Cash on Delivery",
      Icon: Banknote,
      color: "text-amber-600",
      activeBg: "bg-amber-600",
    },
    {
      id: "wallet",
      label: "AJK Wallet",
      Icon: Wallet,
      color: "text-purple-600",
      activeBg: "bg-purple-600",
    },
    {
      id: "rules",
      label: "Payment Rules",
      Icon: Settings,
      color: "text-gray-600",
      activeBg: "bg-gray-700",
    },
  ];

const SERVICE_ICONS = {
  mart: ShoppingCart,
  food: UtensilsCrossed,
  pharmacy: Pill,
  parcel: Package,
  rides: Car,
} satisfies Record<string, LucideIcon>;
function getServiceIcon(key: string): LucideIcon {
  if (key.includes("mart")) return SERVICE_ICONS.mart;
  if (key.includes("food")) return SERVICE_ICONS.food;
  if (key.includes("pharmacy")) return SERVICE_ICONS.pharmacy;
  if (key.includes("parcel")) return SERVICE_ICONS.parcel;
  if (key.includes("rides")) return SERVICE_ICONS.rides;
  if (key.includes("orders")) return ShoppingCart;
  return Package;
}

/* ─── JazzCash & EasyPaisa unified gateway card ─────────────────────────── */
function GatewayCard({
  prefix,
  name,
  Logo,
  accentColor,
  accentBg,
  accentBorder,
  accentBtn,
  localValues,
  dirtyKeys,
  handleChange,
  handleToggle,
}: {
  prefix: "jazzcash" | "easypaisa";
  name: string;
  Logo: LucideIcon;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  accentBtn: string;
  localValues: Record<string, string>;
  dirtyKeys: Set<string>;
  handleChange: (k: string, v: string) => void;
  handleToggle: (k: string, v: boolean) => void;
}) {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const enabled = (localValues[`${prefix}_enabled`] ?? "off") === "on";
  const modeType = localValues[`${prefix}_type`] ?? "manual";
  const apiEnv = localValues[`${prefix}_mode`] ?? "sandbox";
  const proofReq = (localValues[`${prefix}_proof_required`] ?? "on") === "on";

  const v = (k: string) => localValues[`${prefix}_${k}`] ?? "";
  const d = (k: string) => dirtyKeys.has(`${prefix}_${k}`);
  const set = (k: string) => (val: string) => handleChange(`${prefix}_${k}`, val);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Backend uses sendSuccess(res, { ok, message }) → envelope
      // `{ success, data: { ok, message } }`. `fetchAdminAbsolute`
      // does NOT unwrap, so read the inner payload first; fall back
      // if a future route returns the bare object directly.
      interface PaymentTestPayload {
        ok?: boolean;
        message?: string;
      }
      interface PaymentTestEnvelope {
        data?: PaymentTestPayload;
        message?: string;
        ok?: boolean;
      }
      const raw = (await fetchAdminAbsolute(
        `/api/payments/test-connection/${prefix}`
      )) as unknown as PaymentTestEnvelope;
      const payload: PaymentTestPayload = raw?.data ?? raw;
      const ok = payload?.ok === true;
      const message =
        payload?.message || raw?.message || (ok ? "Connection succeeded" : "Connection failed");
      setTestResult({ ok, message });
      toast({
        title: ok ? `${name} connected` : `${name} failed`,
        description: message,
        variant: ok ? "default" : "destructive",
      });
    } catch (err: unknown) {
      // Surface real error info instead of swallowing every failure as the same generic line.
      let detail =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
      // Common cases: HTTP error codes embedded in fetchAdminAbsolute error message
      if (/401|403/.test(detail)) detail = "Unauthorized — please re-login as admin";
      else if (/404/.test(detail))
        detail = "Endpoint not found — check that the API server is up to date";
      else if (/500|502|503/.test(detail)) detail = `Server error: ${detail}`;
      else if (/network|fetch/i.test(detail)) detail = "Network error — could not reach API server";
      setTestResult({ ok: false, message: detail });
      toast({ title: `${name} Test Failed`, description: detail, variant: "destructive" });
    }
    setTesting(false);
  };

  const shortDesc =
    prefix === "jazzcash"
      ? "Jazz/Warid mobile wallet · Pakistan's leading digital wallet"
      : "Telenor Microfinance · mobile wallet for Telenor subscribers";

  return (
    <div className={`rounded-2xl border-2 ${accentBorder} overflow-hidden bg-white shadow-sm`}>
      {/* ── Header ── */}
      <div className={`${accentBg} flex items-center justify-between gap-3 px-5 py-4`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex-shrink-0 ${accentColor}`}>
            <Logo className="h-9 w-9" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`text-base font-bold ${accentColor}`}>{name}</h3>
              <Badge
                variant="outline"
                className={`flex-shrink-0 border text-[10px] font-bold ${
                  !enabled
                    ? "bg-muted text-muted-foreground border-border"
                    : modeType === "api"
                      ? apiEnv === "live"
                        ? "border-green-300 bg-green-50 text-green-700"
                        : "border-yellow-300 bg-yellow-50 text-yellow-700"
                      : "border-blue-300 bg-blue-50 text-blue-700"
                }`}
              >
                {!enabled
                  ? "Off"
                  : modeType === "api"
                    ? apiEnv === "live"
                      ? "API Live"
                      : "API Sandbox"
                    : "Manual Top-up"}
              </Badge>
              {enabled && modeType === "manual" && (
                <Badge
                  variant="outline"
                  className="flex-shrink-0 border border-amber-300 bg-amber-50 text-[10px] font-bold text-amber-700"
                >
                  ⏳ Admin Approval Required
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">{shortDesc}</p>
          </div>
        </div>
        <div
          onClick={() => handleToggle(`${prefix}_enabled`, !enabled)}
          className={`flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition-all select-none ${enabled ? "border-green-300 bg-green-50" : "border-border bg-white/70"}`}
        >
          <div
            className={`relative h-5 w-10 rounded-full transition-colors ${enabled ? "bg-green-500" : "bg-gray-300"}`}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </div>
          <span
            className={`text-xs font-bold ${enabled ? "text-green-700" : "text-muted-foreground"}`}
          >
            {enabled
              ? modeType === "manual"
                ? "Allow Manual Top-up"
                : "Gateway Enabled"
              : "Disabled"}
          </span>
        </div>
      </div>
      {/* Manual approval clarification note */}
      {modeType === "manual" && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <span>
            <strong>Manual approval only.</strong> Customers enter a Transaction ID — no automated
            payment processing occurs. Each request must be reviewed and approved by an admin before
            funds are credited.
          </span>
        </div>
      )}

      {/* Test result banner */}
      {testResult && (
        <div
          className={`flex items-center gap-2 border-b px-5 py-2.5 text-sm ${testResult.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {testResult.message}
        </div>
      )}

      <div className="space-y-5 p-5">
        {/* ── Mode selector ── */}
        <div>
          <SLabel icon={Settings}>Integration Mode</SLabel>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleChange(`${prefix}_type`, "manual")}
              className={`relative rounded-xl border-2 px-4 py-3 text-left transition-all ${modeType === "manual" ? "border-blue-700 bg-blue-600 text-white shadow-md" : "border-border text-foreground bg-white hover:border-blue-300 hover:bg-blue-50/30"}`}
            >
              <p className="inline-flex items-center gap-1.5 text-xs leading-tight font-bold">
                <Smartphone className="h-3.5 w-3.5" /> Manual Transfer
              </p>
              <p
                className={`mt-0.5 text-[10px] ${modeType === "manual" ? "text-blue-100" : "text-muted-foreground"}`}
              >
                Customer sends to your account
              </p>
              {modeType === "manual" && (
                <CheckCircle2 className="absolute top-2.5 right-2.5 h-3.5 w-3.5 text-blue-200" />
              )}
            </button>
            <button
              onClick={() => handleChange(`${prefix}_type`, "api")}
              className={`relative rounded-xl border-2 px-4 py-3 text-left transition-all ${modeType === "api" ? `${accentBtn} border-transparent text-white shadow-md` : "border-border text-foreground hover:border-primary/40 hover:bg-primary/5 bg-white"}`}
            >
              <p className="inline-flex items-center gap-1.5 text-xs leading-tight font-bold">
                <Zap className="h-3.5 w-3.5" /> API Integration
              </p>
              <p
                className={`mt-0.5 text-[10px] ${modeType === "api" ? "text-white/70" : "text-muted-foreground"}`}
              >
                Direct from {name} portal
              </p>
              {modeType === "api" && (
                <CheckCircle2 className="absolute top-2.5 right-2.5 h-3.5 w-3.5 text-white/60" />
              )}
            </button>
          </div>
        </div>

        {/* ── MANUAL MODE ── */}
        {modeType === "manual" && (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <ClipboardList className="h-5 w-5 flex-shrink-0 text-blue-700" />
              <div>
                <p className="text-xs font-semibold text-blue-800">Manual transfer mode active</p>
                <p className="mt-0.5 text-xs text-blue-700">
                  The customer sends payment directly to your {name} number. Your name and number
                  are shown in the app, and an admin verifies each payment manually.
                </p>
              </div>
            </div>

            {/* Account details */}
            <div>
              <SLabel icon={Phone}>Your {name} Account</SLabel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Account Holder Name"
                  value={v("manual_name")}
                  onChange={set("manual_name")}
                  placeholder="e.g. Muhammad Ali Khan"
                  isDirty={d("manual_name")}
                  hint="This name is shown to the customer"
                />
                <Field
                  label={`${name} Number`}
                  value={v("manual_number")}
                  onChange={set("manual_number")}
                  placeholder="03XX-XXXXXXX"
                  isDirty={d("manual_number")}
                  hint="Customer sends payment to this number"
                  mono
                />
              </div>
            </div>

            {/* Proof required */}
            <div
              onClick={() => handleToggle(`${prefix}_proof_required`, !proofReq)}
              className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-all select-none ${proofReq ? "border-orange-200 bg-orange-50" : "border-border hover:bg-muted/30 bg-white"} ${d("proof_required") ? "ring-2 ring-amber-300" : ""}`}
            >
              <div className="min-w-0">
                <p className="text-foreground inline-flex items-center gap-1.5 text-sm font-semibold">
                  <Camera className="h-4 w-4" /> Payment Screenshot Required
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  The customer must submit a payment screenshot or transaction ID
                </p>
                <p
                  className={`mt-0.5 text-xs font-bold ${proofReq ? "text-orange-600" : "text-muted-foreground"}`}
                >
                  {proofReq ? "Required" : "Optional"}
                </p>
              </div>
              <div
                className={`relative ml-3 h-6 w-11 flex-shrink-0 rounded-full transition-colors ${proofReq ? "bg-orange-500" : "bg-gray-300"}`}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${proofReq ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="text-foreground text-xs font-semibold">
                  Customer Instructions
                </label>
                {d("manual_instructions") && (
                  <Badge
                    variant="outline"
                    className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                  >
                    CHANGED
                  </Badge>
                )}
              </div>
              <textarea
                value={localValues[`${prefix}_manual_instructions`] ?? ""}
                onChange={(e) => handleChange(`${prefix}_manual_instructions`, e.target.value)}
                rows={3}
                placeholder="What the customer should do..."
                className={`focus:ring-primary/30 w-full resize-none rounded-lg border p-3 text-sm focus:ring-2 focus:outline-none ${d("manual_instructions") ? "border-amber-300 bg-amber-50/50" : "border-border"}`}
              />
              <p className="text-muted-foreground text-[11px]">
                Shown to the customer after they select this payment method
              </p>
            </div>

            {/* Payment limits */}
            <div>
              <SLabel>Payment Limits</SLabel>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Minimum (Rs.)"
                  value={v("min_amount")}
                  onChange={set("min_amount")}
                  placeholder="100"
                  isDirty={d("min_amount")}
                  type="number"
                  hint="Minimum payment via this method"
                />
                <Field
                  label="Maximum (Rs.)"
                  value={v("max_amount")}
                  onChange={set("max_amount")}
                  placeholder="50000"
                  isDirty={d("max_amount")}
                  type="number"
                  hint="Maximum payment allowed"
                />
              </div>
            </div>

            {/* Customer preview */}
            <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/30 p-4">
              <p className="mb-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700">
                <Eye className="h-3.5 w-3.5" /> Customer App Preview
              </p>
              <div className="mx-auto max-w-sm rounded-xl border border-blue-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className={accentColor}>
                    <Logo className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-foreground text-xs font-bold">{name} — Manual Transfer</p>
                    <p className="text-muted-foreground text-[10px]">Manual money transfer</p>
                  </div>
                </div>
                {v("manual_name") || v("manual_number") ? (
                  <div className="bg-muted/40 space-y-1 rounded-lg p-2.5">
                    {v("manual_name") && (
                      <p className="text-[11px]">
                        <span className="font-semibold">Name:</span> {v("manual_name")}
                      </p>
                    )}
                    {v("manual_number") && (
                      <p className="font-mono text-[11px]">
                        <span className="font-sans font-semibold">Number:</span>{" "}
                        {v("manual_number")}
                      </p>
                    )}
                    {proofReq && (
                      <p className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-600">
                        <Camera className="h-3 w-3" /> Screenshot required
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-[10px] italic">
                    Set account details — they will appear here for the customer
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── API MODE ── */}
        {modeType === "api" && (
          <div className="space-y-4">
            {/* API Environment */}
            <div>
              <SLabel>API Environment</SLabel>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    id: "sandbox",
                    label: "Sandbox",
                    sub: "Test mode — no real money charged",
                    cls: "bg-yellow-100 text-yellow-800 border-yellow-300",
                  },
                  {
                    id: "live",
                    label: "Live",
                    sub: "Production — real transactions",
                    cls: "bg-green-500 text-white border-green-600",
                  },
                ].map((env) => (
                  <button
                    key={env.id}
                    onClick={() => handleChange(`${prefix}_mode`, env.id)}
                    className={`rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                      apiEnv === env.id
                        ? env.cls + " shadow-sm"
                        : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    <p className="text-xs font-bold">{env.label}</p>
                    <p
                      className={`mt-0.5 text-[10px] ${apiEnv === env.id && env.id === "live" ? "text-green-100" : "text-muted-foreground"}`}
                    >
                      {env.sub}
                    </p>
                  </button>
                ))}
              </div>
              {apiEnv === "live" && (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    <strong>Live Mode:</strong> Real charges apply. Double-check all credentials
                    before going live.
                  </span>
                </div>
              )}
            </div>

            {/* Credentials */}
            <div>
              <SLabel icon={KeyRound}>
                API Credentials ({apiEnv === "sandbox" ? "Sandbox" : "Production"})
              </SLabel>
              {prefix === "jazzcash" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="Merchant ID"
                    value={v("merchant_id")}
                    onChange={set("merchant_id")}
                    placeholder="MC12345"
                    isDirty={d("merchant_id")}
                    mono
                  />
                  <SecretInput
                    label="Password"
                    value={v("password")}
                    onChange={set("password")}
                    placeholder="••••••••"
                    isDirty={d("password")}
                  />
                  <SecretInput
                    label="Integrity Salt (Hash Key)"
                    value={v("salt")}
                    onChange={set("salt")}
                    placeholder="Your JazzCash salt"
                    isDirty={d("salt")}
                  />
                  <Field
                    label="Currency"
                    value={v("currency")}
                    onChange={set("currency")}
                    placeholder="PKR"
                    isDirty={d("currency")}
                  />
                  <div className="sm:col-span-2">
                    <Field
                      label="Return / Callback URL"
                      value={v("return_url")}
                      onChange={set("return_url")}
                      placeholder="https://yourdomain.com/api/payments/callback/jazzcash"
                      isDirty={d("return_url")}
                      hint="Enter this URL in the JazzCash portal"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="Store ID"
                    value={v("store_id")}
                    onChange={set("store_id")}
                    placeholder="12345"
                    isDirty={d("store_id")}
                    mono
                  />
                  <Field
                    label="Merchant Account No."
                    value={v("merchant_id")}
                    onChange={set("merchant_id")}
                    placeholder="03XX-XXXXXXX"
                    isDirty={d("merchant_id")}
                  />
                  <SecretInput
                    label="Hash Key (Secret)"
                    value={v("hash_key")}
                    onChange={set("hash_key")}
                    placeholder="••••••••"
                    isDirty={d("hash_key")}
                  />
                  <Field
                    label="API Username"
                    value={v("username")}
                    onChange={set("username")}
                    placeholder="easypaisa_api_user"
                    isDirty={d("username")}
                    mono
                  />
                  <SecretInput
                    label="API Password"
                    value={v("password")}
                    onChange={set("password")}
                    placeholder="••••••••"
                    isDirty={d("password")}
                  />
                </div>
              )}
            </div>

            {/* Payment limits */}
            <div>
              <SLabel>Payment Limits</SLabel>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Minimum (Rs.)"
                  value={v("min_amount")}
                  onChange={set("min_amount")}
                  placeholder="100"
                  isDirty={d("min_amount")}
                  type="number"
                />
                <Field
                  label="Maximum (Rs.)"
                  value={v("max_amount")}
                  onChange={set("max_amount")}
                  placeholder="50000"
                  isDirty={d("max_amount")}
                  type="number"
                />
              </div>
            </div>

            {/* Test connection */}
            <div className="border-border/40 flex items-center justify-between border-t pt-2">
              <a
                href={
                  prefix === "jazzcash"
                    ? "https://sandbox.jazzcash.com.pk/sandbox/documentation"
                    : "https://easypaystg.easypaisa.com.pk/easypay-service/rest/documentation"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {name} Developer Docs
              </a>
              <Button
                size="sm"
                variant="outline"
                onClick={handleTest}
                disabled={testing}
                className="h-8 gap-1.5 rounded-lg text-xs"
              >
                {testing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wifi className="h-3 w-3" />
                )}
                {testing ? "Testing..." : "Test Connection"}
              </Button>
            </div>
          </div>
        )}

        {/* Service availability */}
        <div>
          <SLabel>Available In Which Services</SLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              {
                key: `${prefix}_allowed_mart`,
                label: "Mart / Grocery",
                on: (localValues[`${prefix}_allowed_mart`] ?? "on") === "on",
              },
              {
                key: `${prefix}_allowed_food`,
                label: "Food Delivery",
                on: (localValues[`${prefix}_allowed_food`] ?? "on") === "on",
              },
              {
                key: `${prefix}_allowed_pharmacy`,
                label: "Pharmacy",
                on: (localValues[`${prefix}_allowed_pharmacy`] ?? "on") === "on",
              },
              {
                key: `${prefix}_allowed_parcel`,
                label: "Parcel Delivery",
                on: (localValues[`${prefix}_allowed_parcel`] ?? "on") === "on",
              },
              {
                key: `${prefix}_allowed_rides`,
                label: "Rides",
                on: (localValues[`${prefix}_allowed_rides`] ?? "on") === "on",
              },
            ].map((s) => {
              const Icon = getServiceIcon(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => handleToggle(s.key, !s.on)}
                  className={`relative rounded-xl border-2 px-3 py-3 text-left transition-all ${
                    s.on
                      ? "border-green-400 bg-green-50 shadow-sm"
                      : "bg-muted/20 border-border/60 opacity-70 hover:opacity-100"
                  } ${dirtyKeys.has(s.key) ? "ring-2 ring-amber-300" : ""}`}
                >
                  <Icon
                    className={`mb-1 h-6 w-6 ${s.on ? "text-green-700" : "text-muted-foreground"}`}
                  />
                  <p className="text-foreground text-[11px] leading-tight font-bold">{s.label}</p>
                  <p
                    className={`mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold ${s.on ? "text-green-600" : "text-muted-foreground"}`}
                  >
                    {s.on ? (
                      <>
                        <CheckCircle className="h-2.5 w-2.5" /> On
                      </>
                    ) : (
                      <>
                        <XCircle className="h-2.5 w-2.5" /> Off
                      </>
                    )}
                  </p>
                  <div
                    className={`absolute top-2 right-2 h-2.5 w-2.5 rounded-full ${s.on ? "bg-green-500" : "bg-gray-300"}`}
                  />
                </button>
              );
            })}
          </div>
          <p className="text-muted-foreground mt-1.5 text-[11px]">
            Tap a service card to disable {name} for that service
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Bank Transfer Section ──────────────────────────────────────────────── */
function BankSection({
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
  const enabled = (localValues["bank_enabled"] ?? "off") === "on";
  const proofReq = (localValues["bank_proof_required"] ?? "on") === "on";
  const v = (k: string) => localValues[k] ?? "";
  const d = (k: string) => dirtyKeys.has(k);

  const BANKS = [
    "HBL",
    "UBL",
    "MCB",
    "ABL",
    "NBP",
    "Meezan Bank",
    "Bank Alfalah",
    "Faysal Bank",
    "Habib Metro",
    "Summit Bank",
    "Other",
  ];

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-blue-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 bg-blue-50 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Landmark className="h-9 w-9 flex-shrink-0 text-blue-700" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-blue-700">Bank Transfer</h3>
              <Badge
                variant="outline"
                className={`flex-shrink-0 border text-[10px] font-bold ${enabled ? "border-blue-300 bg-blue-50 text-blue-700" : "bg-muted text-muted-foreground border-border"}`}
              >
                {enabled ? "Active" : "Disabled"}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Direct bank account transfer · best for large orders
            </p>
          </div>
        </div>
        <div
          onClick={() => handleToggle("bank_enabled", !enabled)}
          className={`flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition-all select-none ${enabled ? "border-blue-300 bg-blue-50" : "border-border bg-white/70"}`}
        >
          <div
            className={`relative h-5 w-10 rounded-full transition-colors ${enabled ? "bg-blue-500" : "bg-gray-300"}`}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </div>
          <span
            className={`text-xs font-bold ${enabled ? "text-blue-700" : "text-muted-foreground"}`}
          >
            {enabled ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <Landmark className="h-5 w-5 flex-shrink-0 text-blue-700" />
          <p className="text-xs text-blue-800">
            The customer transfers funds directly to your bank account. You verify the deposit slip
            and confirm the order. Best option for large transactions.
          </p>
        </div>

        {/* Bank name select */}
        <div>
          <SLabel icon={Building2}>Choose Bank</SLabel>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {BANKS.map((b) => (
              <button
                key={b}
                onClick={() => handleChange("bank_name", b)}
                className={`truncate rounded-xl border px-2 py-2 text-xs font-semibold transition-all ${
                  v("bank_name") === b
                    ? "border-blue-700 bg-blue-600 text-white shadow-sm"
                    : "bg-muted/30 border-border text-foreground hover:bg-muted/60"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
          {v("bank_name") === "Other" && (
            <Input
              value={v("bank_name")}
              onChange={(e) => handleChange("bank_name", e.target.value)}
              placeholder="Enter bank name"
              className={`mt-2 h-9 rounded-lg text-sm ${d("bank_name") ? "border-amber-300 bg-amber-50/50" : ""}`}
            />
          )}
        </div>

        {/* Account details */}
        <div>
          <SLabel icon={Banknote}>Account Details</SLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Account Title / Holder Name"
              value={v("bank_account_title")}
              onChange={(v2) => handleChange("bank_account_title", v2)}
              placeholder="e.g. Muhammad Ali Khan"
              isDirty={d("bank_account_title")}
              hint="Spelling must match the bank account exactly"
            />
            <Field
              label="Account Number"
              value={v("bank_account_number")}
              onChange={(v2) => handleChange("bank_account_number", v2)}
              placeholder="0123-4567890-01"
              isDirty={d("bank_account_number")}
              mono
            />
            <div className="sm:col-span-2">
              <Field
                label="IBAN (International Bank Account Number)"
                value={v("bank_iban")}
                onChange={(v2) => handleChange("bank_iban", v2)}
                placeholder="PK00XXXX0000000000000000"
                isDirty={d("bank_iban")}
                mono
                hint="24 characters — starts with PK"
              />
            </div>
            <Field
              label="Branch Code"
              value={v("bank_branch_code")}
              onChange={(v2) => handleChange("bank_branch_code", v2)}
              placeholder="0001"
              isDirty={d("bank_branch_code")}
              mono
              hint="4-digit branch code"
            />
            <Field
              label="SWIFT / BIC Code"
              value={v("bank_swift_code")}
              onChange={(v2) => handleChange("bank_swift_code", v2)}
              placeholder="HABBPKKA"
              isDirty={d("bank_swift_code")}
              mono
              hint="For international wire transfers"
            />
          </div>
        </div>

        {/* Settings */}
        <div>
          <SLabel>Transfer Settings</SLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Minimum Bank Transfer (Rs.)"
              value={v("bank_min_amount")}
              onChange={(v2) => handleChange("bank_min_amount", v2)}
              placeholder="500"
              isDirty={d("bank_min_amount")}
              type="number"
              hint="Orders below this amount cannot use bank transfer"
            />
            <Field
              label="Processing Time (hours)"
              value={v("bank_processing_hours")}
              onChange={(v2) => handleChange("bank_processing_hours", v2)}
              placeholder="24"
              isDirty={d("bank_processing_hours")}
              type="number"
              hint="Time to verify a payment"
              suffix="hrs"
            />
          </div>
        </div>

        {/* Proof required toggle */}
        <div
          onClick={() => handleToggle("bank_proof_required", !proofReq)}
          className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-all select-none ${proofReq ? "border-orange-200 bg-orange-50" : "border-border hover:bg-muted/30 bg-white"} ${d("bank_proof_required") ? "ring-2 ring-amber-300" : ""}`}
        >
          <div className="min-w-0">
            <p className="text-foreground inline-flex items-center gap-1.5 text-sm font-semibold">
              <FileText className="h-4 w-4" /> Bank Slip / Screenshot Required
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              The customer must submit a payment screenshot or transaction reference
            </p>
            <p
              className={`mt-0.5 text-xs font-bold ${proofReq ? "text-orange-600" : "text-muted-foreground"}`}
            >
              {proofReq ? "Required" : "Optional"}
            </p>
          </div>
          <div
            className={`relative ml-3 h-6 w-11 flex-shrink-0 rounded-full transition-colors ${proofReq ? "bg-orange-500" : "bg-gray-300"}`}
          >
            <div
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${proofReq ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-foreground text-xs font-semibold">Customer Instructions</label>
            {d("bank_instructions") && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
              >
                CHANGED
              </Badge>
            )}
          </div>
          <textarea
            value={v("bank_instructions")}
            onChange={(e) => handleChange("bank_instructions", e.target.value)}
            rows={3}
            placeholder="What the customer should do — steps after the transfer..."
            className={`focus:ring-primary/30 w-full resize-none rounded-lg border p-3 text-sm focus:ring-2 focus:outline-none ${d("bank_instructions") ? "border-amber-300 bg-amber-50/50" : "border-border"}`}
          />
          <p className="text-muted-foreground text-[11px]">
            Shown to the customer after they select bank transfer
          </p>
        </div>

        {/* Service availability */}
        <div>
          <SLabel>Available In Which Services</SLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              {
                key: "bank_allowed_mart",
                label: "Mart / Grocery",
                on: (v("bank_allowed_mart") || "on") === "on",
              },
              {
                key: "bank_allowed_food",
                label: "Food Delivery",
                on: (v("bank_allowed_food") || "on") === "on",
              },
              {
                key: "bank_allowed_pharmacy",
                label: "Pharmacy",
                on: (v("bank_allowed_pharmacy") || "on") === "on",
              },
              {
                key: "bank_allowed_parcel",
                label: "Parcel Delivery",
                on: (v("bank_allowed_parcel") || "on") === "on",
              },
              {
                key: "bank_allowed_rides",
                label: "Rides",
                on: (v("bank_allowed_rides") || "on") === "on",
              },
            ].map((s) => {
              const Icon = getServiceIcon(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => handleToggle(s.key, !s.on)}
                  className={`relative rounded-xl border-2 px-3 py-3 text-left transition-all ${
                    s.on
                      ? "border-green-400 bg-green-50 shadow-sm"
                      : "bg-muted/20 border-border/60 opacity-70 hover:opacity-100"
                  } ${dirtyKeys.has(s.key) ? "ring-2 ring-amber-300" : ""}`}
                >
                  <Icon
                    className={`mb-1 h-6 w-6 ${s.on ? "text-green-700" : "text-muted-foreground"}`}
                  />
                  <p className="text-foreground text-[11px] leading-tight font-bold">{s.label}</p>
                  <p
                    className={`mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold ${s.on ? "text-green-600" : "text-muted-foreground"}`}
                  >
                    {s.on ? (
                      <>
                        <CheckCircle className="h-2.5 w-2.5" /> On
                      </>
                    ) : (
                      <>
                        <XCircle className="h-2.5 w-2.5" /> Off
                      </>
                    )}
                  </p>
                  <div
                    className={`absolute top-2 right-2 h-2.5 w-2.5 rounded-full ${s.on ? "bg-green-500" : "bg-gray-300"}`}
                  />
                </button>
              );
            })}
          </div>
          <p className="text-muted-foreground mt-1.5 text-[11px]">
            Tap a service card to disable Bank Transfer for that service
          </p>
        </div>

        {/* Preview */}
        {(v("bank_account_title") || v("bank_account_number") || v("bank_iban")) && (
          <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/30 p-4">
            <p className="mb-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700">
              <Eye className="h-3.5 w-3.5" /> Customer App Preview
            </p>
            <div className="mx-auto max-w-sm space-y-1.5 rounded-xl border border-blue-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <Landmark className="h-5 w-5 text-blue-700" />
                <p className="text-xs font-bold">{v("bank_name") || "Bank Transfer"}</p>
              </div>
              {v("bank_account_title") && (
                <p className="text-[11px]">
                  <span className="font-semibold">Account:</span> {v("bank_account_title")}
                </p>
              )}
              {v("bank_account_number") && (
                <p className="font-mono text-[11px]">
                  <span className="font-sans font-semibold">No.:</span> {v("bank_account_number")}
                </p>
              )}
              {v("bank_iban") && (
                <p className="font-mono text-[11px]">
                  <span className="font-sans font-semibold">IBAN:</span> {v("bank_iban")}
                </p>
              )}
              {proofReq && (
                <p className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-600">
                  <FileText className="h-3 w-3" /> Slip screenshot required
                </p>
              )}
              {v("bank_processing_hours") && (
                <p className="text-muted-foreground inline-flex items-center gap-1 text-[10px]">
                  <Clock className="h-3 w-3" /> Confirms within {v("bank_processing_hours")} hours
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── COD Section ────────────────────────────────────────────────────────── */
function CODSection({
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
  const enabled = (localValues["cod_enabled"] ?? "on") === "on";
  const fakePenalty = (localValues["cod_fake_penalty"] ?? "on") === "on";
  const martOn = (localValues["cod_allowed_mart"] ?? "on") === "on";
  const foodOn = (localValues["cod_allowed_food"] ?? "on") === "on";
  const pharmacyOn = (localValues["cod_allowed_pharmacy"] ?? "on") === "on";
  const parcelOn = (localValues["cod_allowed_parcel"] ?? "off") === "on";
  const ridesOn = (localValues["cod_allowed_rides"] ?? "on") === "on";
  const v = (k: string) => localValues[k] ?? "";
  const d = (k: string) => dirtyKeys.has(k);

  const services = [
    { key: "cod_allowed_mart", label: "Mart / Grocery", on: martOn },
    { key: "cod_allowed_food", label: "Food Delivery", on: foodOn },
    { key: "cod_allowed_pharmacy", label: "Pharmacy", on: pharmacyOn },
    { key: "cod_allowed_parcel", label: "Parcel Delivery", on: parcelOn },
    { key: "cod_allowed_rides", label: "Rides", on: ridesOn },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-amber-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 bg-amber-50 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Banknote className="h-9 w-9 flex-shrink-0 text-amber-700" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-amber-700">Cash on Delivery (COD)</h3>
              <Badge
                variant="outline"
                className={`flex-shrink-0 border text-[10px] font-bold ${enabled ? "border-green-300 bg-green-50 text-green-700" : "bg-muted text-muted-foreground border-border"}`}
              >
                {enabled ? "Active" : "Disabled"}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">Rider collects cash on delivery</p>
          </div>
        </div>
        <div
          onClick={() => handleToggle("cod_enabled", !enabled)}
          className={`flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition-all select-none ${enabled ? "border-green-300 bg-green-50" : "border-border bg-white/70"}`}
        >
          <div
            className={`relative h-5 w-10 rounded-full transition-colors ${enabled ? "bg-green-500" : "bg-gray-300"}`}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </div>
          <span
            className={`text-xs font-bold ${enabled ? "text-green-700" : "text-muted-foreground"}`}
          >
            {enabled ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Max Order", value: `Rs. ${v("cod_max_amount") || "5000"}`, Icon: Package },
            {
              label: "COD Fee",
              value: !v("cod_fee") || v("cod_fee") === "0" ? "Free" : `Rs. ${v("cod_fee")}`,
              Icon: Tag,
            },
            { label: "Free Above", value: `Rs. ${v("cod_free_above") || "2000"}`, Icon: Gift },
            {
              label: "Services",
              value: `${[martOn, foodOn, pharmacyOn, parcelOn, ridesOn].filter(Boolean).length}/5 on`,
              Icon: CheckCircle2,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-center"
            >
              <s.Icon className="mx-auto mb-1 h-5 w-5 text-amber-700" />
              <p className="text-foreground text-xs font-bold">{s.value}</p>
              <p className="text-muted-foreground text-[10px]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Service availability */}
        <div>
          <SLabel>COD Available In Which Services</SLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {services.map((s) => {
              const Icon = getServiceIcon(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => handleToggle(s.key, !s.on)}
                  className={`relative rounded-xl border-2 px-3 py-3 text-left transition-all ${
                    s.on
                      ? "border-green-400 bg-green-50 shadow-sm"
                      : "bg-muted/20 border-border/60 opacity-70 hover:opacity-100"
                  } ${dirtyKeys.has(s.key) ? "ring-2 ring-amber-300" : ""}`}
                >
                  <Icon
                    className={`mb-1 h-6 w-6 ${s.on ? "text-green-700" : "text-muted-foreground"}`}
                  />
                  <p className="text-foreground text-[11px] leading-tight font-bold">{s.label}</p>
                  <p
                    className={`mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold ${s.on ? "text-green-600" : "text-muted-foreground"}`}
                  >
                    {s.on ? (
                      <>
                        <CheckCircle className="h-2.5 w-2.5" /> On
                      </>
                    ) : (
                      <>
                        <XCircle className="h-2.5 w-2.5" /> Off
                      </>
                    )}
                  </p>
                  <div
                    className={`absolute top-2 right-2 h-2.5 w-2.5 rounded-full ${s.on ? "bg-green-500" : "bg-gray-300"}`}
                  />
                </button>
              );
            })}
          </div>
          <p className="text-muted-foreground mt-1.5 text-[11px]">
            Tap a service card to disable COD for that service
          </p>
        </div>

        {/* Fees & Limits */}
        <div>
          <SLabel icon={Banknote}>Fees & Limits</SLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Maximum COD Order (Rs.)"
              value={v("cod_max_amount")}
              onChange={(v2) => handleChange("cod_max_amount", v2)}
              placeholder="5000"
              isDirty={d("cod_max_amount")}
              type="number"
              hint="Orders above this amount cannot use COD"
            />
            <Field
              label="COD Service Fee (Rs.)"
              value={v("cod_fee")}
              onChange={(v2) => handleChange("cod_fee", v2)}
              placeholder="0"
              isDirty={d("cod_fee")}
              type="number"
              hint="0 = free COD"
            />
            <Field
              label="Free COD Above (Rs.)"
              value={v("cod_free_above")}
              onChange={(v2) => handleChange("cod_free_above", v2)}
              placeholder="2000"
              isDirty={d("cod_free_above")}
              type="number"
              hint="Orders above this amount have no COD fee"
            />
            <Field
              label="COD Advance Deposit (%)"
              value={v("cod_advance_pct")}
              onChange={(v2) => handleChange("cod_advance_pct", v2)}
              placeholder="0"
              isDirty={d("cod_advance_pct")}
              type="number"
              hint="0 = no advance, 100 = full amount upfront"
              suffix="%"
            />
          </div>
        </div>

        {/* High-value verification */}
        <div>
          <SLabel icon={Shield}>High-Value Order Verification</SLabel>
          <Field
            label="Photo Verification Required Above (Rs.)"
            value={v("cod_verification_threshold")}
            onChange={(v2) => handleChange("cod_verification_threshold", v2)}
            placeholder="3000"
            isDirty={d("cod_verification_threshold")}
            type="number"
            hint="For COD orders above this amount the rider photographs the cash"
          />
          <p className="text-muted-foreground mt-1 text-[11px]">
            The rider must take a photo of the cash for high-value COD deliveries — to prevent fraud
          </p>
        </div>

        {/* Fake order penalty */}
        <div
          onClick={() => handleToggle("cod_fake_penalty", !fakePenalty)}
          className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-all select-none ${fakePenalty ? "border-red-200 bg-red-50" : "border-border hover:bg-muted/30 bg-white"} ${d("cod_fake_penalty") ? "ring-2 ring-amber-300" : ""}`}
        >
          <div className="min-w-0">
            <p className="text-foreground inline-flex items-center gap-1.5 text-sm font-semibold">
              <Ban className="h-4 w-4" /> Block Repeat Fake COD Customers
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Automatically block customers who repeatedly cancel COD orders
            </p>
            <p
              className={`mt-0.5 text-xs font-bold ${fakePenalty ? "text-red-600" : "text-muted-foreground"}`}
            >
              {fakePenalty ? "Active — Fraud protection ON" : "Disabled"}
            </p>
          </div>
          <div
            className={`relative ml-3 h-6 w-11 flex-shrink-0 rounded-full transition-colors ${fakePenalty ? "bg-red-500" : "bg-gray-300"}`}
          >
            <div
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${fakePenalty ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </div>
        </div>

        {/* Restricted areas */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-foreground text-xs font-semibold">
              Restricted Areas (comma separated)
            </label>
            {d("cod_restricted_areas") && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
              >
                CHANGED
              </Badge>
            )}
          </div>
          <Input
            value={v("cod_restricted_areas")}
            onChange={(e) => handleChange("cod_restricted_areas", e.target.value)}
            placeholder="e.g. Rawalpindi, Islamabad — leave empty if COD is available everywhere"
            className={`h-9 rounded-lg text-sm ${d("cod_restricted_areas") ? "border-amber-300 bg-amber-50/50" : "border-dashed"}`}
          />
          <p className="text-muted-foreground text-[11px]">
            Areas where COD is NOT available. Empty = available everywhere
          </p>
        </div>

        {/* Customer instructions */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-foreground text-xs font-semibold">Customer Instructions</label>
            {d("cod_notes") && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
              >
                CHANGED
              </Badge>
            )}
          </div>
          <textarea
            value={v("cod_notes")}
            onChange={(e) => handleChange("cod_notes", e.target.value)}
            rows={2}
            placeholder="Message shown to the customer after they select COD..."
            className={`focus:ring-primary/30 w-full resize-none rounded-lg border p-3 text-sm focus:ring-2 focus:outline-none ${d("cod_notes") ? "border-amber-300 bg-amber-50/50" : "border-border"}`}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── AJK Wallet Section ─────────────────────────────────────────────────── */
function WalletSection({
  localValues,
  dirtyKeys,
  handleChange,
  handleToggle,
  onNavigateFeatures,
}: {
  localValues: Record<string, string>;
  dirtyKeys: Set<string>;
  handleChange: (k: string, v: string) => void;
  handleToggle: (k: string, v: boolean) => void;
  onNavigateFeatures?: () => void;
}) {
  const enabled = (localValues["feature_wallet"] ?? "on") === "on";
  const p2pEnabled = (localValues["wallet_p2p_enabled"] ?? "on") === "on";
  const kycRequired = (localValues["wallet_kyc_required"] ?? "off") === "on";
  const cbOrders = (localValues["wallet_cashback_on_orders"] ?? "on") === "on";
  const cbRides = (localValues["wallet_cashback_on_rides"] ?? "off") === "on";
  const cbPharmacy = (localValues["wallet_cashback_on_pharmacy"] ?? "off") === "on";
  const v = (k: string) => localValues[k] ?? "";
  const d = (k: string) => dirtyKeys.has(k);

  const methods = v("wallet_topup_methods")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const toggleMethod = (m: string) => {
    const current = methods.includes(m) ? methods.filter((x) => x !== m) : [...methods, m];
    handleChange("wallet_topup_methods", current.join(","));
  };

  const TOPUP_METHODS: { id: string; label: string; Icon: LucideIcon }[] = [
    { id: "jazzcash", label: "JazzCash", Icon: Smartphone },
    { id: "easypaisa", label: "EasyPaisa", Icon: Smartphone },
    { id: "bank", label: "Bank Transfer", Icon: Landmark },
    { id: "cash", label: "Cash Deposit", Icon: Banknote },
    { id: "rider", label: "Via Rider", Icon: Bike },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-purple-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 bg-purple-50 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Wallet className="h-9 w-9 flex-shrink-0 text-purple-700" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-purple-700">AJK Wallet</h3>
              <Badge
                variant="outline"
                className={`flex-shrink-0 border text-[10px] font-bold ${enabled ? "border-green-300 bg-green-50 text-green-700" : "bg-muted text-muted-foreground border-border"}`}
              >
                {enabled ? "Active" : "Disabled"}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              In-app digital wallet · instant payments · P2P transfer
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <Badge
            variant="outline"
            className={`border px-2.5 py-1 text-[11px] font-bold ${enabled ? "border-green-300 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-600"}`}
          >
            {enabled ? "Enabled" : "Disabled"}
          </Badge>
          {onNavigateFeatures ? (
            <button
              onClick={onNavigateFeatures}
              className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
            >
              Change in Feature Toggles <ExternalLink className="h-3 w-3" />
            </button>
          ) : (
            <p className="text-muted-foreground/70 text-[10px]">Toggle in Features tab</p>
          )}
        </div>
      </div>

      <div className="space-y-5 p-5">
        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Max Balance", value: `Rs. ${v("wallet_max_balance") || "50000"}`, Icon: Gem },
            {
              label: "Daily Limit",
              value: `Rs. ${v("wallet_daily_limit") || "20000"}`,
              Icon: Calendar,
            },
            { label: "Cashback", value: `${v("wallet_cashback_pct") || "0"}%`, Icon: Gift },
            {
              label: "Signup Bonus",
              value:
                v("customer_signup_bonus") && v("customer_signup_bonus") !== "0"
                  ? `Rs. ${v("customer_signup_bonus")}`
                  : "None",
              Icon: PartyPopper,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-purple-100 bg-purple-50/60 p-3 text-center"
            >
              <s.Icon className="mx-auto mb-1 h-5 w-5 text-purple-700" />
              <p className="text-foreground text-xs font-bold">{s.value}</p>
              <p className="text-muted-foreground text-[10px]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Feature flags */}
        <div>
          <SLabel icon={ToggleRight}>Wallet Features</SLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              {
                key: "wallet_p2p_enabled",
                label: "P2P Money Transfer",
                sub: "Customers can send money to each other",
                on: p2pEnabled,
                toggle: () => handleToggle("wallet_p2p_enabled", !p2pEnabled),
              },
              {
                key: "wallet_kyc_required",
                label: "KYC Before Activation",
                sub: "Verify ID before activating wallet",
                on: kycRequired,
                toggle: () => handleToggle("wallet_kyc_required", !kycRequired),
              },
            ].map((f) => (
              <div
                key={f.key}
                onClick={f.toggle}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all select-none ${f.on ? "border-purple-200 bg-purple-50" : "border-border hover:bg-muted/30 bg-white"} ${d(f.key) ? "ring-2 ring-amber-300" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-foreground text-xs font-semibold">{f.label}</p>
                  <p className="text-muted-foreground mt-0.5 text-[10px]">{f.sub}</p>
                </div>
                <div
                  className={`relative ml-2 h-5 w-9 flex-shrink-0 rounded-full transition-colors ${f.on ? "bg-purple-500" : "bg-gray-300"}`}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${f.on ? "translate-x-4" : "translate-x-0.5"}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Balance limits */}
        <div>
          <SLabel icon={Banknote}>Balance & Transaction Limits</SLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Max Wallet Balance (Rs.)"
              value={v("wallet_max_balance")}
              onChange={(v2) => handleChange("wallet_max_balance", v2)}
              placeholder="50000"
              isDirty={d("wallet_max_balance")}
              type="number"
              hint="Maximum balance a customer can hold"
            />
            <Field
              label="Daily Transaction Limit (Rs.)"
              value={v("wallet_daily_limit")}
              onChange={(v2) => handleChange("wallet_daily_limit", v2)}
              placeholder="20000"
              isDirty={d("wallet_daily_limit")}
              type="number"
              hint="Combined daily in + out total"
            />
          </div>
        </div>

        {/* Top-Up rules */}
        <div>
          <SLabel>Top-Up Rules</SLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Minimum Top-Up (Rs.)"
              value={v("wallet_min_topup")}
              onChange={(v2) => handleChange("wallet_min_topup", v2)}
              placeholder="100"
              isDirty={d("wallet_min_topup")}
              type="number"
            />
            <Field
              label="Maximum Single Top-Up (Rs.)"
              value={v("wallet_max_topup")}
              onChange={(v2) => handleChange("wallet_max_topup", v2)}
              placeholder="25000"
              isDirty={d("wallet_max_topup")}
              type="number"
            />
          </div>
        </div>

        {/* Withdrawal rules */}
        <div>
          <SLabel>Withdrawal / Payout Rules</SLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Minimum Withdrawal (Rs.)"
              value={v("wallet_min_withdrawal")}
              onChange={(v2) => handleChange("wallet_min_withdrawal", v2)}
              placeholder="200"
              isDirty={d("wallet_min_withdrawal")}
              type="number"
            />
            <Field
              label="Maximum Single Withdrawal (Rs.)"
              value={v("wallet_max_withdrawal")}
              onChange={(v2) => handleChange("wallet_max_withdrawal", v2)}
              placeholder="10000"
              isDirty={d("wallet_max_withdrawal")}
              type="number"
            />
            <Field
              label="Withdrawal Processing Time (hrs)"
              value={v("wallet_withdrawal_processing")}
              onChange={(v2) => handleChange("wallet_withdrawal_processing", v2)}
              placeholder="24"
              isDirty={d("wallet_withdrawal_processing")}
              type="number"
              hint="Admin process karne mein kitna time"
              suffix="hrs"
            />
          </div>
        </div>

        {/* P2P limit */}
        {p2pEnabled && (
          <div>
            <SLabel>P2P Transfer Settings</SLabel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="P2P Daily Send Limit (Rs.)"
                value={v("wallet_p2p_daily_limit")}
                onChange={(v2) => handleChange("wallet_p2p_daily_limit", v2)}
                placeholder="10000"
                isDirty={d("wallet_p2p_daily_limit")}
                type="number"
                hint="How much a customer can transfer per day"
              />
              <Field
                label="P2P Fee (%)"
                value={v("wallet_p2p_fee_pct")}
                onChange={(v2) => handleChange("wallet_p2p_fee_pct", v2)}
                placeholder="0"
                isDirty={d("wallet_p2p_fee_pct")}
                type="number"
                suffix="%"
                hint="Platform fee per P2P transfer (0 = no fee)"
              />
            </div>
          </div>
        )}

        {/* Deposit Auto-Approve */}
        <div>
          <SLabel>Deposit Auto-Approval</SLabel>
          <Field
            label="Auto-Approve Threshold (Rs.)"
            value={v("wallet_deposit_auto_approve")}
            onChange={(v2) => handleChange("wallet_deposit_auto_approve", v2)}
            placeholder="0"
            isDirty={d("wallet_deposit_auto_approve")}
            type="number"
            hint="Deposits up to this amount are auto-approved (0 = all manual review)"
            suffix="Rs."
          />
        </div>

        {/* Rewards & Bonuses */}
        <div>
          <SLabel>Rewards & Bonuses</SLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Wallet Cashback (%)"
              value={v("wallet_cashback_pct")}
              onChange={(v2) => handleChange("wallet_cashback_pct", v2)}
              placeholder="0"
              isDirty={d("wallet_cashback_pct")}
              type="number"
              hint="% cashback for wallet payments"
              suffix="%"
            />
            <Field
              label="Referral Bonus (Rs.)"
              value={v("customer_referral_bonus")}
              onChange={(v2) => handleChange("customer_referral_bonus", v2)}
              placeholder="100"
              isDirty={d("customer_referral_bonus")}
              type="number"
              hint="Awarded when a new referral joins (synced with Customer settings)"
            />
            <Field
              label="New User Signup Bonus (Rs.)"
              value={v("customer_signup_bonus")}
              onChange={(v2) => handleChange("customer_signup_bonus", v2)}
              placeholder="0"
              isDirty={d("customer_signup_bonus")}
              type="number"
              hint="Credited on account creation (synced with Customer settings)"
            />
            <Field
              label="Balance Expiry (days, 0=never)"
              value={v("wallet_expiry_days")}
              onChange={(v2) => handleChange("wallet_expiry_days", v2)}
              placeholder="0"
              isDirty={d("wallet_expiry_days")}
              type="number"
              hint="0 = never expires"
              suffix="days"
            />
          </div>
        </div>

        {/* Cashback on which services */}
        <div>
          <SLabel>Cashback Earned In Which Services</SLabel>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "wallet_cashback_on_orders", label: "Orders", on: cbOrders },
              { key: "wallet_cashback_on_rides", label: "Rides", on: cbRides },
              { key: "wallet_cashback_on_pharmacy", label: "Pharmacy", on: cbPharmacy },
            ].map((cb) => {
              const Icon = getServiceIcon(cb.key);
              return (
                <button
                  key={cb.key}
                  onClick={() => handleToggle(cb.key, !cb.on)}
                  className={`rounded-xl border-2 px-3 py-2.5 text-center transition-all ${
                    cb.on
                      ? "border-purple-700 bg-purple-600 text-white shadow-sm"
                      : "bg-muted/30 border-border text-foreground hover:bg-muted/60"
                  } ${d(cb.key) ? "ring-2 ring-amber-300" : ""}`}
                >
                  <Icon
                    className={`mx-auto mb-1 h-5 w-5 ${cb.on ? "text-white" : "text-muted-foreground"}`}
                  />
                  <p className="text-[11px] font-bold">{cb.label}</p>
                  <p
                    className={`text-[10px] font-bold ${cb.on ? "text-purple-100" : "text-muted-foreground"}`}
                  >
                    {cb.on ? "ON" : "Off"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Service availability */}
        <div>
          <SLabel>Available In Which Services</SLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              {
                key: "wallet_allowed_mart",
                label: "Mart / Grocery",
                on: (v("wallet_allowed_mart") || "on") === "on",
              },
              {
                key: "wallet_allowed_food",
                label: "Food Delivery",
                on: (v("wallet_allowed_food") || "on") === "on",
              },
              {
                key: "wallet_allowed_pharmacy",
                label: "Pharmacy",
                on: (v("wallet_allowed_pharmacy") || "on") === "on",
              },
              {
                key: "wallet_allowed_parcel",
                label: "Parcel Delivery",
                on: (v("wallet_allowed_parcel") || "on") === "on",
              },
              {
                key: "wallet_allowed_rides",
                label: "Rides",
                on: (v("wallet_allowed_rides") || "on") === "on",
              },
            ].map((s) => {
              const Icon = getServiceIcon(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => handleToggle(s.key, !s.on)}
                  className={`relative rounded-xl border-2 px-3 py-3 text-left transition-all ${
                    s.on
                      ? "border-green-400 bg-green-50 shadow-sm"
                      : "bg-muted/20 border-border/60 opacity-70 hover:opacity-100"
                  } ${dirtyKeys.has(s.key) ? "ring-2 ring-amber-300" : ""}`}
                >
                  <Icon
                    className={`mb-1 h-6 w-6 ${s.on ? "text-green-700" : "text-muted-foreground"}`}
                  />
                  <p className="text-foreground text-[11px] leading-tight font-bold">{s.label}</p>
                  <p
                    className={`mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold ${s.on ? "text-green-600" : "text-muted-foreground"}`}
                  >
                    {s.on ? (
                      <>
                        <CheckCircle className="h-2.5 w-2.5" /> On
                      </>
                    ) : (
                      <>
                        <XCircle className="h-2.5 w-2.5" /> Off
                      </>
                    )}
                  </p>
                  <div
                    className={`absolute top-2 right-2 h-2.5 w-2.5 rounded-full ${s.on ? "bg-green-500" : "bg-gray-300"}`}
                  />
                </button>
              );
            })}
          </div>
          <p className="text-muted-foreground mt-1.5 text-[11px]">
            Tap a service card to disable wallet payments for that service
          </p>
        </div>

        {/* Top-Up methods */}
        <div>
          <SLabel icon={Phone}>Accepted Top-Up Methods</SLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TOPUP_METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => toggleMethod(m.id)}
                className={`inline-flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                  methods.includes(m.id)
                    ? "border-purple-700 bg-purple-600 text-white shadow-sm"
                    : "bg-muted/30 border-border text-foreground hover:bg-muted/60"
                } ${dirtyKeys.has("wallet_topup_methods") ? "ring-1 ring-amber-300" : ""}`}
              >
                <m.Icon className="h-4 w-4" /> {m.label}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground mt-1.5 text-[11px]">
            Tap to toggle — the customer can top up the wallet using these methods
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Payment Rules Section ──────────────────────────────────────────────── */
function PaymentRules({
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
  const autoCancelOn = (localValues["payment_auto_cancel"] ?? "on") === "on";
  const receiptReq = (localValues["payment_receipt_required"] ?? "on") === "on";
  const v = (k: string) => localValues[k] ?? "";
  const d = (k: string) => dirtyKeys.has(k);

  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <Settings className="h-5 w-5 flex-shrink-0 text-slate-700" />
        <p className="text-xs text-slate-700">
          These rules apply to all payment methods — platform-wide global settings.
        </p>
      </div>

      <div>
        <SLabel>Global Toggles</SLabel>
        <div className="space-y-2">
          <Toggle
            checked={autoCancelOn}
            onChange={(v2) => handleToggle("payment_auto_cancel", v2)}
            label="Auto-Cancel Unpaid Orders"
            sub="Orders are automatically cancelled when the online payment times out"
            isDirty={d("payment_auto_cancel")}
          />
          <Toggle
            checked={receiptReq}
            onChange={(v2) => handleToggle("payment_receipt_required", v2)}
            label="Manual Payment Receipt Required"
            sub="Customers must submit proof for JazzCash / EasyPaisa / bank manual payments"
            isDirty={d("payment_receipt_required")}
          />
        </div>
      </div>

      <div>
        <SLabel>Timing & Limits</SLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Online Payment Timeout (min)"
            value={v("payment_timeout_mins")}
            onChange={(v2) => handleChange("payment_timeout_mins", v2)}
            placeholder="15"
            isDirty={d("payment_timeout_mins")}
            type="number"
            suffix="min"
            hint="Time allowed to complete the payment"
          />
          <Field
            label="Manual Verify Window (hrs)"
            value={v("payment_verify_window_hours")}
            onChange={(v2) => handleChange("payment_verify_window_hours", v2)}
            placeholder="4"
            isDirty={d("payment_verify_window_hours")}
            type="number"
            suffix="hrs"
            hint="Time allowed to verify a manual payment"
          />
          <Field
            label="Minimum Online Payment (Rs.)"
            value={v("payment_min_online")}
            onChange={(v2) => handleChange("payment_min_online", v2)}
            placeholder="50"
            isDirty={d("payment_min_online")}
            type="number"
            hint="Below this amount = COD or wallet only"
          />
          <Field
            label="Maximum Online Payment (Rs.)"
            value={v("payment_max_online")}
            onChange={(v2) => handleChange("payment_max_online", v2)}
            placeholder="100000"
            isDirty={d("payment_max_online")}
            type="number"
            hint="Above this amount = customer must contact support"
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Full Payment Section (with sub-tabs) ───────────────────────────────── */
export function PaymentSection({
  localValues,
  dirtyKeys,
  handleChange,
  handleToggle,
  onNavigateFeatures,
}: {
  localValues: Record<string, string>;
  dirtyKeys: Set<string>;
  handleChange: (k: string, v: string) => void;
  handleToggle: (k: string, v: boolean) => void;
  onNavigateFeatures?: () => void;
}) {
  const [payTab, setPayTab] = useState<PayTab>("jazzcash");

  const activeMethods = PAY_TABS.filter((t) => {
    if (t.id === "jazzcash") return (localValues["jazzcash_enabled"] ?? "off") === "on";
    if (t.id === "easypaisa") return (localValues["easypaisa_enabled"] ?? "off") === "on";
    if (t.id === "bank") return (localValues["bank_enabled"] ?? "off") === "on";
    if (t.id === "cod") return (localValues["cod_enabled"] ?? "on") === "on";
    if (t.id === "wallet") return (localValues["feature_wallet"] ?? "on") === "on";
    return true;
  });

  const PAY_DIRTY: Partial<Record<PayTab, number>> = {};
  for (const k of dirtyKeys) {
    if (k.startsWith("jazzcash")) PAY_DIRTY.jazzcash = (PAY_DIRTY.jazzcash || 0) + 1;
    else if (k.startsWith("easypaisa")) PAY_DIRTY.easypaisa = (PAY_DIRTY.easypaisa || 0) + 1;
    else if (k.startsWith("bank")) PAY_DIRTY.bank = (PAY_DIRTY.bank || 0) + 1;
    else if (k.startsWith("cod")) PAY_DIRTY.cod = (PAY_DIRTY.cod || 0) + 1;
    else if (k.startsWith("wallet") || k === "feature_wallet")
      PAY_DIRTY.wallet = (PAY_DIRTY.wallet || 0) + 1;
    else if (k.startsWith("payment")) PAY_DIRTY.rules = (PAY_DIRTY.rules || 0) + 1;
  }

  return (
    <div className="space-y-4">
      {/* Active methods summary */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {PAY_TABS.map((t) => {
          const isOn = activeMethods.find((m) => m.id === t.id);
          return (
            <button
              key={t.id}
              onClick={() => setPayTab(t.id)}
              className={`rounded-xl border p-2.5 text-center transition-all ${
                payTab === t.id
                  ? `${t.activeBg} border-transparent text-white shadow-md`
                  : isOn
                    ? "border-green-200 bg-white hover:border-green-300"
                    : "bg-muted/20 border-border/50 opacity-60 hover:opacity-80"
              }`}
            >
              <t.Icon
                className={`mx-auto mb-1 h-5 w-5 ${payTab === t.id ? "text-white" : t.color}`}
              />
              <p
                className={`text-[10px] leading-tight font-bold ${payTab === t.id ? "text-white" : "text-foreground"}`}
              >
                {t.label}
              </p>
              {(PAY_DIRTY[t.id] ?? 0) > 0 && (
                <span
                  className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold ${payTab === t.id ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"}`}
                >
                  {PAY_DIRTY[t.id]} changed
                </span>
              )}
              {isOn && payTab !== t.id && !(PAY_DIRTY[t.id] ?? 0) && (
                <p className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-bold text-green-600">
                  <CheckCircle className="h-2.5 w-2.5" /> On
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div>
        {payTab === "jazzcash" && (
          <GatewayCard
            prefix="jazzcash"
            name="JazzCash"
            Logo={Smartphone}
            accentColor="text-red-700"
            accentBg="bg-red-50"
            accentBorder="border-red-200"
            accentBtn="bg-red-600"
            localValues={localValues}
            dirtyKeys={dirtyKeys}
            handleChange={handleChange}
            handleToggle={handleToggle}
          />
        )}
        {payTab === "easypaisa" && (
          <GatewayCard
            prefix="easypaisa"
            name="EasyPaisa"
            Logo={Smartphone}
            accentColor="text-green-700"
            accentBg="bg-green-50"
            accentBorder="border-green-200"
            accentBtn="bg-green-600"
            localValues={localValues}
            dirtyKeys={dirtyKeys}
            handleChange={handleChange}
            handleToggle={handleToggle}
          />
        )}
        {payTab === "bank" && (
          <BankSection
            localValues={localValues}
            dirtyKeys={dirtyKeys}
            handleChange={handleChange}
            handleToggle={handleToggle}
          />
        )}
        {payTab === "cod" && (
          <CODSection
            localValues={localValues}
            dirtyKeys={dirtyKeys}
            handleChange={handleChange}
            handleToggle={handleToggle}
          />
        )}
        {payTab === "wallet" && (
          <WalletSection
            localValues={localValues}
            dirtyKeys={dirtyKeys}
            handleChange={handleChange}
            handleToggle={handleToggle}
            onNavigateFeatures={onNavigateFeatures}
          />
        )}
        {payTab === "rules" && (
          <PaymentRules
            localValues={localValues}
            dirtyKeys={dirtyKeys}
            handleChange={handleChange}
            handleToggle={handleToggle}
          />
        )}
      </div>
    </div>
  );
}
