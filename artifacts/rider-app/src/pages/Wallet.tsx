import { createLogger } from "@/lib/logger";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency as _sharedFcW } from "@workspace/api-zod";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PullToRefresh } from "../components/PullToRefresh";
import { ErrorState } from "../components/ui/ErrorState";
import WithdrawModal from "../components/wallet/WithdrawModal";
import { api } from "../lib/api";
import { useAuth } from "../lib/rider-auth";
import { formatDateTz, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
const log = createLogger("[Wallet]");
/* W3: Each wallet modal owns its own state and is conditionally mounted —
   we ensure that flipping `showWithdraw`/`showDeposit`/`showRemittance` to
   false unmounts the modal so its `useState` defaults reset on next open.
   The render below already does this via `{showWithdraw && <WithdrawModal …>}`
   guards, so reopening the modal yields a fresh instance with empty inputs. */
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  BarChart3,
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  Gift,
  Heart,
  Landmark,
  Lock,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
  Wallet2,
  XCircle,
} from "lucide-react";
import DepositModal from "../components/wallet/DepositModal";
import RemittanceModal from "../components/wallet/RemittanceModal";

const fc = (n: string | number | null | undefined, currencySymbol = "Rs.") =>
  _sharedFcW(n != null ? String(n) : (n as null | undefined), currencySymbol);
const fd = (d: string | Date, tz?: string) =>
  formatDateTz(
    d,
    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
    tz ?? "Asia/Karachi"
  );
const fdr = (d: string | Date) => {
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
function dateGroupLabel(d: string): string {
  const now = new Date();
  const dt = new Date(d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dt >= today) return "today_group";
  if (dt >= yesterday) return "yesterday_group";
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  if (dt >= weekAgo) return "thisWeek_group";
  return dt.toLocaleDateString("en-PK", { month: "long", year: "numeric" });
}
function TxIcon({ type }: { type: string }) {
  const base = "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0";
  if (type === "credit")
    return (
      <div className={`${base} bg-green-50`}>
        <TrendingUp size={18} className="text-green-600" />
      </div>
    );
  if (type === "bonus")
    return (
      <div className={`${base} bg-blue-50`}>
        <Gift size={18} className="text-blue-600" />
      </div>
    );
  if (type === "loyalty")
    return (
      <div className={`${base} bg-purple-50`}>
        <Star size={18} className="text-purple-600" />
      </div>
    );
  if (type === "cashback")
    return (
      <div className={`${base} bg-pink-50`}>
        <Heart size={18} className="text-pink-600" />
      </div>
    );
  if (type === "platform_fee")
    return (
      <div className={`${base} bg-orange-50`}>
        <Building2 size={18} className="text-orange-500" />
      </div>
    );
  if (type === "deposit")
    return (
      <div className={`${base} bg-teal-50`}>
        <ArrowDownToLine size={18} className="text-teal-600" />
      </div>
    );
  if (type === "cod_remittance")
    return (
      <div className={`${base} bg-blue-50`}>
        <Banknote size={18} className="text-blue-600" />
      </div>
    );
  if (type === "cash_collection")
    return (
      <div className={`${base} bg-blue-50`}>
        <Banknote size={18} className="text-blue-400" />
      </div>
    );
  return (
    <div className={`${base} bg-red-50`}>
      <ArrowUpFromLine size={18} className="text-red-500" />
    </div>
  );
}

function txMeta(type: string) {
  if (type === "credit")
    return { labelKey: "earnings" as TranslationKey, badge: "bg-green-100 text-green-700" };
  if (type === "bonus")
    return { labelKey: "bonus" as TranslationKey, badge: "bg-blue-100 text-blue-700" };
  if (type === "loyalty")
    return { labelKey: "loyalty" as TranslationKey, badge: "bg-purple-100 text-purple-700" };
  if (type === "cashback")
    return { labelKey: "cashback" as TranslationKey, badge: "bg-pink-100 text-pink-700" };
  if (type === "platform_fee")
    return { labelKey: "platformFare" as TranslationKey, badge: "bg-orange-100 text-orange-700" };
  if (type === "deposit")
    return { labelKey: "deposit" as TranslationKey, badge: "bg-teal-100 text-teal-700" };
  if (type === "cod_remittance")
    return { labelKey: "remittanceLabel" as TranslationKey, badge: "bg-blue-100 text-blue-700" };
  if (type === "cash_collection")
    return { labelKey: "collected" as TranslationKey, badge: "bg-blue-100 text-blue-600" };
  return { labelKey: "withdraw" as TranslationKey, badge: "bg-red-100 text-red-600" };
}

function MethodIcon({ method }: { method: string | null }) {
  if (!method) return <Landmark size={16} className="text-blue-500" />;
  const m = method.toLowerCase();
  if (m.includes("jazzcash")) return <Smartphone size={16} className="text-red-500" />;
  if (m.includes("easypaisa")) return <Smartphone size={16} className="text-green-500" />;
  return <Landmark size={16} className="text-blue-500" />;
}

function EarningsChart({ transactions }: { transactions: WalletTx[] }) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { config: chartConfig } = usePlatformConfig();
  const chartCurrency = chartConfig.platform.currencySymbol ?? "Rs.";
  const days = useMemo(() => {
    const result: { label: string; amount: number; date: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const earned = transactions
        .filter(
          (t) => t.type === "credit" && new Date(t.createdAt) >= d && new Date(t.createdAt) < next
        )
        .reduce((s, t) => s + Number(t.amount), 0);
      result.push({
        label: i === 0 ? T("today") : d.toLocaleDateString("en-PK", { weekday: "short" }),
        amount: earned,
        date: d.toLocaleDateString("en-PK", { day: "numeric", month: "short" }),
      });
    }
    return result;
  }, [transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxVal = Math.max(...days.map((d) => d.amount), 1);
  const weekTotal = days.reduce((s, d) => s + d.amount, 0);
  const bestIdx = days.reduce((best, d, i) => (d.amount > days[best].amount ? i : best), 0);

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-gray-400" />
          <p className="text-sm font-bold text-gray-800">{T("sevenDayEarnings")}</p>
        </div>
        <p className="text-base font-black text-green-600">{fc(weekTotal, chartCurrency)}</p>
      </div>
      <div className="flex h-20 items-end gap-3">
        {days.map((d, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-end justify-center" style={{ height: 56 }}>
              <div
                className={`w-full max-w-[20px] rounded-md transition-all duration-500 ${
                  i === bestIdx ? "bg-green-500" : "bg-gray-100"
                }`}
                style={{ height: Math.max((d.amount / maxVal) * 56, d.amount > 0 ? 4 : 2) }}
                title={`${d.date}: ${fc(d.amount, chartCurrency)}`}
              />
            </div>
            <p
              className={`text-[9px] font-semibold ${i === bestIdx ? "text-green-600" : "text-gray-300"}`}
            >
              {d.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingRequestCard({ tx }: { tx: WalletTx }) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { config: cardConfig } = usePlatformConfig();
  const cardCurrency = cardConfig.platform.currencySymbol ?? "Rs.";
  const parsed = (() => {
    const parts = (tx.description || "").replace("Withdrawal — ", "").split(" · ");
    return {
      bank: parts[0] || "—",
      account: parts[1] || "—",
      title: parts[2] || "—",
      note: parts[3] || "",
    };
  })();

  const ref = tx.reference ?? "pending";
  const status =
    ref === "pending"
      ? "pending"
      : ref.startsWith("paid:")
        ? "paid"
        : ref.startsWith("rejected:")
          ? "rejected"
          : "pending";
  const refNo = ref.startsWith("paid:")
    ? ref.slice(5)
    : ref.startsWith("rejected:")
      ? ref.slice(9)
      : "";

  const statusConfig = {
    pending: {
      label: T("processing"),
      icon: <Clock size={11} />,
      bg: "bg-amber-50",
      border: "border-amber-200",
      badge: "bg-amber-100 text-amber-700",
      dot: "bg-amber-400",
    },
    paid: {
      label: T("paid"),
      icon: <CheckCircle size={11} />,
      bg: "bg-green-50",
      border: "border-green-200",
      badge: "bg-green-100 text-green-700",
      dot: "bg-green-400",
    },
    rejected: {
      label: T("rejected"),
      icon: <XCircle size={11} />,
      bg: "bg-red-50",
      border: "border-red-200",
      badge: "bg-red-100 text-red-600",
      dot: "bg-red-400",
    },
  }[status] ?? {
    label: T("processing"),
    icon: <Clock size={11} />,
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-400",
  };

  return (
    <div className={`${statusConfig.bg} border ${statusConfig.border} rounded-2xl p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
            <MethodIcon method={tx.paymentMethod || parsed.bank} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-gray-900">{parsed.bank}</p>
            <p className="mt-0.5 font-mono text-xs text-gray-500">{parsed.account}</p>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-lg font-black text-gray-900">{fc(Number(tx.amount), cardCurrency)}</p>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusConfig.badge} inline-flex items-center gap-1`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot} ${status === "pending" ? "animate-pulse" : ""}`}
            />
            {statusConfig.icon} {statusConfig.label}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/60 pt-3">
        <p className="text-[10px] text-gray-500">
          {fd(tx.createdAt)} · {fdr(tx.createdAt)}
        </p>
        {refNo && <p className="text-[10px] font-bold text-gray-600">Ref: {refNo}</p>}
      </div>
      {status === "rejected" && refNo && (
        <div className="mt-2 rounded-xl bg-white/70 px-3 py-2">
          <p className="text-xs font-medium text-red-600">
            {T("reason")}: {refNo}
          </p>
          <p className="mt-0.5 text-[10px] text-red-500">{T("amountRefunded")}</p>
        </div>
      )}
      {status === "pending" && (
        <p className="mt-2 text-[10px] font-medium text-amber-600">{T("adminProcess24h")}</p>
      )}
    </div>
  );
}

type WalletTx = {
  id: string;
  type: string;
  amount: string | number;
  description?: string;
  reference?: string;
  createdAt: string;
  paymentMethod?: string;
};

type TxFilter = "all" | "credit" | "debit" | "bonus" | "fees";

function SkeletonWallet() {
  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <div
        className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
      >
        <div className="absolute top-0 right-0 h-64 w-64 translate-x-1/3 -translate-y-1/2 rounded-full bg-white/[0.03]" />
        <div className="absolute bottom-0 left-0 h-44 w-44 -translate-x-1/4 translate-y-1/2 rounded-full bg-white/[0.02]" />
        <div className="relative">
          <div className="mb-6 flex animate-pulse items-center justify-between">
            <div className="h-3 w-24 rounded bg-white/10" />
            <div className="h-8 w-8 rounded-full bg-white/5" />
          </div>
          <div className="mb-6 h-12 w-52 animate-pulse rounded-xl bg-white/10" />
          <div className="mb-5 flex animate-pulse gap-3">
            <div className="h-16 flex-1 rounded-2xl bg-white/5" />
            <div className="h-16 flex-1 rounded-2xl bg-white/5" />
            <div className="h-16 flex-1 rounded-2xl bg-white/5" />
          </div>
          <div className="flex animate-pulse gap-3">
            <div className="h-13 flex-1 rounded-2xl bg-white/15" />
            <div className="h-13 flex-1 rounded-2xl bg-white/10" />
          </div>
        </div>
      </div>
      <div className="-mt-4 space-y-4 px-5 py-5">
        <div className="animate-pulse rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 h-4 w-32 rounded bg-gray-200" />
          <div className="flex h-20 items-end gap-3">
            {[20, 35, 15, 45, 30, 50, 25].map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full max-w-[20px] rounded-md bg-gray-100"
                  style={{ height: `${h}px` }}
                />
                <div className="h-2 w-4 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Wallet() {
  const { user, refreshUser } = useAuth();
  const { config } = usePlatformConfig();
  const currency = config.platform.currencySymbol ?? "Rs.";
  const tz = config.regional?.timezone ?? "Asia/Karachi";
  const _fd = (d: string | Date) =>
    formatDateTz(d, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, tz);
  const riderKeepPct = config.rider?.keepPct ?? config.finance.riderEarningPct;
  const minPayout = config.rider?.minPayout ?? config.finance.minRiderPayout;
  const maxPayout = config.rider?.maxPayout ?? 0;
  const withdrawalEnabled = config.rider?.withdrawalEnabled !== false;
  const depositEnabled = config.rider?.depositEnabled !== false;
  const minBalanceFallback = config.rider?.minBalance ?? 0;
  const procDays = config.wallet?.withdrawalProcessingDays ?? 2;
  const qc = useQueryClient();

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showRemittance, setShowRemittance] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [filter, setFilter] = useState<TxFilter>("all");
  const [showRequests, setShowRequests] = useState(true);
  const [showCodHistory, setShowCodHistory] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* W2: sentinel observed at the bottom of the transactions list to trigger
     fetchNextPage. Kept as a ref so the IntersectionObserver re-binds only
     when the sentinel mounts/unmounts, not on every render. */
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  /* W2: Cursor-paginated wallet history with infinite scroll. The first page
     also carries the canonical `balance`. Subsequent pages append to the
     visible list; the IntersectionObserver below auto-loads the next page
     when the sentinel scrolls into view. */
  const PAGE_SIZE = 50;
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["rider-wallet"],
      queryFn: ({ pageParam }) =>
        api.getWalletPage({ cursor: pageParam ?? null, limit: PAGE_SIZE }),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage?.nextCursor ?? null,
      staleTime: 30_000,
      refetchInterval: 30000,
      enabled: config.features.wallet,
    });

  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const FILTER_TABS_LOCAL = [
    { key: "all" as TxFilter, label: T("all") },
    { key: "credit" as TxFilter, label: T("earnings") },
    { key: "debit" as TxFilter, label: T("withdraw") },
    { key: "bonus" as TxFilter, label: T("bonus" as TranslationKey) },
    { key: "fees" as TxFilter, label: T("platformFare") },
  ];

  const resolveGroupLabel = (g: string) => {
    if (g === "today_group") return T("today");
    if (g === "yesterday_group") return T("yesterday");
    if (g === "thisWeek_group") return T("thisWeek");
    return g;
  };

  const { data: codData, refetch: refetchCod } = useQuery({
    queryKey: ["rider-cod"],
    queryFn: () => api.getCodSummary(),
    refetchInterval: 30000,
    enabled: config.features.wallet,
  });

  const [showDeposits, setShowDeposits] = useState(false);
  const { data: depositsData, refetch: refetchDeposits } = useQuery({
    queryKey: ["rider-deposits"],
    queryFn: () => api.getDeposits(),
    enabled: showDeposits && config.features.wallet,
    staleTime: 30000,
  });

  /* Live minBalance: fetched eagerly so DepositModal always shows the admin-configured value,
     not the potentially-stale value baked into the platform config response. */
  const { data: minBalanceData } = useQuery({
    queryKey: ["rider-min-balance"],
    queryFn: () => api.getMinBalance(),
    staleTime: 60000,
    enabled: config.features.wallet,
  });
  const minBalance = (minBalanceData?.minBalance ?? minBalanceFallback) as number;

  /* W2: Flatten paged results into a single transactions array. Balance is
     authoritative on the FIRST page only (each subsequent page also returns
     the live balance, but using the first page avoids tiny flicker as later
     pages stream in). Aggregates below (today/week/total) sum the loaded
     pages — same behaviour as before, but now extends as the rider scrolls. */
  const pages = data?.pages ?? []; // eslint-disable-line react-hooks/exhaustive-deps
  const transactions: WalletTx[] = useMemo(() => {
    const out: WalletTx[] = [];
    for (const p of pages) {
      const items = (p?.items ?? []) as WalletTx[];
      for (const it of items) out.push(it);
    }
    return out;
  }, [pages]);
  const balanceFromServer = pages[0]?.balance;
  const balance = balanceFromServer ?? "0";
  const balanceNum = balanceFromServer != null ? Number(balanceFromServer) : 0;
  const isBalanceStale = false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const todayEarned = transactions
    .filter((t) => t.type === "credit" && new Date(t.createdAt) >= today)
    .reduce((s, t) => s + Number(t.amount), 0);
  const weekEarned = transactions
    .filter((t) => t.type === "credit" && new Date(t.createdAt) >= weekAgo)
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalEarned = transactions
    .filter((t) => t.type === "credit" || t.type === "bonus")
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalWithdrawn = transactions
    .filter((t) => t.type === "debit" && !t.reference?.startsWith("refund:"))
    .reduce((s, t) => s + Number(t.amount), 0);
  const promoBalance = useMemo(
    () =>
      transactions
        .filter((t) => ["bonus", "cashback", "loyalty"].includes(t.type))
        .reduce((s, t) => s + Math.max(0, Number(t.amount)), 0),
    [transactions]
  );

  const withdrawalRequests = transactions.filter(
    (t) =>
      t.type === "debit" &&
      t.description?.startsWith("Withdrawal") &&
      !t.reference?.startsWith("refund:")
  );
  const pendingRequests = withdrawalRequests.filter(
    (t) => !t.reference || t.reference === "pending"
  );
  const pendingAmt = pendingRequests.reduce((s, t) => s + Number(t.amount), 0);

  const codNetOwed = codData?.netOwed ?? 0;
  const codCollected = codData?.totalCollected ?? 0;
  const codVerified = codData?.totalVerified ?? 0;
  const codOrderCount = codData?.codOrderCount ?? 0;
  const codRemittances: WalletTx[] = codData?.remittances ?? [];
  const codPending = codRemittances.filter(
    (r) => !r.reference || r.reference === "pending" || r.reference == null
  );

  const filtered = useMemo(() => {
    if (filter === "all") return transactions;
    if (filter === "bonus")
      return transactions.filter(
        (t) => t.type === "bonus" || t.type === "loyalty" || t.type === "cashback"
      );
    if (filter === "fees") return transactions.filter((t) => t.type === "platform_fee");
    if (filter === "debit") return transactions.filter((t) => t.type === "debit");
    return transactions.filter((t) => t.type === filter);
  }, [filter, transactions]);

  const groupedTx = useMemo(() => {
    const groups: { label: string; items: WalletTx[] }[] = [];
    const groupMap = new Map<string, WalletTx[]>();
    for (const t of filtered) {
      const g = dateGroupLabel(t.createdAt);
      if (!groupMap.has(g)) {
        const items: WalletTx[] = [];
        groupMap.set(g, items);
        groups.push({ label: g, items });
      }
      groupMap.get(g)?.push(t);
    }
    return groups;
  }, [filtered]);

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["rider-wallet"] }),
      qc.invalidateQueries({ queryKey: ["rider-cod"] }),
    ]);
  }, [qc]);

  /* W2: Auto-load next page when the sentinel scrolls into view. We re-bind
     the observer whenever `hasNextPage` flips so that once we exhaust the
     dataset we stop spending CPU on intersection callbacks. */
  useEffect(() => {
    if (!hasNextPage) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !isFetchingNextPage) {
            void fetchNextPage();
            break;
          }
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return <SkeletonWallet />;
  }

  if (isError) {
    return (
      <div className="flex min-h-screen flex-col bg-[#F5F6F8]">
        <div
          className="rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-10"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
        >
          <p className="mb-1 text-xs font-semibold tracking-widest text-white/40 uppercase">
            {T("walletBalance")}
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">{T("wallet")}</h1>
        </div>
        <div className="-mt-4 flex flex-1 items-center justify-center">
          <ErrorState
            title={T("somethingWentWrong")}
            subtitle={T("checkInternetRetry")}
            onRetry={() => refetch()}
            retryLabel={T("retry")}
          />
        </div>
      </div>
    );
  }

  if (!config.features.wallet) {
    return (
      <div className="min-h-screen bg-[#F5F6F8]">
        <div
          className="rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-10"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
        >
          <p className="text-xs font-semibold tracking-widest text-white/40 uppercase">
            {T("wallet")}
          </p>
        </div>
        <div className="-mt-4 px-5">
          <div className="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50">
              <Lock size={32} className="text-gray-300" />
            </div>
            <h3 className="mb-2 text-lg font-black text-gray-900">{T("walletDisabled")}</h3>
            <p className="text-sm text-gray-400">{T("withdrawalsDisabled")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="min-h-screen bg-[#F5F6F8]">
      <div
        className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
      >
        <div className="absolute top-0 right-0 h-72 w-72 translate-x-1/3 -translate-y-1/2 rounded-full bg-green-500/[0.04]" />
        <div className="absolute bottom-0 left-0 h-48 w-48 -translate-x-1/4 translate-y-1/2 rounded-full bg-white/[0.02]" />
        <div className="absolute top-1/2 right-8 h-24 w-24 rounded-full bg-emerald-500/[0.03]" />

        <div className="relative">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold tracking-widest text-white/40 uppercase">
                {T("availableBalance")}
              </p>
            </div>
            <button
              onClick={() => setBalanceHidden((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 transition-colors active:bg-white/10"
            >
              {balanceHidden ? (
                <EyeOff size={13} className="text-white/40" />
              ) : (
                <Eye size={13} className="text-white/40" />
              )}
            </button>
          </div>

          <div className="mb-1 flex items-end gap-3">
            <p className="text-[42px] leading-none font-black tracking-tight text-white">
              {balanceHidden ? (
                "••••••"
              ) : isLoading ? (
                <span className="animate-pulse text-[28px] text-white/40">loading...</span>
              ) : (
                fc(balance, currency)
              )}
            </p>
            {isBalanceStale && !balanceHidden && (
              <div className="mb-2 flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5">
                <AlertTriangle size={9} className="text-amber-400" />
                <span className="text-[9px] font-bold text-amber-400">cached</span>
              </div>
            )}
          </div>

          <div className="mb-5 flex items-center gap-2">
            {user?.isOnline && (
              <div className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                <span className="text-[9px] font-bold text-green-400">
                  {T("online" as TranslationKey)}
                </span>
              </div>
            )}
            {pendingAmt > 0 && (
              <div className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5">
                <Clock size={9} className="text-amber-400" />
                <span className="text-[9px] font-bold text-amber-400">
                  {fc(pendingAmt, currency)} {T("pending")}
                </span>
              </div>
            )}
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] px-3 py-2.5 backdrop-blur-sm">
              <p className="text-[9px] font-bold tracking-wider text-white/30 uppercase">
                {T("earnedToday")}
              </p>
              <p className="mt-0.5 text-sm font-black text-green-400">
                {balanceHidden ? "••••" : fc(todayEarned, currency)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] px-3 py-2.5 backdrop-blur-sm">
              <p className="text-[9px] font-bold tracking-wider text-white/30 uppercase">
                {T("yourShare" as TranslationKey)}
              </p>
              <p className="mt-0.5 text-sm font-black text-white">{riderKeepPct}%</p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] px-3 py-2.5 backdrop-blur-sm">
              <p className="text-[9px] font-bold tracking-wider text-white/30 uppercase">
                {T("totalWithdrawn")}
              </p>
              <p className="mt-0.5 text-sm font-black text-red-400">
                {fc(totalWithdrawn, currency)}
              </p>
            </div>
          </div>

          {promoBalance > 0 && (
            <div className="mb-5 flex items-center justify-between rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-600/25 to-indigo-600/20 px-4 py-3.5 backdrop-blur-sm">
              <div>
                <p className="flex items-center gap-1 text-[9px] font-bold tracking-wider text-purple-300 uppercase">
                  <Sparkles size={9} /> Promo Balance
                </p>
                <p className="mt-0.5 text-xl font-black text-white">
                  {balanceHidden ? "••••" : fc(promoBalance, currency)}
                </p>
                <p className="mt-0.5 text-[9px] text-white/30">Bonuses · Cashback · Loyalty</p>
              </div>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-purple-400/20 bg-purple-500/20">
                <Sparkles size={16} className="text-purple-300" />
              </div>
            </div>
          )}

          {minBalance > 0 && balanceNum < minBalance && (
            <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-amber-500/15 bg-amber-500/15 px-3.5 py-2.5">
              <AlertTriangle size={14} className="flex-shrink-0 text-amber-400" />
              <div>
                <p className="text-xs font-bold text-amber-300">
                  {T("cashMinBalance")}: {fc(minBalance, currency)}
                </p>
                <p className="text-[10px] text-amber-400/60">
                  {currency} {Math.round(minBalance - balanceNum)} {T("moreNeeded")}
                </p>
              </div>
            </div>
          )}

          {procDays > 0 && (
            <p className="mb-3 flex items-center gap-1.5 text-[10px] text-white/25">
              <Clock size={9} className="text-white/25" />
              {T("walletProcessingTime")}: {procDays * 24}–{procDays * 24 + 24}h
            </p>
          )}

          {(() => {
            const kycRequired = config.wallet?.kycRequired === true;
            const kycVerified = (user as { kycStatus?: string } | null)?.kycStatus === "verified";
            const hasBankInfo = !!(user?.bankName && user?.bankAccount);
            const kycBlocked = kycRequired && !kycVerified;
            const bankBlocked = !hasBankInfo;

            return (
              <>
                {/* Bank info gate */}
                {bankBlocked && withdrawalEnabled && (
                  <div className="mb-3 flex items-start gap-2.5 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-3.5 py-3">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
                    <div>
                      <p className="text-xs font-bold text-amber-300">Bank account required</p>
                      <p className="mt-0.5 text-[10px] text-amber-400/70">
                        Add your bank details in Profile → Bank tab to enable withdrawals.
                      </p>
                    </div>
                  </div>
                )}

                {/* KYC gate */}
                {kycBlocked && withdrawalEnabled && (
                  <div className="mb-3 flex items-start gap-2.5 rounded-2xl border border-blue-500/20 bg-blue-500/15 px-3.5 py-3">
                    <ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-blue-400" />
                    <div>
                      <p className="text-xs font-bold text-blue-300">KYC verification required</p>
                      <p className="mt-0.5 text-[10px] text-blue-400/70">
                        Your documents must be verified before withdrawing. Status:{" "}
                        <span className="font-semibold capitalize">
                          {(user as { kycStatus?: string } | null)?.kycStatus ?? "none"}
                        </span>
                        .
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2.5">
                  {withdrawalEnabled && !kycBlocked && !bankBlocked ? (
                    <button
                      onClick={() => setShowWithdraw(true)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-black text-gray-900 shadow-lg shadow-white/10 transition-all active:bg-gray-100"
                    >
                      <ArrowUpFromLine size={15} /> {T("withdraw")}
                    </button>
                  ) : withdrawalEnabled ? (
                    <button
                      disabled
                      className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 py-3.5 text-sm font-bold text-white/40"
                    >
                      <Lock size={14} />{" "}
                      {bankBlocked
                        ? "Add Bank Info"
                        : kycBlocked
                          ? "KYC Required"
                          : T("withdrawalsPaused")}
                    </button>
                  ) : (
                    <button
                      disabled
                      className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 py-3.5 text-sm font-bold text-white/40"
                    >
                      <Lock size={14} /> {T("withdrawalsPaused")}
                    </button>
                  )}
                  {depositEnabled && (
                    <button
                      onClick={() => setShowDeposit(true)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/10 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition-all active:bg-white/15"
                    >
                      <ArrowDownToLine size={15} /> {T("deposit")}
                    </button>
                  )}
                </div>

                {!withdrawalEnabled && (
                  <div className="mt-3 flex items-center gap-2 rounded-2xl border border-red-500/15 bg-red-500/15 px-3 py-2">
                    <XCircle size={12} className="flex-shrink-0 text-red-400" />
                    <p className="text-[10px] font-medium text-red-300">
                      {T("withdrawalsDisabled")}
                    </p>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      <div className="-mt-3 space-y-4 px-5 py-5">
        <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            {[
              {
                label: T("earnedToday"),
                value: fc(todayEarned, currency),
                color: "text-emerald-600",
                icon: <TrendingUp size={13} className="text-emerald-500" />,
              },
              {
                label: T("earnedThisWeek"),
                value: fc(weekEarned, currency),
                color: "text-blue-600",
                icon: <BarChart3 size={13} className="text-blue-500" />,
              },
              {
                label: T("totalEarned"),
                value: fc(totalEarned, currency),
                color: "text-violet-600",
                icon: <Wallet2 size={13} className="text-violet-500" />,
              },
            ].map((s, i) => (
              <div
                key={s.label}
                className={`text-center ${i === 0 ? "pr-3" : i === 2 ? "pl-3" : "px-3"}`}
              >
                <div className="mb-1 flex items-center justify-center gap-1">{s.icon}</div>
                <p className={`text-sm font-black ${s.color}`}>{s.value}</p>
                <p className="mt-0.5 text-[9px] leading-tight font-semibold text-gray-400">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <EarningsChart transactions={transactions} />

        {codOrderCount > 0 && (
          <div
            className={`overflow-hidden rounded-3xl border shadow-sm ${codNetOwed > 0 ? "border-blue-100 bg-white" : "border-green-100 bg-white"}`}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl ${codNetOwed > 0 ? "bg-blue-50" : "bg-green-50"}`}
                >
                  <Banknote
                    size={20}
                    className={codNetOwed > 0 ? "text-blue-600" : "text-green-600"}
                  />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{T("codCashBalance")}</p>
                  <p className="text-[10px] text-gray-400">{T("cashOnDelivery")}</p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={`text-xl font-black ${codNetOwed > 0 ? "text-blue-600" : "text-green-600"}`}
                >
                  {fc(codNetOwed, currency)}
                </p>
                <p className="flex items-center justify-end gap-1 text-[10px] text-gray-400">
                  {codNetOwed > 0 ? (
                    T("remitCodCashBtn")
                  ) : (
                    <>
                      <CheckCircle size={10} className="text-green-500" /> {T("allClear")}
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-gray-50 px-5 pt-3 pb-3 text-center">
              <div className="rounded-xl bg-gray-50 py-2">
                <p className="text-xs font-black text-gray-800">{fc(codCollected, currency)}</p>
                <p className="text-[9px] font-medium text-gray-400">{T("collected")}</p>
              </div>
              <div className="rounded-xl bg-gray-50 py-2">
                <p className="text-xs font-black text-green-600">{fc(codVerified, currency)}</p>
                <p className="text-[9px] font-medium text-gray-400">{T("verified")}</p>
              </div>
              <div className="rounded-xl bg-gray-50 py-2">
                <p
                  className={`text-xs font-black ${codNetOwed > 0 ? "text-blue-600" : "text-gray-400"}`}
                >
                  {fc(codNetOwed, currency)}
                </p>
                <p className="text-[9px] font-medium text-gray-400">{T("owed")}</p>
              </div>
            </div>

            {codPending.length > 0 && (
              <div className="mx-5 mb-3 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                <div className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-amber-400" />
                <p className="text-xs font-semibold text-amber-700">
                  {codPending.length} {T("remitPending")}
                </p>
              </div>
            )}

            <div className="flex gap-2 px-5 pb-4">
              {codNetOwed > 0 && (
                <button
                  onClick={() => setShowRemittance(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gray-900 py-3 text-sm font-black text-white transition-colors active:bg-gray-800"
                >
                  <Banknote size={16} /> {T("remitCodCashBtn")}
                </button>
              )}
              <button
                onClick={() => setShowCodHistory(!showCodHistory)}
                className={`${codNetOwed > 0 ? "w-auto px-4" : "flex-1"} flex items-center justify-center gap-1.5 rounded-2xl border border-gray-100 bg-gray-50 py-3 text-sm font-bold text-gray-600 transition-colors active:bg-gray-100`}
              >
                {showCodHistory ? (
                  <>
                    <ChevronUp size={14} /> {T("hide")}
                  </>
                ) : (
                  T("history")
                )}
              </button>
            </div>

            {showCodHistory && codRemittances.length > 0 && (
              <div className="divide-y divide-gray-50 border-t border-gray-100">
                {codRemittances.map((r) => {
                  const ref = r.reference ?? "pending";
                  const st =
                    ref === "pending"
                      ? "pending"
                      : ref.startsWith("verified:")
                        ? "verified"
                        : ref.startsWith("rejected:")
                          ? "rejected"
                          : "pending";
                  const stBadge =
                    st === "pending"
                      ? "bg-amber-100 text-amber-700"
                      : st === "verified"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-600";
                  const stIcon =
                    st === "pending" ? (
                      <Clock size={10} />
                    ) : st === "verified" ? (
                      <CheckCircle size={10} />
                    ) : (
                      <XCircle size={10} />
                    );
                  const stLabel =
                    st === "pending"
                      ? T("pending")
                      : st === "verified"
                        ? T("verified")
                        : T("rejected");
                  const parts = (r.description || "").replace("COD Remittance — ", "").split(" · ");
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50">
                        <Banknote size={16} className="text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800">
                          {parts[0] || "Remittance"}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <p className="text-[10px] text-gray-400">
                            {new Date(r.createdAt).toLocaleDateString("en-PK", {
                              day: "numeric",
                              month: "short",
                            })}
                          </p>
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${stBadge}`}
                          >
                            {stIcon} {stLabel}
                          </span>
                        </div>
                      </div>
                      <p className="flex-shrink-0 text-sm font-black text-blue-600">
                        {fc(Number(r.amount), currency)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <button
            className="flex w-full items-center justify-between px-5 py-4"
            onClick={() => {
              setShowDeposits((v) => !v);
              if (!showDeposits) void refetchDeposits();
            }}
          >
            <div className="flex items-center gap-2.5">
              <ArrowDownToLine size={16} className="text-green-600" />
              <span className="text-sm font-bold text-gray-800">Deposit History</span>
            </div>
            {showDeposits ? (
              <ChevronUp size={16} className="text-gray-400" />
            ) : (
              <ChevronDown size={16} className="text-gray-400" />
            )}
          </button>
          {showDeposits && (
            <div className="border-t border-gray-50">
              {!depositsData ? (
                <div className="flex items-center justify-center px-5 py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
                </div>
              ) : (
                (() => {
                  interface DepositItem {
                    id: string;
                    status: string;
                    method?: string;
                    createdAt: string;
                    note?: string;
                    amount: number | string;
                  }
                  const depositList: DepositItem[] =
                    (depositsData as { deposits?: DepositItem[] } | null)?.deposits ??
                    (depositsData as DepositItem[] | null) ??
                    [];
                  if (depositList.length === 0)
                    return (
                      <div className="px-5 py-8 text-center">
                        <p className="text-sm font-medium text-gray-400">No deposits yet</p>
                      </div>
                    );
                  return (
                    <div className="divide-y divide-gray-50">
                      {depositList.map((dep: DepositItem) => {
                        const st =
                          dep.status === "verified"
                            ? "verified"
                            : dep.status === "rejected"
                              ? "rejected"
                              : "pending";
                        const stBadge =
                          st === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : st === "verified"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-600";
                        const stIcon =
                          st === "pending" ? (
                            <Clock size={10} />
                          ) : st === "verified" ? (
                            <CheckCircle size={10} />
                          ) : (
                            <XCircle size={10} />
                          );
                        return (
                          <div key={dep.id} className="flex items-center gap-3 px-5 py-3.5">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-green-50">
                              <ArrowDownToLine size={16} className="text-green-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-800">
                                {dep.method || "Deposit"}
                              </p>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <p className="text-[10px] text-gray-400">
                                  {new Date(dep.createdAt).toLocaleDateString("en-PK", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </p>
                                <span
                                  className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${stBadge}`}
                                >
                                  {stIcon} {st}
                                </span>
                              </div>
                              {dep.note && (
                                <p className="mt-0.5 truncate text-[10px] text-gray-400">
                                  {dep.note}
                                </p>
                              )}
                            </div>
                            <p className="flex-shrink-0 text-sm font-black text-green-600">
                              {fc(Number(dep.amount), currency)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          )}
        </div>

        {withdrawalRequests.length > 0 && (
          <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <button
              className="flex w-full items-center justify-between px-5 py-4"
              onClick={() => setShowRequests(!showRequests)}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-bold text-gray-800">{T("withdrawalRequests")}</span>
                {pendingRequests.length > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    <Clock size={9} /> {pendingRequests.length} {T("pending")}
                  </span>
                )}
              </div>
              {showRequests ? (
                <ChevronUp size={16} className="text-gray-400" />
              ) : (
                <ChevronDown size={16} className="text-gray-400" />
              )}
            </button>
            {showRequests && (
              <div className="space-y-3 border-t border-gray-50 px-4 pt-3 pb-4">
                {withdrawalRequests.map((tx) => (
                  <PendingRequestCard key={tx.id} tx={tx} />
                ))}
                <div className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-blue-500" />
                  <p className="text-xs font-medium text-blue-700">
                    {T("processingTime")}: {procDays * 24}–{procDays * 24 + 24}h.{" "}
                    {T("adminApproveNotify")}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {withdrawalRequests.length === 0 && (
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-800">
              <Sparkles size={15} className="text-green-500" /> {T("howItWorks")}
            </p>
            <div className="space-y-3">
              {[
                {
                  step: "1",
                  icon: <TrendingUp size={14} className="text-green-600" />,
                  title: T("completeDeliveries"),
                  desc: `${riderKeepPct}% ${T("earningsAddedInstantly")}`,
                },
                {
                  step: "2",
                  icon: <Wallet2 size={14} className="text-green-600" />,
                  title: T("buildBalance"),
                  desc: `${T("minToWithdraw")}: ${fc(minPayout, currency)}`,
                },
                {
                  step: "3",
                  icon: <ArrowUpFromLine size={14} className="text-green-600" />,
                  title: T("requestWithdrawal"),
                  desc: T("selectPaymentMethod"),
                },
                {
                  step: "4",
                  icon: <CheckCircle size={14} className="text-green-600" />,
                  title: T("receivePayment"),
                  desc: `${procDays * 24}–${procDays * 24 + 24}h ${T("transferTime")}`,
                },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-green-50 text-sm font-black text-green-600">
                    {s.step}
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                      {s.icon} {s.title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="px-5 pt-5 pb-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-800">{T("transactionHistoryTitle")}</p>
              <span className="text-[10px] font-medium text-gray-400">
                {filtered.length} {T("records")}
              </span>
            </div>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
              {FILTER_TABS_LOCAL.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`flex-shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-all ${
                    filter === tab.key
                      ? "bg-gray-900 text-white"
                      : "border border-gray-100 bg-gray-50 text-gray-400 active:bg-gray-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="border-t border-gray-50 px-5 py-12 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50">
                <CreditCard size={28} className="text-gray-200" />
              </div>
              <p className="font-bold text-gray-600">{T("noTransactionsFilter")}</p>
              <p className="mt-1 text-sm text-gray-400">{T("completeDeliveriesTrack")}</p>
              {filter !== "all" && (
                <button
                  onClick={() => setFilter("all")}
                  className="mx-auto mt-3 flex items-center gap-0.5 text-xs font-bold text-green-600"
                >
                  {T("all")} {T("transactionHistoryTitle")} <ChevronRight size={12} />
                </button>
              )}
            </div>
          ) : (
            <div className="border-t border-gray-50">
              {groupedTx.map((group) => (
                <div key={group.label}>
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-5 py-2.5">
                    <p className="text-[11px] font-bold tracking-wider text-gray-400 uppercase">
                      {resolveGroupLabel(group.label)}
                    </p>
                    <span className="text-[10px] text-gray-300">{group.items.length}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {group.items.map((t: WalletTx) => {
                      const meta = txMeta(t.type);
                      const isDebitType = t.type === "debit" || t.type === "platform_fee";
                      const isCredit = !isDebitType;
                      const isW = t.type === "debit" && t.description?.startsWith("Withdrawal");
                      const isDeposit = t.type === "deposit";
                      const ref = isW || isDeposit ? (t.reference ?? "pending") : null;
                      const wStatus = !ref
                        ? null
                        : ref === "pending"
                          ? "pending"
                          : ref.startsWith("paid:") || ref.startsWith("approved:")
                            ? "approved"
                            : ref.startsWith("rejected:")
                              ? "rejected"
                              : null;
                      return (
                        <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                          <TxIcon type={t.type} />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm leading-snug font-semibold text-gray-800">
                              {t.description}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              <p className="text-[10px] text-gray-400">{fdr(t.createdAt)}</p>
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${meta.badge}`}
                              >
                                {T(meta.labelKey)}
                              </span>
                              {wStatus === "pending" && (
                                <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                                  <Clock size={8} /> {T("pending")}
                                </span>
                              )}
                              {wStatus === "approved" && (
                                <span className="flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-700">
                                  <CheckCircle size={8} />{" "}
                                  {isDeposit ? T("creditedLabel") : T("paid")}
                                </span>
                              )}
                              {wStatus === "rejected" && (
                                <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-600">
                                  <XCircle size={8} /> {T("rejected")}
                                </span>
                              )}
                            </div>
                          </div>
                          <p
                            className={`flex-shrink-0 text-sm font-black ${
                              isDeposit && wStatus === "pending"
                                ? "text-amber-500"
                                : isDeposit
                                  ? "text-teal-600"
                                  : isCredit
                                    ? "text-green-600"
                                    : wStatus === "rejected"
                                      ? "text-gray-400 line-through"
                                      : "text-red-500"
                            }`}
                          >
                            {isDebitType ? "−" : "+"}
                            {fc(Number(t.amount), currency)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* W2: infinite-scroll sentinel + spinner. Only rendered when
                 there is a next page so we never show a permanent loader. */}
              {hasNextPage && (
                <div ref={loadMoreRef} className="flex items-center justify-center px-5 py-4">
                  {isFetchingNextPage ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
                  ) : (
                    <div className="h-5" />
                  )}
                </div>
              )}
              {!hasNextPage && transactions.length > 0 && (
                <p className="py-3 text-center text-[10px] text-gray-300">
                  {T("allTransactionsSecure")}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-green-100 bg-green-50 p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck size={15} className="text-green-600" />
            <p className="text-sm font-bold text-green-800">{T("payoutPolicy")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: T("yourShare" as TranslationKey), value: `${riderKeepPct}%` },
              { label: T("minWithdrawalLabel"), value: fc(minPayout, currency) },
              { label: T("processingTime"), value: `${procDays * 24}-${procDays * 24 + 24}h` },
              { label: T("maxWithdrawalLabel"), value: fc(maxPayout, currency) },
            ].map((p) => (
              <div
                key={p.label}
                className="rounded-xl border border-green-100 bg-white px-3 py-2.5"
              >
                <p className="text-[10px] font-bold tracking-wider text-green-600/60 uppercase">
                  {p.label}
                </p>
                <p className="mt-0.5 text-sm font-black text-green-800">{p.value}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-[10px] text-gray-300">
          <ShieldCheck size={10} /> {T("allTransactionsSecure")} {config.platform.appName}
        </p>
      </div>

      {showRemittance && (
        <RemittanceModal
          netOwed={codNetOwed}
          codCollected={codCollected}
          onClose={() => setShowRemittance(false)}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ["rider-cod"] });
            void qc.invalidateQueries({ queryKey: ["rider-wallet"] });
            void qc.invalidateQueries({ queryKey: ["rider-deposits"] });
            void refetch();
            void refetchCod();
            void refetchDeposits();
            showToast(T("codRemittanceSubmitted"));
          }}
        />
      )}

      {showWithdraw && withdrawalEnabled && (
        <WithdrawModal
          balance={balanceNum}
          minPayout={minPayout}
          maxPayout={maxPayout}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ["rider-wallet"] });
            void qc.invalidateQueries({ queryKey: ["rider-cod"] });
            void qc.invalidateQueries({ queryKey: ["rider-deposits"] });
            void refetch();
            void refetchCod();
            void refetchDeposits();
            refreshUser().catch((err) => {
              log.error(
                { err: err instanceof Error ? err.message : String(err) },
                "[Wallet] refreshUser failed"
              );
            });
            /* Show "Under Review" message so rider knows the request is pending admin review
               and their balance will only be deducted after the request is approved. */
            showToast(`${T("withdrawalSubmitted")} ${T("underReview")}`, "success");
          }}
        />
      )}

      {showDeposit && depositEnabled && (
        <DepositModal
          balance={balanceNum}
          minBalance={minBalance}
          onClose={() => setShowDeposit(false)}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ["rider-wallet"] });
            void qc.invalidateQueries({ queryKey: ["rider-deposits"] });
            void refetch();
            void refetchCod();
            void refetchDeposits();
            setShowDeposits(true);
            showToast(T("depositSubmittedMsg"));
          }}
        />
      )}

      {toast && (
        <div
          className={`fixed top-4 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 animate-[slideDown_0.3s_ease-out] items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-2xl ${
            toast.type === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"
          }`}
        >
          {toast.type === "error" ? (
            <XCircle size={15} className="flex-shrink-0 text-red-300" />
          ) : (
            <CheckCircle size={15} className="flex-shrink-0 text-green-400" />
          )}
          {toast.message}
        </div>
      )}
    </PullToRefresh>
  );
}
