import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminFetch } from "@/lib/adminFetcher";
import { formatCurrency } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart2, Bike, Package, RefreshCw, ShoppingCart, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PeriodOption = "7d" | "30d" | "90d" | "1y";

type AnalyticsPayload = {
  orders: { date: string; count: number }[];
  revenue: { category: string; amount: number }[];
  userGrowth: { date: string; newUsers: number }[];
  period: string;
  days: number;
};

type PlatformStats = {
  totalUsers?: number;
  totalOrders?: number;
  totalRevenue?: number;
  activeRiders?: number;
  userCount?: number;
  orderCount?: number;
};

function SkeletonBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gray-100 ${className ?? ""}`}
      style={style}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

function ChartSkeleton({ height = 240 }: { height?: number }) {
  return <SkeletonBlock className="w-full" style={{ height }} />;
}

function EmptyChart({
  message = "No data for selected period",
  height = 240,
}: {
  message?: string;
  height?: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 text-gray-400"
      style={{ height }}
    >
      <BarChart2 className="h-9 w-9 opacity-20" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconBg,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <Card className="border-border/50 rounded-2xl border shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          {sub && <p className="text-muted-foreground text-[11px]">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

const PERIOD_LABELS: Record<PeriodOption, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "1y": "This year",
};

function formatDateTick(d: string, period: PeriodOption) {
  const date = new Date(d);
  if (period === "1y") {
    return date.toLocaleDateString("en-US", { month: "short" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function OverviewAnalytics() {
  const [period, setPeriod] = useState<PeriodOption>("30d");
  const qc = useQueryClient();

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsPayload>({
    queryKey: ["admin-analytics-overview", period],
    queryFn: () => adminFetch(`/analytics?period=${period}`),
    staleTime: 5 * 60_000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<PlatformStats>({
    queryKey: ["admin-stats"],
    queryFn: () => adminFetch("/stats"),
    staleTime: 30_000,
  });

  const handleRefresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin-analytics-overview", period] });
    await qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const orders = analytics?.orders ?? [];
  const revenue = analytics?.revenue ?? [];
  const userGrowth = analytics?.userGrowth ?? [];

  const totalUsers = stats?.totalUsers ?? stats?.userCount ?? 0;
  const totalOrders = stats?.totalOrders ?? stats?.orderCount ?? 0;
  const totalRevenue = (stats as Record<string, unknown>)?.totalRevenue as number | undefined;
  const activeRiders = (stats as Record<string, unknown>)?.activeRiders as number | undefined;

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Analytics Overview crashed. Please reload.
        </div>
      }
    >
      <PullToRefresh onRefresh={handleRefresh} className="space-y-6">
        {/* Header */}
        <PageHeader
          icon={BarChart2}
          title="Platform Overview"
          subtitle={`Showing data for: ${PERIOD_LABELS[period]}`}
          iconBgClass="bg-indigo-100"
          iconColorClass="text-indigo-600"
          actions={
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
                <SelectTrigger className="h-9 w-36 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="1y">This year</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="h-9 gap-1.5 rounded-xl"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            </div>
          }
        />

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statsLoading ? (
            Array(4)
              .fill(0)
              .map((_, i) => <SkeletonBlock key={i} className="h-20" />)
          ) : (
            <>
              <StatCard
                icon={Users}
                label="Total Users"
                value={totalUsers.toLocaleString()}
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
              />
              <StatCard
                icon={ShoppingCart}
                label="Total Orders"
                value={totalOrders.toLocaleString()}
                iconBg="bg-orange-100"
                iconColor="text-orange-600"
              />
              <StatCard
                icon={TrendingUp}
                label="Total Revenue"
                value={totalRevenue != null ? formatCurrency(totalRevenue) : "—"}
                iconBg="bg-green-100"
                iconColor="text-green-600"
              />
              <StatCard
                icon={Bike}
                label="Active Riders"
                value={activeRiders != null ? activeRiders.toLocaleString() : "—"}
                iconBg="bg-purple-100"
                iconColor="text-purple-600"
              />
            </>
          )}
        </div>

        {/* Orders over time — LineChart */}
        <Card className="border-border/50 rounded-2xl p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
            <ShoppingCart className="h-4 w-4 text-indigo-600" /> Orders Over Time
          </h2>
          {analyticsLoading ? (
            <ChartSkeleton />
          ) : orders.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={orders} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(d) => formatDateTick(d, period)}
                    interval={Math.max(0, Math.floor(orders.length / 8) - 1)}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      fontSize: "12px",
                      border: "1px solid hsl(var(--border))",
                    }}
                    formatter={(v: number) => [v, "Orders"]}
                    labelFormatter={(label: string) =>
                      new Date(label).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Orders"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Revenue by category + User Growth side by side */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Revenue by category — BarChart */}
          <Card className="border-border/50 rounded-2xl p-4 shadow-sm sm:p-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
              <Package className="h-4 w-4 text-orange-600" /> Revenue by Category
            </h2>
            {analyticsLoading ? (
              <ChartSkeleton height={200} />
            ) : revenue.length === 0 ? (
              <EmptyChart height={200} />
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenue} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="category"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
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
                      formatter={(v: number) => [
                        `Rs. ${Math.round(v).toLocaleString()}`,
                        "Revenue",
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar
                      dataKey="amount"
                      name="Revenue"
                      fill="#f97316"
                      radius={[6, 6, 0, 0]}
                      barSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* User growth — AreaChart */}
          <Card className="border-border/50 rounded-2xl p-4 shadow-sm sm:p-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
              <Users className="h-4 w-4 text-blue-600" /> User Growth
            </h2>
            {analyticsLoading ? (
              <ChartSkeleton height={200} />
            ) : userGrowth.length === 0 ? (
              <EmptyChart height={200} />
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={userGrowth} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(d) => formatDateTick(d, period)}
                      interval={Math.max(0, Math.floor(userGrowth.length / 8) - 1)}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        fontSize: "12px",
                        border: "1px solid hsl(var(--border))",
                      }}
                      formatter={(v: number) => [v, "New Users"]}
                      labelFormatter={(label: string) =>
                        new Date(label).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="newUsers"
                      name="New Users"
                      stroke="#3b82f6"
                      fill="url(#growthGrad)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      </PullToRefresh>
    </ErrorBoundary>
  );
}
