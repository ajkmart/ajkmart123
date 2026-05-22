import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PageHeader, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRevenueAnalytics } from "@/hooks/use-admin";
import { formatCurrency } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  BarChart2,
  Car,
  Download,
  FileText,
  Pill,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useCallback } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gray-100 ${className ?? ""}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

function exportJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `revenue-analytics-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv(
  monthly: { month: string; orders: number; rides: number; pharmacy: number; total: number }[]
) {
  const header = "Month,Mart/Food,Rides,Pharmacy,Total";
  const rows = monthly.map((m) =>
    [
      m.month,
      m.orders.toFixed(2),
      m.rides.toFixed(2),
      m.pharmacy.toFixed(2),
      m.total.toFixed(2),
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `revenue-monthly-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatMonthLabel(m: string): string {
  const [year, month] = m.split("-");
  const idx = parseInt(month ?? "1", 10) - 1;
  return `${SHORT_MONTHS[idx]} ${(year ?? "").slice(2)}`;
}

const PIE_COLORS = ["#f97316", "#6366f1", "#22c55e"];

const CustomPieLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  name: _name,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  name: string;
}) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={10}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function RevenueAnalytics() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const qc = useQueryClient();
  const { data: raw, isLoading } = useRevenueAnalytics();

  const handleRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["admin-revenue-analytics"] });
  }, [qc]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <SkeletonBlock className="h-10 w-56" />
          <div className="flex gap-2">
            <SkeletonBlock className="h-9 w-28" />
            <SkeletonBlock className="h-9 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} className="h-28" />
          ))}
        </div>
        <SkeletonBlock className="h-72" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-48" />
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SkeletonBlock className="h-64" />
          <SkeletonBlock className="h-64" />
        </div>
      </div>
    );
  }

  const monthly: {
    month: string;
    orders: number;
    rides: number;
    pharmacy: number;
    total: number;
  }[] = Array.isArray(raw?.monthly) ? raw.monthly : [];
  const categoryTotals = raw?.categoryTotals ?? { orders: 0, rides: 0, pharmacy: 0, total: 0 };
  const topVendors: {
    id: string;
    name: string | null;
    phone: string;
    orderCount: number;
    totalRevenue: number;
  }[] = Array.isArray(raw?.topVendors) ? raw.topVendors : [];

  const grandTotal: number = categoryTotals.total ?? 0;

  const thisMonthStr = new Date().toISOString().slice(0, 7);
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthStr = lastMonthDate.toISOString().slice(0, 7);

  const thisMonthData = monthly.find((m) => m.month === thisMonthStr);
  const lastMonthData = monthly.find((m) => m.month === lastMonthStr);

  const thisMonthTotal = thisMonthData?.total ?? 0;
  const lastMonthTotal = lastMonthData?.total ?? 0;
  const momGrowth =
    lastMonthTotal > 0
      ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
      : thisMonthTotal > 0
        ? 100
        : 0;

  const chartData = monthly.map((m) => ({
    name: formatMonthLabel(m.month),
    "Mart/Food": parseFloat(m.orders.toFixed(2)),
    Rides: parseFloat(m.rides.toFixed(2)),
    Pharmacy: parseFloat(m.pharmacy.toFixed(2)),
  }));

  const ordersShare =
    grandTotal > 0 ? ((categoryTotals.orders / grandTotal) * 100).toFixed(1) : "0.0";
  const ridesShare =
    grandTotal > 0 ? ((categoryTotals.rides / grandTotal) * 100).toFixed(1) : "0.0";
  const pharmShare =
    grandTotal > 0 ? ((categoryTotals.pharmacy / grandTotal) * 100).toFixed(1) : "0.0";

  const growthPositive = momGrowth >= 0;

  /* Pie chart data — revenue split by service category */
  const pieData = [
    { name: "Mart/Food", value: categoryTotals.orders },
    { name: "Rides", value: categoryTotals.rides },
    { name: "Pharmacy", value: categoryTotals.pharmacy },
  ].filter((d) => d.value > 0);

  /* Daily gross vs net — derive net as 85% of gross (platform keeps 15% commission) */
  const PLATFORM_COMMISSION = 0.15;
  const grossNetData = monthly.slice(-6).map((m) => ({
    name: formatMonthLabel(m.month),
    Gross: parseFloat(m.total.toFixed(2)),
    Net: parseFloat((m.total * (1 - PLATFORM_COMMISSION)).toFixed(2)),
  }));

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Revenue Analytics page crashed. Please reload.
        </div>
      }
    >
      <PullToRefresh onRefresh={handleRefresh} className="space-y-6 sm:space-y-8">
        <PageHeader
          icon={BarChart2}
          title="Revenue Analytics"
          subtitle="Last 12 months · auto-refreshes every 5 minutes"
          iconBgClass="bg-green-100"
          iconColorClass="text-green-600"
          actions={
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportJson({ monthly, categoryTotals, topVendors })}
                className="h-9 gap-2 rounded-xl"
              >
                <Download className="h-4 w-4" /> Export JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCsv(monthly)}
                className="h-9 gap-2 rounded-xl"
              >
                <FileText className="h-4 w-4" /> Export CSV
              </Button>
            </div>
          }
        />

        {/* Summary stat row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="relative col-span-2 overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-green-600 to-emerald-700 text-white shadow-md lg:col-span-1">
            <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
            <CardContent className="relative p-5">
              <p className="mb-1 text-xs font-medium text-white/70">{T("grandTotal")}</p>
              <h3 className="text-2xl font-bold">{formatCurrency(grandTotal)}</h3>
            </CardContent>
          </Card>

          <StatCard
            icon={TrendingUp}
            label={T("thisMonth")}
            value={formatCurrency(thisMonthTotal)}
            iconBgClass="bg-indigo-100"
            iconColorClass="text-indigo-600"
          />

          <StatCard
            icon={TrendingUp}
            label="Last Month"
            value={formatCurrency(lastMonthTotal)}
            iconBgClass="bg-slate-100"
            iconColorClass="text-slate-600"
          />

          <Card className="border-border/50 rounded-2xl border shadow-sm">
            <CardContent className="flex flex-col gap-1 p-4">
              <div className="mb-1 flex items-center gap-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${growthPositive ? "bg-green-100" : "bg-red-100"}`}
                >
                  {growthPositive ? (
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  )}
                </div>
              </div>
              <p className="text-muted-foreground text-xs font-medium">MoM Growth</p>
              <p
                className={`text-xl font-bold ${growthPositive ? "text-green-600" : "text-red-600"}`}
              >
                {growthPositive ? "+" : ""}
                {momGrowth.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Monthly stacked bar chart */}
        <Card className="border-border/50 rounded-2xl p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold sm:text-lg">
            <BarChart2 className="h-4 w-4 text-green-600" /> {T("revenueBreakdown")}
          </h2>
          {chartData.length === 0 ? (
            <div className="text-muted-foreground flex h-64 items-center justify-center text-sm">
              No revenue data available yet
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      fontSize: "12px",
                      border: "1px solid hsl(var(--border))",
                    }}
                    formatter={(v: number | string, name: string) => [
                      `Rs. ${Math.round(Number(v)).toLocaleString()}`,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="Mart/Food" stackId="a" fill="#F97316" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Rides" stackId="a" fill="#6366F1" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Pharmacy" stackId="a" fill="#22C55E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Gross vs Net + Commission Pie — side by side */}
        <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-2">
          {/* Gross vs Net revenue (last 6 months) */}
          <Card className="border-border/50 rounded-2xl p-4 shadow-sm sm:p-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
              <TrendingUp className="h-4 w-4 text-blue-500" /> Gross vs Net Revenue
              <span className="text-muted-foreground ml-auto text-xs font-normal">
                Last 6 months
              </span>
            </h2>
            {grossNetData.length === 0 ? (
              <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
                No data available yet
              </div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={grossNetData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      width={42}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        fontSize: "12px",
                        border: "1px solid hsl(var(--border))",
                      }}
                      formatter={(v: number | string, name: string) => [
                        `Rs. ${Math.round(Number(v)).toLocaleString()}`,
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="Gross" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={18} />
                    <Bar dataKey="Net" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="text-muted-foreground mt-2 text-[10px]">
              Net = Gross after 15% platform commission
            </p>
          </Card>

          {/* Commission breakdown — PieChart */}
          <Card className="border-border/50 rounded-2xl p-4 shadow-sm sm:p-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
              <BarChart2 className="h-4 w-4 text-purple-500" /> Revenue by Service
            </h2>
            {pieData.length === 0 ? (
              <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
                No data available yet
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="h-48 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        dataKey="value"
                        labelLine={false}
                        label={CustomPieLabel}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          fontSize: "12px",
                          border: "1px solid hsl(var(--border))",
                        }}
                        formatter={(v: number | string) => [
                          `Rs. ${Math.round(Number(v)).toLocaleString()}`,
                          "Revenue",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="shrink-0 space-y-3">
                  {pieData.map((entry, i) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <div>
                        <p className="text-xs font-semibold">{entry.name}</p>
                        <p className="text-muted-foreground text-[10px]">
                          {formatCurrency(entry.value)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Category totals & Top Vendors */}
        <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-2">
          {/* Category totals */}
          <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
            <div className="border-border/30 bg-card border-b px-4 py-4 sm:px-6">
              <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg">
                <TrendingUp className="h-4 w-4 text-indigo-500" /> Top Categories
              </h2>
            </div>
            <div className="divide-border/30 divide-y">
              {[
                {
                  label: `${T("mart")} / ${T("food")}`,
                  value: categoryTotals.orders,
                  share: ordersShare,
                  icon: ShoppingBag,
                  color: "bg-orange-100 text-orange-600",
                  rank: 1,
                },
                {
                  label: T("ride"),
                  value: categoryTotals.rides,
                  share: ridesShare,
                  icon: Car,
                  color: "bg-indigo-100 text-indigo-600",
                  rank: 2,
                },
                {
                  label: T("pharmacy"),
                  value: categoryTotals.pharmacy,
                  share: pharmShare,
                  icon: Pill,
                  color: "bg-green-100 text-green-600",
                  rank: 3,
                },
              ]
                .sort((a, b) => b.value - a.value)
                .map((cat, idx) => {
                  const Icon = cat.icon;
                  return (
                    <div key={cat.label} className="flex items-center gap-3 px-4 py-4 sm:px-6">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-100 text-slate-600" : "bg-orange-100 text-orange-600"}`}
                      >
                        {idx + 1}
                      </span>
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cat.color}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{cat.label}</p>
                        <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${cat.share}%` }}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold">{formatCurrency(cat.value)}</p>
                        <p className="text-muted-foreground text-xs">{cat.share}%</p>
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="bg-muted/30 flex items-center justify-between px-4 py-3 sm:px-6">
              <p className="text-muted-foreground text-xs font-medium">{T("grandTotal")}</p>
              <p className="text-sm font-bold">{formatCurrency(grandTotal)}</p>
            </div>
          </Card>

          {/* Top Vendors */}
          <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
            <div className="border-border/30 bg-card border-b px-4 py-4 sm:px-6">
              <h2 className="flex items-center gap-2 text-base font-bold sm:text-lg">
                <Trophy className="h-4 w-4 text-amber-500" /> {T("topVendors")}
              </h2>
            </div>
            <div>
              {!topVendors.length ? (
                <div className="text-muted-foreground p-8 text-center text-sm">
                  {T("noVendorData")}
                </div>
              ) : (
                topVendors.map((v, idx) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-indigo-50/50 sm:px-6"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-100 text-slate-600" : idx === 2 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground"}`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{v.name || v.phone}</p>
                      <p className="text-muted-foreground text-xs">
                        {v.orderCount} {T("myOrders").toLowerCase()}
                      </p>
                    </div>
                    <p className="text-foreground shrink-0 text-sm font-bold">
                      {formatCurrency(v.totalRevenue)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </PullToRefresh>
    </ErrorBoundary>
  );
}
