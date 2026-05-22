import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAllNotifications } from "@/hooks/use-admin";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { Bell, Filter, RefreshCw } from "lucide-react";
import { useState } from "react";

function fd(d: string | Date) {
  return new Date(d).toLocaleString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleColor(role: string) {
  if (role === "vendor") return "bg-orange-100 text-orange-700";
  if (role === "rider") return "bg-green-100 text-green-700";
  if (role === "admin") return "bg-purple-100 text-purple-700";
  return "bg-blue-100 text-blue-700";
}

function typeIcon(type: string) {
  if (type === "order") return "📦";
  if (type === "wallet") return "💰";
  if (type === "ride") return "🏍️";
  if (type === "system") return "⚙️";
  if (type === "alert") return "⚠️";
  return "🔔";
}

export default function Notifications() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const [roleFilter, setRoleFilter] = useState<string>("");

  const { data: nData, isLoading, isError, refetch } = useAllNotifications(roleFilter || undefined);
  const notifications: any[] = nData?.notifications || [];
  const _unreadCount = Number(nData?.unreadCount ?? 0);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Notifications page crashed. Please reload.
        </div>
      }
    >
      <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
        <PageHeader
          icon={Bell}
          title={T("systemNotifications")}
          subtitle="All platform notifications across users, riders, and vendors"
          iconBgClass="bg-blue-100"
          iconColorClass="text-blue-600"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="self-start sm:self-auto"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> {T("refresh")}
            </Button>
          }
        />

        {/* Role Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-500">Filter by role:</span>
          {["", "customer", "vendor", "rider"].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${roleFilter === r ? "bg-primary border-primary text-white" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
            >
              {r === "" ? T("allTypes") : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
          <span className="ml-2 text-xs text-gray-400">{notifications.length} records</span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : isError ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <p className="mb-3 text-4xl">⚠️</p>
              <p className="font-bold text-red-600">Failed to load notifications</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Try again
              </button>
            </CardContent>
          </Card>
        ) : notifications.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <p className="mb-3 text-4xl">🔔</p>
              <p className="font-bold text-gray-700">{T("noNotificationsFound")}</p>
              <p className="mt-1 text-sm text-gray-400">{T("notificationsSubtitle")}</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border-0 shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-sm font-bold text-gray-700">{T("recentNotifications")}</p>
              <span className="text-xs text-gray-400">{notifications.length} records</span>
            </div>
            <div className="max-h-[600px] divide-y divide-gray-50 overflow-y-auto">
              {notifications.map((n: any) => (
                <div key={n.id} className="flex items-start gap-3 px-4 py-3.5">
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl ${n.isRead ? "bg-gray-100" : "bg-blue-50"}`}
                  >
                    {typeIcon(n.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm leading-snug font-bold text-gray-800">{n.title}</p>
                      {n.user?.roles?.[0] && (
                        <Badge
                          className={`text-[9px] font-bold ${roleColor(n.user.roles[0])}`}
                          variant="outline"
                        >
                          {n.user.roles[0]}
                        </Badge>
                      )}
                      {!n.isRead && (
                        <div className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-500">
                      {n.body}
                    </p>
                    <div className="mt-1 flex items-center gap-3">
                      <p className="text-[10px] text-gray-400">{fd(n.createdAt)}</p>
                      {n.user && (
                        <p className="truncate text-[10px] text-gray-400">
                          {n.user.name} · {n.user.phone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </ErrorBoundary>
  );
}
