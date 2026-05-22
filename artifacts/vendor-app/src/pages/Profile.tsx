import { useQuery } from "@tanstack/react-query";
import { LANGUAGE_OPTIONS, tDual, type Language, type TranslationKey } from "@workspace/i18n";
import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { PageHeader } from "../components/PageHeader";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { VendorKycModal } from "../components/VendorKycModal";
import { api } from "../lib/api";
import { registerPush } from "../lib/push";
import { BTN_PRIMARY, CARD, INPUT, LABEL, errMsg, fc } from "../lib/ui";
import { useCurrency, useDateFormatter, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { useTheme } from "../lib/useTheme";
import { useAuth } from "../lib/vendor-auth";

const CITIES = [
  "Muzaffarabad",
  "Mirpur",
  "Rawalakot",
  "Bagh",
  "Kotli",
  "Bhimber",
  "Jhelum",
  "Rawalpindi",
  "Islamabad",
  "Lahore",
  "Karachi",
  "Other",
];
const BANKS = [
  "EasyPaisa",
  "JazzCash",
  "MCB",
  "HBL",
  "UBL",
  "Meezan Bank",
  "Bank Alfalah",
  "NBP",
  "Allied Bank",
  "Other",
];
const BIZ_TYPES = [
  "Sole Proprietorship",
  "Partnership",
  "Private Limited",
  "Trust / NGO",
  "Individual / Freelancer",
];

type EditSection = "personal" | "bank" | null;
type DocKey = "cnicFrontUrl" | "cnicBackUrl" | "businessDocUrl";

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const { config } = usePlatformConfig();
  const { symbol: currencySymbol } = useCurrency();
  const formatDate = useDateFormatter();
  const fdLong = (d: string | Date) =>
    formatDate(d, { day: "numeric", month: "long", year: "numeric" });

  const { data: notifData } = useQuery({
    queryKey: ["vendor-notifs-count"],
    queryFn: () => api.getNotifications(),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const unread: number = notifData?.unread || 0;

  const [editing, setEditing] = useState<EditSection>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [docUploading, setDocUploading] = useState<DocKey | null>(null);
  const [kycModalOpen, setKycModalOpen] = useState(false);

  const { data: kycData } = useQuery({
    queryKey: ["vendor-kyc-status"],
    queryFn: () =>
      api.getKycStatus() as Promise<{
        status: string;
        record: { rejectionReason?: string | null; submittedAt?: string } | null;
      }>,
    enabled: !!user && user.kycStatus !== "verified",
    staleTime: 60000,
  });

  const { language, setLanguage, loading: langLoading } = useLanguage();
  const { isDark, toggleDark } = useTheme();
  const T = (key: TranslationKey) => tDual(key, language);

  // Personal info form state
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [cnic, setCnic] = useState(user?.cnic || "");
  const [city, setCity] = useState(user?.city || "");
  const [address, setAddress] = useState(user?.address || "");
  const [businessType, setBusinessType] = useState(user?.businessType || "");

  // Bank info form state
  const [bankName, setBankName] = useState(user?.bankName || "");
  const [bankAccount, setBankAccount] = useState(user?.bankAccount || "");
  const [bankAccountTitle, setBankAccountTitle] = useState(user?.bankAccountTitle || "");

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );
  const showToast = (m: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(m);
    toastTimerRef.current = setTimeout(() => setToast(""), 3500);
  };

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported"
  );
  const [testingNotif, setTestingNotif] = useState(false);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotifPermission(Notification.permission);
    }
  }, []);

  const handleTestNotification = useCallback(async () => {
    setTestingNotif(true);
    try {
      /* Ensure push is registered before testing.
         - permission "default": request it then register.
         - permission "granted": always attempt re-registration so a stale or
           missing subscription is healed before the test send — prevents a
           false noSubscriptions response when the vendor already said "Allow". */
      if (notifPermission === "default") {
        const perm = await Notification.requestPermission();
        setNotifPermission(perm);
        if (perm !== "granted") {
          showToast("❌ Notification permission denied. Please allow in browser settings.");
          return;
        }
      }
      if (Notification.permission === "granted") {
        await registerPush().catch((err) => {
          console.warn("[artifacts/vendor-app/src/pages/Profile.tsx]", err);
        }); // eslint-disable-line no-console
      }
      const result = (await api.testNotification()) as {
        sent?: boolean;
        socketEmitted?: boolean;
        noSubscriptions?: boolean;
        attempted?: number;
        delivered?: number;
        stalePurged?: number;
        warning?: string;
        error?: string;
      };
      if (result.noSubscriptions) {
        showToast(
          "⚠️ Not registered yet — allow notifications and reload the app, then try again."
        );
      } else if (result.sent) {
        const extra = result.stalePurged ? ` (${result.stalePurged} stale token(s) cleared)` : "";
        showToast(`✅ Test notification sent! Check your notifications.${extra}`);
      } else if (result.warning) {
        showToast("⚠️ " + result.warning);
      } else if (result.socketEmitted) {
        showToast("⚠️ In-app alert sent, but push was not delivered — check VAPID configuration.");
      } else {
        showToast("❌ " + (result.error || "Test notification failed."));
      }
    } catch (e) {
      showToast("❌ " + errMsg(e));
    } finally {
      setTestingNotif(false);
    }
  }, [notifPermission]);
  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setEmail(user.email || "");
    setCnic(user.cnic || "");
    setCity(user.city || "");
    setAddress(user.address || "");
    setBusinessType(user.businessType || "");
    setBankName(user.bankName || "");
    setBankAccount(user.bankAccount || "");
    setBankAccountTitle(user.bankAccountTitle || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.id,
    user?.name,
    user?.email,
    user?.cnic,
    user?.city,
    user?.address,
    user?.businessType,
    user?.bankName,
    user?.bankAccount,
    user?.bankAccountTitle,
  ]);

  const startEdit = (section: EditSection) => {
    if (section === "personal") {
      setName(user?.name || "");
      setEmail(user?.email || "");
      setCnic(user?.cnic || "");
      setCity(user?.city || "");
      setAddress(user?.address || "");
      setBusinessType(user?.businessType || "");
    } else if (section === "bank") {
      setBankName(user?.bankName || "");
      setBankAccount(user?.bankAccount || "");
      setBankAccountTitle(user?.bankAccountTitle || "");
    }
    setEditing(section);
  };

  /** Convert an empty or whitespace-only string to `null` so optional backend
   *  fields are explicitly cleared rather than validated as empty strings. */
  function nullIfEmpty(v: string): string | null {
    const t = v.trim();
    return t === "" ? null : t;
  }

  const saveSection = async (section: EditSection) => {
    setSaving(true);
    try {
      if (section === "personal") {
        await api.updateProfile({
          name: name.trim() || undefined,
          email: nullIfEmpty(email),
          cnic: nullIfEmpty(cnic),
          city: nullIfEmpty(city),
          address: nullIfEmpty(address),
          businessType: nullIfEmpty(businessType),
        });
      } else if (section === "bank") {
        await api.updateProfile({
          bankName: nullIfEmpty(bankName),
          bankAccount: nullIfEmpty(bankAccount),
          bankAccountTitle: nullIfEmpty(bankAccountTitle),
        });
      }
      await refreshUser();
      setEditing(null);
      showToast("✅ Changes saved successfully!");
    } catch (e) {
      showToast("❌ " + errMsg(e));
    }
    setSaving(false);
  };

  const SELECT =
    "w-full h-12 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 appearance-none";

  const InfoRow = ({
    label,
    value,
    empty = "Not set",
  }: {
    label: string;
    value?: string | null;
    empty?: string;
  }) => (
    <div className="flex items-start justify-between gap-3 border-b border-gray-50 py-3 last:border-0">
      <span className="flex-shrink-0 text-sm font-medium text-gray-400">{label}</span>
      <span
        className={`text-right text-sm font-semibold ${value ? "text-gray-800" : "text-gray-300 italic"}`}
      >
        {value || empty}
      </span>
    </div>
  );

  const uploadDoc = async (key: DocKey, file: File) => {
    setDocUploading(key);
    try {
      const { url } = (await api.uploadVendorDoc(file)) as { url: string };
      await api.updateProfile({ [key]: url });
      await refreshUser();
      showToast("✅ Document uploaded successfully!");
    } catch (e) {
      showToast(`❌ Upload failed: ${errMsg(e)}`);
    } finally {
      setDocUploading(null);
    }
  };

  const removeDoc = async (key: DocKey) => {
    try {
      await api.updateProfile({ [key]: null });
      await refreshUser();
      showToast("🗑️ Document removed.");
    } catch (e) {
      showToast(`❌ ${errMsg(e)}`);
    }
  };

  const completionFields = [
    user?.name,
    user?.email,
    user?.cnic,
    user?.city,
    user?.bankName,
    user?.bankAccount,
    (user as unknown as Record<string, unknown>)?.cnicFrontUrl,
    (user as unknown as Record<string, unknown>)?.cnicBackUrl,
  ];
  const completedCount = completionFields.filter(Boolean).length;
  const completionPct = Math.round((completedCount / completionFields.length) * 100);

  return (
    <div className="bg-[#0A0F1A] md:bg-transparent">
      {kycModalOpen && (
        <VendorKycModal
          onClose={() => setKycModalOpen(false)}
          rejectionReason={user?.kycStatus === "rejected" ? kycData?.record?.rejectionReason : null}
        />
      )}
      <PageHeader
        title={T("account")}
        subtitle={T("profileSecurity")}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              className="android-press relative flex h-9 min-h-0 w-9 items-center justify-center rounded-xl bg-white/20 text-white md:bg-gray-100 md:text-gray-700"
            >
              🔔
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-extrabold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <button
              onClick={logout}
              className="android-press h-9 min-h-0 rounded-xl bg-white/20 px-4 text-sm font-bold text-white md:bg-red-50 md:text-red-600"
            >
              🚪 {T("logout")}
            </button>
          </div>
        }
      />

      <div className="px-4 py-4 md:px-0 md:py-4">
        <div className="space-y-4 md:grid md:grid-cols-3 md:gap-6 md:space-y-0">
          {/* ── Column 1: Identity + Wallet ── */}
          <div className="space-y-4">
            {/* Mobile Quick Links */}
            <div className="grid grid-cols-3 gap-3 md:hidden">
              {(
                [
                  { href: "/store", icon: "🏪", label: "My Store" },
                  { href: "/analytics", icon: "📈", label: "Analytics" },
                  { href: "/notifications", icon: "🔔", label: "Notifications", badge: unread },
                ] as { href: string; icon: string; label: string; badge?: number }[]
              ).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="android-press relative flex flex-col items-center gap-1.5 rounded-2xl bg-white p-3 shadow-sm"
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-[10px] font-bold text-gray-600">{item.label}</span>
                  {(item.badge ?? 0) > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[9px] font-extrabold text-white">
                      {(item.badge ?? 0) > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>

            {/* Business Identity Card */}
            <div className={CARD}>
              <div className="border-b border-gray-100 p-5 text-center">
                <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-4xl font-extrabold text-white shadow-md">
                  {(user?.storeName || user?.name || "V")[0].toUpperCase()}
                </div>
                <h2 className="text-lg font-extrabold text-gray-900">
                  {user?.storeName || "My Store"}
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">{user?.name || user?.phone}</p>
                {user?.businessType && (
                  <p className="mt-0.5 text-xs text-gray-400">{user.businessType}</p>
                )}
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
                  {user?.storeCategory && (
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-orange-700 capitalize">
                      {user.storeCategory}
                    </span>
                  )}
                  {user?.isVerified === true && (
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                      ✓ Verified
                    </span>
                  )}
                  {user?.city && (
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
                      📍 {user.city}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4">
                <div className="rounded-xl bg-blue-50 p-3 text-center">
                  <p className="text-2xl font-extrabold text-blue-500">
                    {user?.stats?.totalOrders || 0}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">Total Orders</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3 text-center">
                  <p className="text-lg font-extrabold text-amber-600">
                    {fc(user?.stats?.totalRevenue || 0)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">Total Earned</p>
                </div>
              </div>
            </div>

            {/* Profile Completion */}
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-bold text-gray-700">Profile Completion</p>
                <span
                  className={`text-sm font-extrabold ${completionPct >= 80 ? "text-green-600" : completionPct >= 50 ? "text-blue-500" : "text-red-500"}`}
                >
                  {completionPct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              {completionPct < 100 && (
                <p className="mt-2 text-xs text-gray-400">
                  Complete your profile to unlock all features
                </p>
              )}
            </div>

            {/* Wallet */}
            <div className="rounded-2xl bg-gradient-to-r from-orange-500 to-blue-600 p-4 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-orange-100">Wallet Balance</p>
                  <p className="mt-0.5 text-3xl font-extrabold">{fc(user?.walletBalance ?? "0")}</p>
                </div>
                <div className="rounded-2xl bg-white/15 px-4 py-2.5 text-right">
                  <p className="text-xs font-medium text-orange-100">Commission</p>
                  <p className="text-3xl font-extrabold">
                    {Math.round(
                      100 -
                        (config.vendor?.commissionPct ?? config.platform.vendorCommissionPct ?? 15)
                    )}
                    %
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/20 pt-2.5">
                <p className="text-xs font-medium text-orange-100">
                  Platform fee:{" "}
                  {config.vendor?.commissionPct ?? config.platform.vendorCommissionPct ?? 15}% per
                  order
                </p>
                <Link
                  href="/wallet"
                  className="rounded-lg bg-white/20 px-3 py-1 text-xs font-bold text-white"
                >
                  Withdraw →
                </Link>
              </div>
            </div>

            {/* Security */}
            <div className={CARD}>
              <div className="border-b border-gray-100 px-4 py-3.5">
                <p className="text-sm font-bold text-gray-800">🔒 Security & Session</p>
              </div>
              <div className="px-4 py-3">
                <InfoRow
                  label="Member Since"
                  value={user?.createdAt ? fdLong(user.createdAt) : "—"}
                />
                <InfoRow
                  label="Last Login"
                  value={user?.lastLoginAt ? fdLong(user.lastLoginAt) : "Now"}
                />
                <InfoRow label="Status" value="✓ Active & Verified" />
                <div className="mt-2 rounded-xl bg-blue-50 p-3">
                  <p className="text-xs font-medium text-blue-700">
                    🔐 Session secured via encrypted authentication. Logout if using a shared
                    device.
                  </p>
                </div>
              </div>
            </div>

            {/* Notification Settings & Test */}
            <div className={CARD}>
              <div className="border-b border-gray-100 px-4 py-3.5">
                <p className="text-sm font-bold text-gray-800">🔔 Order Notifications</p>
              </div>
              <div className="space-y-3 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Status</span>
                  {notifPermission === "granted" ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                      ✓ Enabled
                    </span>
                  ) : notifPermission === "denied" ? (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-600">
                      ✗ Blocked
                    </span>
                  ) : notifPermission === "default" ? (
                    <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-bold text-yellow-700">
                      ⚠ Not set
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">
                      Unavailable
                    </span>
                  )}
                </div>
                {notifPermission === "denied" && (
                  <div className="rounded-xl bg-red-50 p-3">
                    <p className="text-xs font-medium text-red-700">
                      Notifications are blocked. To re-enable:
                    </p>
                    <p className="mt-1 text-xs text-red-600">
                      Browser → Settings → Site Settings → Notifications → Allow for this site
                    </p>
                  </div>
                )}
                {notifPermission !== "unsupported" && notifPermission !== "denied" && (
                  <button
                    onClick={handleTestNotification}
                    disabled={testingNotif}
                    className="h-10 w-full rounded-xl border border-blue-200 bg-blue-50 text-sm font-bold text-blue-600 transition-colors hover:bg-blue-100 disabled:opacity-50"
                  >
                    {testingNotif ? "Sending..." : "🧪 Send Test Notification"}
                  </button>
                )}
                <p className="text-[11px] leading-relaxed text-gray-400">
                  Use the test button to confirm you'll receive order alerts. If you don't see a
                  notification, check that your browser allows notifications for this site.
                </p>
              </div>
            </div>
            <div className={CARD}>
              <div className="border-b border-gray-100 px-4 py-3.5">
                <p className="text-sm font-bold text-gray-800">🎨 Display & Language</p>
              </div>
              <div className="space-y-4 px-4 py-3">
                {/* Dark mode */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-indigo-100" : "bg-gray-100"}`}
                    >
                      {isDark ? (
                        <Moon size={16} className="text-indigo-500" />
                      ) : (
                        <Sun size={16} className="text-gray-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Dark Mode</p>
                      <p className="text-xs text-gray-400">
                        {isDark ? "Dark theme active" : "Light theme active"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={toggleDark}
                    className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${isDark ? "bg-blue-600" : "bg-gray-300"}`}
                    aria-label="Toggle dark mode"
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${isDark ? "translate-x-5" : "translate-x-0.5"}`}
                    />
                  </button>
                </div>
                {/* Language */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                    <span className="text-base leading-none">🌐</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 text-sm font-semibold text-gray-800">Language</p>
                    <div className="flex flex-wrap gap-1.5">
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          disabled={langLoading}
                          onClick={() => setLanguage(opt.value as Language)}
                          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all ${
                            language === opt.value
                              ? "border-blue-400 bg-blue-50 text-orange-700"
                              : "border-gray-200 bg-gray-50 text-gray-500 hover:border-blue-200"
                          }`}
                        >
                          {opt.nativeLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              className="h-12 w-full rounded-2xl border-2 border-red-200 text-sm font-bold text-red-500 transition-colors hover:bg-red-50"
            >
              🚪 Logout from This Device
            </button>
          </div>

          {/* ── Column 2: Personal Information ── */}
          <div className="space-y-4">
            <div className={CARD}>
              <Accordion type="single" collapsible defaultValue="personal-info">
                <AccordionItem value="personal-info" className="border-0">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
                    <AccordionTrigger className="flex-1 border-0 p-0 hover:no-underline">
                      <div className="text-left">
                        <span className="block text-sm font-bold text-gray-800">
                          👤 Personal Information
                        </span>
                        <span className="mt-0.5 text-xs text-gray-400">
                          Contact & identity details
                        </span>
                      </div>
                    </AccordionTrigger>
                    <button
                      onClick={() =>
                        editing === "personal" ? setEditing(null) : startEdit("personal")
                      }
                      className="android-press ml-3 min-h-0 flex-shrink-0 py-1 text-sm font-bold text-blue-500"
                    >
                      {editing === "personal" ? "Cancel" : "✏️ Edit"}
                    </button>
                  </div>
                  <AccordionContent className="pt-0 pb-0">
                    {editing === "personal" ? (
                      <div className="space-y-3 p-4">
                        <div>
                          <label className={LABEL}>Full Name *</label>
                          <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your full name"
                            className={INPUT}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>Email Address</label>
                          <input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            type="email"
                            inputMode="email"
                            placeholder="email@company.com"
                            className={INPUT}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>CNIC / National ID</label>
                          <input
                            value={cnic}
                            onChange={(e) => setCnic(e.target.value)}
                            inputMode="numeric"
                            placeholder="XXXXX-XXXXXXX-X"
                            className={INPUT}
                          />
                          <p className="mt-1 text-[10px] text-gray-400">
                            Format: 42101-1234567-8 · Required for verification
                          </p>
                        </div>
                        <div>
                          <label className={LABEL}>City</label>
                          <select
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className={SELECT}
                          >
                            <option value="">Select city</option>
                            {(config.cities?.length ? config.cities : CITIES).map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={LABEL}>Business Address</label>
                          <input
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="Street, Area, City"
                            className={INPUT}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>Business Type</label>
                          <select
                            value={businessType}
                            onChange={(e) => setBusinessType(e.target.value)}
                            className={SELECT}
                          >
                            <option value="">Select business type</option>
                            {BIZ_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={() => saveSection("personal")}
                          disabled={saving}
                          className={BTN_PRIMARY}
                        >
                          {saving ? "Saving..." : "✓ Save Changes"}
                        </button>
                      </div>
                    ) : (
                      <div className="px-4 py-3">
                        <InfoRow label="Full Name" value={user?.name} />
                        <InfoRow label="Phone" value={user?.phone} empty="—" />
                        <InfoRow label="Email" value={user?.email} />
                        <InfoRow label="CNIC" value={user?.cnic} />
                        <InfoRow label="City" value={user?.city} />
                        <InfoRow label="Address" value={user?.address} />
                        <InfoRow label="Business Type" value={user?.businessType} />
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            {/* Quick Actions — Desktop only */}
            <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm md:block">
              <div className="border-b border-gray-100 px-4 py-3.5">
                <p className="text-sm font-bold text-gray-800">⚡ Quick Links</p>
              </div>
              <div className="space-y-2 p-4">
                {(
                  [
                    { href: "/store", icon: "🏪", label: "Manage Store Settings" },
                    { href: "/analytics", icon: "📈", label: "Business Analytics" },
                    { href: "/orders", icon: "📦", label: "Orders" },
                    { href: "/wallet", icon: "💰", label: "Wallet & Withdrawals" },
                    { href: "/notifications", icon: "🔔", label: "Notifications", badge: unread },
                  ] as { href: string; icon: string; label: string; badge?: number }[]
                ).map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-blue-50"
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                    <span className="flex-1" />
                    {(item.badge ?? 0) > 0 && (
                      <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white">
                        {item.badge}
                      </span>
                    )}
                    <span className="text-sm text-gray-300">→</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* ── Column 3: Bank / Withdrawal Account ── */}
          <div className="space-y-4">
            <div className={CARD}>
              <Accordion type="single" collapsible defaultValue="bank-info">
                <AccordionItem value="bank-info" className="border-0">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
                    <AccordionTrigger className="flex-1 border-0 p-0 hover:no-underline">
                      <div className="text-left">
                        <span className="block text-sm font-bold text-gray-800">
                          🏦 Withdrawal Account
                        </span>
                        <span className="mt-0.5 text-xs text-gray-400">
                          Bank or mobile wallet for payouts
                        </span>
                      </div>
                    </AccordionTrigger>
                    <button
                      onClick={() => (editing === "bank" ? setEditing(null) : startEdit("bank"))}
                      className="android-press ml-3 min-h-0 flex-shrink-0 py-1 text-sm font-bold text-blue-500"
                    >
                      {editing === "bank" ? "Cancel" : "✏️ Edit"}
                    </button>
                  </div>
                  <AccordionContent className="pt-0 pb-0">
                    {editing === "bank" ? (
                      <div className="space-y-3 p-4">
                        <div>
                          <label className={LABEL}>Bank / Mobile Wallet *</label>
                          <select
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            className={SELECT}
                          >
                            <option value="">Select bank or wallet</option>
                            {BANKS.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={LABEL}>Account / Phone Number *</label>
                          <input
                            value={bankAccount}
                            onChange={(e) => setBankAccount(e.target.value)}
                            inputMode="numeric"
                            placeholder="03XX-XXXXXXX or IBAN"
                            className={INPUT}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>Account Holder Name *</label>
                          <input
                            value={bankAccountTitle}
                            onChange={(e) => setBankAccountTitle(e.target.value)}
                            placeholder="Full name as on account"
                            className={INPUT}
                          />
                        </div>
                        <div className="rounded-xl bg-amber-50 p-3">
                          <p className="text-xs font-medium text-amber-700">
                            ⚠️ Ensure details match your bank records. Incorrect info may delay
                            withdrawals.
                          </p>
                        </div>
                        <button
                          onClick={() => saveSection("bank")}
                          disabled={saving}
                          className={BTN_PRIMARY}
                        >
                          {saving ? "Saving..." : "✓ Save Account Details"}
                        </button>
                      </div>
                    ) : (
                      <div className="px-4 py-3">
                        {user?.bankName ? (
                          <>
                            <div className="mb-3 flex items-center gap-3 rounded-xl bg-blue-50 p-3.5">
                              <span className="text-2xl">
                                {user.bankName.includes("Easy")
                                  ? "📱"
                                  : user.bankName.includes("Jazz")
                                    ? "📱"
                                    : "🏦"}
                              </span>
                              <div>
                                <p className="text-sm font-bold text-gray-800">{user.bankName}</p>
                                <p className="mt-0.5 text-xs text-gray-500">{user.bankAccount}</p>
                                <p className="text-xs text-gray-500">{user.bankAccountTitle}</p>
                              </div>
                              <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                                ✓ Set
                              </span>
                            </div>
                            <InfoRow label="Bank" value={user.bankName} />
                            <InfoRow label="Account No." value={user.bankAccount} />
                            <InfoRow label="Account Title" value={user.bankAccountTitle} />
                          </>
                        ) : (
                          <div className="py-6 text-center">
                            <p className="mb-2 text-3xl">🏦</p>
                            <p className="text-sm font-bold text-gray-600">No account set</p>
                            <p className="mt-1 text-xs text-gray-400">
                              Add your bank account to receive withdrawals
                            </p>
                            <button
                              onClick={() => startEdit("bank")}
                              className="mt-3 rounded-xl bg-blue-50 px-4 py-2 text-sm font-bold text-blue-600"
                            >
                              + Add Account
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            {/* KYC Identity Verification */}
            <div className={CARD}>
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
                <div>
                  <p className="text-sm font-bold text-gray-800">🛡️ Identity Verification (KYC)</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Required for withdrawals &amp; advanced features
                  </p>
                </div>
                {user?.kycStatus === "verified" && (
                  <span className="flex-shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                    ✓ Verified
                  </span>
                )}
                {user?.kycStatus === "pending" && (
                  <span className="flex-shrink-0 animate-pulse rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
                    ⏳ Reviewing
                  </span>
                )}
                {user?.kycStatus === "rejected" && (
                  <span className="flex-shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-600">
                    ✗ Rejected
                  </span>
                )}
                {(!user?.kycStatus || user.kycStatus === "none") && (
                  <span className="flex-shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">
                    Not done
                  </span>
                )}
              </div>
              <div className="p-4">
                {user?.kycStatus === "verified" ? (
                  <div className="flex items-center gap-3 rounded-xl bg-green-50 p-3.5">
                    <span className="flex-shrink-0 text-2xl">✅</span>
                    <div>
                      <p className="text-sm font-bold text-green-800">Identity Verified</p>
                      <p className="mt-0.5 text-xs text-green-600">
                        Full access to all features is unlocked
                      </p>
                    </div>
                  </div>
                ) : user?.kycStatus === "pending" ? (
                  <div className="flex items-center gap-3 rounded-xl bg-blue-50 p-3.5">
                    <span className="flex-shrink-0 text-2xl">⏳</span>
                    <div>
                      <p className="text-sm font-bold text-blue-800">Under Review</p>
                      <p className="mt-0.5 text-xs text-blue-600">
                        Our team will review your documents within 24 hours
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {user?.kycStatus === "rejected" && kycData?.record?.rejectionReason && (
                      <div className="rounded-xl bg-red-50 p-3">
                        <p className="mb-0.5 text-xs font-bold text-red-700">Rejection Reason</p>
                        <p className="text-xs text-red-600">{kycData.record.rejectionReason}</p>
                      </div>
                    )}
                    <div className="space-y-1.5 rounded-xl bg-amber-50 p-3">
                      <p className="mb-1.5 text-xs font-bold text-amber-800">
                        Unlock after verification:
                      </p>
                      {[
                        "💸 Wallet withdrawals",
                        "📊 Business analytics",
                        "🏷️ Discount promotions",
                        "📢 Ad campaigns",
                      ].map((f) => (
                        <div key={f} className="flex items-center gap-2">
                          <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full bg-amber-200 text-[9px] font-bold text-amber-800">
                            ✓
                          </span>
                          <span className="text-xs text-amber-700">{f}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setKycModalOpen(true)}
                      className="h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-blue-600 text-sm font-bold text-white transition-opacity hover:opacity-95"
                    >
                      {user?.kycStatus === "rejected"
                        ? "🔄 Re-submit Verification"
                        : "🛡️ Start Identity Verification"}
                    </button>
                    <p className="text-center text-[10px] leading-relaxed text-gray-400">
                      Required by Pakistani regulations for payment processing. Your data is
                      encrypted and secure.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Business Documents */}
            {(() => {
              const u = user as unknown as Record<string, unknown> | undefined;
              const docs: { key: DocKey; label: string; desc: string; icon: string }[] = [
                {
                  key: "cnicFrontUrl",
                  label: "CNIC — Front Side",
                  desc: "National ID card front photo",
                  icon: "🪪",
                },
                {
                  key: "cnicBackUrl",
                  label: "CNIC — Back Side",
                  desc: "National ID card back photo",
                  icon: "🪪",
                },
                {
                  key: "businessDocUrl",
                  label: "Business Registration / NTN",
                  desc: "Company reg. or NTN certificate",
                  icon: "📄",
                },
              ];
              return (
                <div className={CARD}>
                  <Accordion type="single" collapsible defaultValue="docs">
                    <AccordionItem value="docs" className="border-0">
                      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
                        <AccordionTrigger className="flex-1 border-0 p-0 hover:no-underline">
                          <div className="text-left">
                            <span className="block text-sm font-bold text-gray-800">
                              📋 Business Documents
                            </span>
                            <span className="mt-0.5 text-xs text-gray-400">
                              CNIC photos &amp; business registration
                            </span>
                          </div>
                        </AccordionTrigger>
                        {docs.filter((d) => u?.[d.key]).length > 0 && (
                          <span className="ml-3 flex-shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                            {docs.filter((d) => u?.[d.key]).length}/{docs.length} uploaded
                          </span>
                        )}
                      </div>
                      <AccordionContent className="pt-0 pb-0">
                        <div className="space-y-4 p-4">
                          {docs.map((doc) => {
                            const url = u?.[doc.key] as string | undefined;
                            const busy = docUploading === doc.key;
                            return (
                              <div key={doc.key}>
                                <label className={LABEL}>
                                  {doc.icon} {doc.label}
                                </label>
                                <p className="mb-2 text-[10px] text-gray-400">{doc.desc}</p>
                                {url ? (
                                  <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                                    <img
                                      src={url}
                                      alt={doc.label}
                                      className="h-32 w-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = "none";
                                      }}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-colors group-hover:bg-black/30 group-hover:opacity-100">
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow"
                                      >
                                        View
                                      </a>
                                      <button
                                        onClick={() => removeDoc(doc.key)}
                                        className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white shadow"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                    <span className="absolute top-2 right-2 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
                                      ✓ Uploaded
                                    </span>
                                  </div>
                                ) : (
                                  <label
                                    className={`flex h-20 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors ${busy ? "border-orange-300 bg-blue-50" : "border-gray-200 hover:border-orange-300 hover:bg-blue-50"}`}
                                  >
                                    {busy ? (
                                      <span className="animate-pulse text-sm font-medium text-blue-500">
                                        Uploading…
                                      </span>
                                    ) : (
                                      <>
                                        <span className="text-xl">📤</span>
                                        <span className="text-sm font-medium text-gray-500">
                                          Tap to upload
                                        </span>
                                      </>
                                    )}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="sr-only"
                                      disabled={!!docUploading}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) {
                                          void uploadDoc(doc.key, f);
                                          e.target.value = "";
                                        }
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                            );
                          })}
                          <div className="rounded-xl bg-amber-50 p-3">
                            <p className="text-xs font-medium text-amber-700">
                              🔒 Documents are reviewed by admin for KYC verification. Use clear,
                              well-lit photos.
                            </p>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              );
            })()}

            {/* Payout Policy */}
            <Accordion type="single" collapsible>
              <AccordionItem
                value="payout-policy"
                className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-orange-50 to-amber-50"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <span className="text-sm font-bold text-orange-700">💡 Payout Policy</span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 px-4 pb-1">
                    {[
                      {
                        icon: "✅",
                        text: `${Math.round(100 - (config.finance.vendorCommissionPct ?? 15))}% earnings — ${config.finance.vendorCommissionPct ?? 15}% platform fee`,
                      },
                      {
                        icon: "💸",
                        text: `Minimum withdrawal: ${currencySymbol} ${config.vendor.minPayout}`,
                      },
                      {
                        icon: "⏱️",
                        text: `Processed in ${config.wallet?.withdrawalProcessingDays ? `${config.wallet.withdrawalProcessingDays} business day${config.wallet.withdrawalProcessingDays === 1 ? "" : "s"}` : "24–48 hours"} by admin`,
                      },
                      { icon: "🔒", text: "CNIC verification required for large withdrawals" },
                    ].map((p, i) => (
                      <div key={i} className="flex gap-2 text-xs text-orange-700">
                        <span className="flex-shrink-0">{p.icon}</span>
                        <span>{p.text}</span>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* AJKMart Vendor Agreement + Links */}
            <div className="space-y-3 rounded-2xl bg-gray-100 p-4">
              <p className="text-center text-xs leading-relaxed text-gray-500">
                By using {config.platform.appName} Vendor Portal, you agree to our vendor terms. For
                support:{" "}
                <a href={`tel:${config.platform.supportPhone}`} className="font-bold text-blue-500">
                  {config.platform.supportPhone}
                </a>
              </p>
              {config.platform.supportHours && (
                <p className="text-center text-xs text-gray-400">
                  ⏰ {config.platform.supportHours}
                </p>
              )}
              {config.platform.supportEmail && (
                <p className="text-center text-xs text-gray-500">
                  ✉️{" "}
                  <a
                    href={`mailto:${config.platform.supportEmail}`}
                    className="text-blue-500 hover:text-orange-700"
                  >
                    {config.platform.supportEmail}
                  </a>
                </p>
              )}
              {(config.platform.socialFacebook || config.platform.socialInstagram) && (
                <div className="flex justify-center gap-3">
                  {config.platform.socialFacebook && (
                    <a
                      href={config.platform.socialFacebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      📘 Facebook
                    </a>
                  )}
                  {config.platform.socialInstagram && (
                    <a
                      href={config.platform.socialInstagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-pink-600 hover:text-pink-800"
                    >
                      📸 Instagram
                    </a>
                  )}
                </div>
              )}
              {(config.content.tncUrl ||
                config.content.privacyUrl ||
                config.content.refundPolicyUrl ||
                config.content.faqUrl ||
                config.content.aboutUrl ||
                config.features.chat) && (
                <div className="flex flex-wrap justify-center gap-2">
                  {config.content.tncUrl && (
                    <a
                      href={config.content.tncUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 underline underline-offset-2 transition-colors hover:text-orange-800"
                    >
                      📋 Terms of Service
                    </a>
                  )}
                  {config.content.privacyUrl && (
                    <a
                      href={config.content.privacyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 underline underline-offset-2 transition-colors hover:text-orange-800"
                    >
                      🔒 Privacy Policy
                    </a>
                  )}
                  {config.content.refundPolicyUrl && (
                    <a
                      href={config.content.refundPolicyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 underline underline-offset-2 transition-colors hover:text-orange-800"
                    >
                      ↩️ Refund Policy
                    </a>
                  )}
                  {config.content.faqUrl && (
                    <a
                      href={config.content.faqUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 underline underline-offset-2 transition-colors hover:text-orange-800"
                    >
                      ❓ Help & FAQs
                    </a>
                  )}
                  {config.content.aboutUrl && (
                    <a
                      href={config.content.aboutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 underline underline-offset-2 transition-colors hover:text-orange-800"
                    >
                      ℹ️ About Us
                    </a>
                  )}
                  {config.features.chat && (
                    <a
                      href={`https://wa.me/${config.platform.supportPhone.replace(/^0/, "92")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-600 underline underline-offset-2 transition-colors hover:text-green-800"
                    >
                      💬 {config.content.supportMsg || "Live Support"}
                    </a>
                  )}
                </div>
              )}
              <p className="text-center text-xs text-gray-400">{config.platform.businessAddress}</p>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div
          className="toast-in fixed top-0 right-0 left-0 z-50 flex justify-center"
          style={{
            paddingTop: "calc(env(safe-area-inset-top,0px) + 8px)",
            paddingLeft: "16px",
            paddingRight: "16px",
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 px-5 py-3 text-center text-sm font-semibold text-white shadow-2xl">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
