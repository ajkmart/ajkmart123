import { useQuery } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import type { OrderStatus } from "@workspace/service-constants";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "../components/PageHeader";
import { ErrorState } from "../components/ui/ErrorState";
import { api } from "../lib/api";
import { CARD, CARD_HEADER, fc } from "../lib/ui";
import { useCurrency } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";

type Granularity = "daily" | "weekly" | "monthly";
type RangePreset = 7 | 30 | 90 | "custom";

const PRESETS: { value: Exclude<RangePreset, "custom">; label: string }[] = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

const STATUS_META: Partial<Record<OrderStatus, { label: string; color: string }>> &
  Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "#f59e0b" },
  confirmed: { label: "Confirmed", color: "#fb923c" },
  preparing: { label: "Preparing", color: "#fdba74" },
  ready: { label: "Ready", color: "#a3a3a3" },
  picked_up: { label: "Picked Up", color: "#94a3b8" },
  out_for_delivery: { label: "Out Delivery", color: "#64748b" },
  delivered: { label: "Delivered", color: "#22c55e" },
  cancelled: { label: "Cancelled", color: "#ef4444" },
};

function startOfWeekIso(d: Date): string {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function aggregate(
  daily: Array<{ date: string; orders: number; revenue: number }>,
  granularity: Granularity
): Array<{ key: string; label: string; orders: number; revenue: number }> {
  if (granularity === "daily") {
    return daily.map((d) => ({
      key: d.date,
      label: d.date.slice(5),
      orders: d.orders,
      revenue: d.revenue,
    }));
  }
  const buckets = new Map<string, { label: string; orders: number; revenue: number }>();
  for (const d of daily) {
    const dt = new Date(`${d.date}T00:00:00`);
    let key: string;
    let label: string;
    if (granularity === "weekly") {
      key = startOfWeekIso(dt);
      label = `Week ${key.slice(5)}`;
    } else {
      key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      label = key;
    }
    const cur = buckets.get(key) ?? { label, orders: 0, revenue: 0 };
    cur.orders += d.orders;
    cur.revenue += d.revenue;
    buckets.set(key, cur);
  }
  return [...buckets.entries()].map(([k, v]) => ({
    key: k,
    ...v,
    revenue: parseFloat(v.revenue.toFixed(2)),
  }));
}

function ChartSkeleton({ height = 220 }: { height?: number }) {
  return <div className="skeleton w-full rounded-xl" style={{ height }} />;
}

function ChartEmpty({ msg }: { msg: string }) {
  return <div className="flex items-center justify-center py-12 text-sm text-gray-400">{msg}</div>;
}

function exportAnalyticsCsv(
  trendSeries: Array<{ key: string; label: string; orders: number; revenue: number }>,
  topProducts: Array<{
    productId: string;
    name: string;
    orders: number;
    quantity?: number;
    revenue: number;
  }>,
  rangeLabel: string
) {
  const rows: string[] = [];
  rows.push(`AJKMart Analytics Export — ${rangeLabel}`);
  rows.push("");
  rows.push("Revenue & Orders Trend");
  rows.push("Period,Orders,Revenue");
  trendSeries.forEach((d) => rows.push(`"${d.label}",${d.orders},${d.revenue.toFixed(2)}`));
  rows.push("");
  rows.push("Top Products");
  rows.push("Product,Orders,Revenue");
  topProducts.forEach((p) => rows.push(`"${p.name}",${p.orders},${Number(p.revenue).toFixed(2)}`));
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analytics_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Analytics() {
  const [preset, setPreset] = useState<RangePreset>(30);
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const { symbol: currencySymbol } = useCurrency();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const queryKey =
    preset === "custom"
      ? ["vendor-analytics", "custom", customFrom, customTo]
      : ["vendor-analytics", preset];

  const customReady = preset === "custom" && customFrom && customTo;

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      preset === "custom" ? api.getAnalyticsRange(customFrom, customTo) : api.getAnalytics(preset),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: preset !== "custom" || Boolean(customReady),
  });

  const summary = data?.summary || { totalOrders: 0, totalRevenue: 0 };
  const dailyData = useMemo(
    () => (data?.daily as Array<{ date: string; orders: number; revenue: number }>) ?? [],
    [data?.daily]
  );
  const topProducts = useMemo(
    () =>
      (data?.topProducts as Array<{
        productId: string;
        name: string;
        orders: number;
        quantity?: number;
        revenue: number;
      }>) ?? [],
    [data?.topProducts]
  );
  const byStatus = useMemo(
    () => (data?.byStatus as Record<string, number>) ?? {},
    [data?.byStatus]
  );
  const peakHours =
    (data?.peakHours as Array<{ hour: number; orders: number; revenue: number }>) || [];
  const returnRate = (data?.returnRate as {
    totalCustomers: number;
    returningCustomers: number;
    rate: number;
  }) || { totalCustomers: 0, returningCustomers: 0, rate: 0 };
  const period = (data?.period as { days: number; from: string; to: string }) || {
    days: preset === "custom" ? 0 : (preset as number),
    from: "",
    to: "",
  };
  const customerRatings = (data?.customerRatings as {
    avgRating: number | null;
    count: number;
  }) || { avgRating: null, count: 0 };
  const cancellationRate =
    typeof data?.cancellationRate === "number" ? data.cancellationRate : null;
  const responseTime = typeof data?.responseTime === "number" ? data.responseTime : null;

  const totalOrders = Number(summary.totalOrders || 0);
  const totalRevenue = Number(summary.totalRevenue || 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const completionRate =
    totalOrders > 0 ? Math.round(((byStatus.delivered || 0) / totalOrders) * 100) : 0;

  const trendSeries = useMemo(() => aggregate(dailyData, granularity), [dailyData, granularity]);
  const statusPie = useMemo(
    () =>
      Object.entries(byStatus)
        .filter(([, c]) => c > 0)
        .map(([k, c]) => ({
          name: STATUS_META[k]?.label || k,
          value: c,
          color: STATUS_META[k]?.color || "#94a3b8",
          key: k,
        })),
    [byStatus]
  );
  const topProductsBars = useMemo(
    () =>
      topProducts.slice(0, 5).map((p) => ({
        name: p.name?.length > 18 ? p.name.slice(0, 17) + "…" : p.name || p.productId,
        orders: p.orders,
        revenue: p.revenue,
      })),
    [topProducts]
  );

  const rangeLabel =
    preset === "custom"
      ? customReady
        ? `${customFrom} → ${customTo}`
        : "Pick dates"
      : `${preset} ${T("daysLabel")}`;

  const loading = isLoading || (preset === "custom" && !customReady) || (isFetching && !data);

  if (isError)
    return (
      <div className="bg-[#0A0F1A] md:bg-transparent">
        <PageHeader title={T("analytics")} subtitle={T("storePerformance")} />
        <div className="px-4 py-4">
          <ErrorState
            title={T("somethingWentWrong")}
            subtitle={T("checkInternetRetry")}
            onRetry={() => refetch()}
            retryLabel={T("retry")}
          />
        </div>
      </div>
    );

  return (
    <div className="bg-[#0A0F1A] md:bg-transparent">
      <PageHeader
        title={T("analytics")}
        subtitle={T("storePerformance")}
        actions={
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`android-press h-8 min-h-0 rounded-xl px-3 text-xs font-bold transition-all ${preset === p.value ? "bg-white text-blue-500 md:bg-blue-600 md:text-white" : "bg-white/20 text-white md:bg-gray-100 md:text-gray-600"}`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setPreset("custom")}
              className={`android-press h-8 min-h-0 rounded-xl px-3 text-xs font-bold transition-all ${preset === "custom" ? "bg-white text-blue-500 md:bg-blue-600 md:text-white" : "bg-white/20 text-white md:bg-gray-100 md:text-gray-600"}`}
            >
              Custom
            </button>
            {!loading && trendSeries.length > 0 && (
              <button
                onClick={() => exportAnalyticsCsv(trendSeries, topProducts, rangeLabel)}
                className="android-press h-8 min-h-0 rounded-xl bg-white/20 px-3 text-xs font-bold text-white transition-all md:bg-green-50 md:text-green-700"
              >
                ⬇ Export CSV
              </button>
            )}
          </div>
        }
      />

      <div className="space-y-4 px-4 py-4 md:px-0 md:py-4">
        {/* ── Custom range pickers ── */}
        {preset === "custom" && (
          <div className={`${CARD} flex flex-wrap items-center gap-3 p-3`}>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              From
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 px-2 text-sm font-medium text-gray-800"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              To
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 px-2 text-sm font-medium text-gray-800"
              />
            </label>
            <span className="text-xs text-gray-400">
              {customReady ? `${period.days || 0} days` : "Select start and end dates"}
            </span>
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            {
              label: T("revenue"),
              value: fc(totalRevenue, currencySymbol),
              icon: "💰",
              sub: rangeLabel,
              bg: "bg-blue-50",
              val: "text-blue-600",
            },
            {
              label: T("orders"),
              value: String(totalOrders),
              icon: "📦",
              sub: rangeLabel,
              bg: "bg-blue-50",
              val: "text-blue-600",
            },
            {
              label: T("avgOrder"),
              value: fc(avgOrderValue, currencySymbol),
              icon: "📊",
              sub: T("avgOrder"),
              bg: "bg-purple-50",
              val: "text-purple-600",
            },
            {
              label: T("completion"),
              value: `${completionRate}%`,
              icon: "✅",
              sub: T("delivered"),
              bg: "bg-green-50",
              val: "text-green-600",
            },
            {
              label: "Return Rate",
              value: `${returnRate.rate}%`,
              icon: "🔁",
              sub: `${returnRate.returningCustomers}/${returnRate.totalCustomers} customers`,
              bg: "bg-pink-50",
              val: "text-pink-600",
            },
            {
              label: "Avg Rating",
              value: customerRatings.avgRating != null ? `${customerRatings.avgRating} ★` : "—",
              icon: "⭐",
              sub: `${customerRatings.count} review${customerRatings.count !== 1 ? "s" : ""}`,
              bg: "bg-yellow-50",
              val: "text-yellow-600",
            },
            {
              label: "Cancel Rate",
              value: cancellationRate != null ? `${cancellationRate}%` : "—",
              icon: "❌",
              sub: "of all orders",
              bg: "bg-red-50",
              val: "text-red-500",
            },
            {
              label: "Avg Response",
              value:
                responseTime != null
                  ? responseTime < 1
                    ? `${Math.round(responseTime * 60)}s`
                    : `${responseTime} min`
                  : "—",
              icon: "⚡",
              sub: "median to confirm",
              bg: "bg-indigo-50",
              val: "text-indigo-600",
            },
          ].map((k) => (
            <div key={k.label} className={`${k.bg} col-span-1 rounded-2xl p-4`}>
              <p className="text-2xl">{k.icon}</p>
              {loading ? (
                <div className="skeleton mt-2 h-6 w-24 rounded-lg" />
              ) : (
                <p className={`text-xl font-extrabold ${k.val} mt-1 leading-tight`}>{k.value}</p>
              )}
              <p className="mt-0.5 text-xs font-medium text-gray-500">{k.label}</p>
              <p className="truncate text-[10px] text-gray-400">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Revenue Trend ── */}
        <div className={CARD}>
          <div className={CARD_HEADER}>
            <div>
              <p className="text-sm font-bold text-gray-800">
                {T("dailyRevenue")} & {T("dailyOrders")}
              </p>
              <p className="text-xs text-gray-400">{rangeLabel}</p>
            </div>
            <div className="flex gap-1">
              {(["daily", "weekly", "monthly"] as Granularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`h-7 rounded-lg px-2.5 text-[11px] font-bold capitalize transition-colors ${granularity === g ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="p-3">
            {loading ? (
              <ChartSkeleton height={260} />
            ) : trendSeries.length === 0 ? (
              <ChartEmpty msg={T("noDataYet")} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trendSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fb923c" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#fb923c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickFormatter={(v) => Math.round(Number(v)).toLocaleString()}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === "revenue"
                        ? [fc(Number(value), currencySymbol), "Revenue"]
                        : [Number(value), "Orders"]
                    }
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid #f1f5f9" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#fb923c"
                    strokeWidth={2}
                    fill="url(#revGradient)"
                    name="revenue"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="orders"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="orders"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
          {/* ── Top Products (horizontal bar) ── */}
          <div className={CARD}>
            <div className={`${CARD_HEADER} bg-gray-50`}>
              <p className="text-sm font-bold text-gray-800">🏆 {T("topProducts")}</p>
              <span className="text-xs text-gray-400">{T("byOrders")}</span>
            </div>
            <div className="p-3">
              {loading ? (
                <ChartSkeleton height={260} />
              ) : topProductsBars.length === 0 ? (
                <ChartEmpty msg={T("noDataYet")} />
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(220, topProductsBars.length * 48)}
                >
                  <BarChart
                    data={topProductsBars}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 11, fill: "#475569" }}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) =>
                        name === "revenue"
                          ? [fc(Number(value), currencySymbol), "Revenue"]
                          : [Number(value), "Orders"]
                      }
                      contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid #f1f5f9" }}
                    />
                    <Bar dataKey="orders" fill="#fb923c" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            {topProducts.length > 0 && !loading && (
              <div className="grid gap-1.5 border-t border-gray-100 px-4 py-3">
                {topProducts.slice(0, 5).map((p, i) => (
                  <div key={p.productId || i} className="flex items-center justify-between text-xs">
                    <span className="flex-1 truncate font-medium text-gray-700">
                      {i + 1}. {p.name}
                    </span>
                    <span className="ml-2 font-bold text-blue-600">
                      {fc(p.revenue || 0, currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Order Status (donut) ── */}
          <div className={CARD}>
            <div className={`${CARD_HEADER} bg-gray-50`}>
              <p className="text-sm font-bold text-gray-800">{T("orderStatusBreakdown")}</p>
              <span className="text-xs text-gray-400">{totalOrders} orders</span>
            </div>
            <div className="p-3">
              {loading ? (
                <ChartSkeleton height={260} />
              ) : statusPie.length === 0 ? (
                <ChartEmpty msg={T("noDataYet")} />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={statusPie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {statusPie.map((s) => (
                        <Cell key={s.key} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `${value} (${totalOrders > 0 ? Math.round((value / totalOrders) * 100) : 0}%)`,
                        name,
                      ]}
                      contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid #f1f5f9" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── Peak Order Hours ── */}
        <div className={CARD}>
          <div className={`${CARD_HEADER} bg-gray-50`}>
            <p className="text-sm font-bold text-gray-800">⏰ Peak Order Hours</p>
            <span className="text-xs text-gray-400">{rangeLabel}</span>
          </div>
          <div className="p-3">
            {loading ? (
              <ChartSkeleton height={220} />
            ) : peakHours.every((h) => h.orders === 0) ? (
              <ChartEmpty msg={T("noDataYet")} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={peakHours} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
                    interval={2}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <Tooltip
                    labelFormatter={(h) =>
                      `${String(h).padStart(2, "0")}:00 – ${String((Number(h) + 1) % 24).padStart(2, "0")}:00`
                    }
                    formatter={(value: number, name: string) =>
                      name === "revenue"
                        ? [fc(Number(value), currencySymbol), "Revenue"]
                        : [Number(value), "Orders"]
                    }
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid #f1f5f9" }}
                  />
                  <Bar dataKey="orders" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Performance Tips ── */}
        <div className={CARD}>
          <div className={`${CARD_HEADER} bg-amber-50`}>
            <p className="text-sm font-bold text-amber-800">💡 Performance Tips</p>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            {[
              {
                icon: "📸",
                tip: "Add high-quality images to your products — stores with images get 3x more orders",
              },
              {
                icon: "⏱️",
                tip: "Keep your estimated delivery time accurate to improve customer satisfaction ratings",
              },
              {
                icon: "🎟️",
                tip: "Create promo codes during slow periods to attract more customers to your store",
              },
            ].map((t, i) => (
              <div key={i} className="flex gap-2.5 rounded-xl bg-amber-50/50 p-3">
                <span className="flex-shrink-0 text-xl">{t.icon}</span>
                <p className="text-xs leading-relaxed font-medium text-amber-800">{t.tip}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
