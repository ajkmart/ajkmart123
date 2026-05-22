import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminAbsoluteFetch } from "@/lib/adminFetcher";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Eye,
  Filter,
  Loader2,
  MessageCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

const LIMIT = 50;

function fd(d: string | Date) {
  return new Date(d).toLocaleString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusConfig(s: string): { label: string; icon: React.ElementType; cls: string } {
  switch (s) {
    case "sent":
      return { label: "Sent", icon: Check, cls: "bg-blue-100 text-blue-700 border-blue-200" };
    case "delivered":
      return {
        label: "Delivered",
        icon: CheckCheck,
        cls: "bg-green-100 text-green-700 border-green-200",
      };
    case "read":
      return { label: "Read", icon: Eye, cls: "bg-purple-100 text-purple-700 border-purple-200" };
    case "failed":
      return { label: "Failed", icon: XCircle, cls: "bg-red-100 text-red-700 border-red-200" };
    default:
      return { label: s, icon: AlertTriangle, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  }
}

const STATUS_FILTERS = ["", "sent", "delivered", "read", "failed"];

export default function WhatsAppDeliveryLog() {
  const [statusFilter, setStatusFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [page, setPage] = useState(1);
  const [allLogs, setAllLogs] = useState<any[]>([]);

  const qs = new URLSearchParams();
  if (statusFilter) qs.set("status", statusFilter);
  if (phoneFilter) qs.set("phone", phoneFilter);
  qs.set("limit", String(LIMIT));
  qs.set("offset", String((page - 1) * LIMIT));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-wa-delivery-log", statusFilter, phoneFilter, page],
    queryFn: async () => {
      const result = await adminAbsoluteFetch(
        `/api/webhooks/whatsapp/delivery-log?${qs.toString()}`
      );
      return result;
    },
    refetchInterval: 30_000,
  });

  const logs: any[] = useMemo(() => data?.logs ?? [], [data?.logs]);
  const total: number = data?.total ?? 0;
  const hasMore = page * LIMIT < total;

  const displayedLogs = page === 1 ? logs : [...allLogs, ...logs];

  const handlePhoneSearch = () => {
    setPhoneFilter(phoneInput.trim());
    setPage(1);
    setAllLogs([]);
  };
  const handlePhoneClear = () => {
    setPhoneFilter("");
    setPhoneInput("");
    setPage(1);
    setAllLogs([]);
  };
  const handleStatusChange = (s: string) => {
    setStatusFilter(s);
    setPage(1);
    setAllLogs([]);
  };

  const loadMore = useCallback(() => {
    setAllLogs((prev) => [...prev, ...logs]);
    setPage((p) => p + 1);
  }, [logs]);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          WhatsApp Delivery Log page crashed. Please reload.
        </div>
      }
    >
      <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
        <PageHeader
          icon={MessageCircle}
          title="WhatsApp Delivery Log"
          subtitle="Real-time delivery status for all outbound WhatsApp messages"
          iconBgClass="bg-green-100"
          iconColorClass="text-green-600"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refetch();
                setPage(1);
                setAllLogs([]);
              }}
              className="self-start sm:self-auto"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col flex-wrap items-start gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <span className="text-sm font-medium text-gray-500">Status:</span>
            {STATUS_FILTERS.map((s) => (
              <button
                key={s || "all"}
                onClick={() => handleStatusChange(s)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                  statusFilter === s
                    ? "bg-primary border-primary text-white"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Input
              placeholder="Search by phone…"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePhoneSearch()}
              className="h-8 w-44 text-xs"
            />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handlePhoneSearch}>
              Search
            </Button>
            {phoneFilter && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-gray-400"
                onClick={handlePhoneClear}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-400">
          {total} record{total !== 1 ? "s" : ""} found
        </p>

        {isLoading && page === 1 ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : displayedLogs.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <p className="mb-3 text-4xl">💬</p>
              <p className="font-bold text-gray-700">No delivery records found</p>
              <p className="mt-1 text-sm text-gray-400">
                Delivery status events from Meta will appear here once messages are sent.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden border-0 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-sm font-bold text-gray-700">Delivery Records</p>
                <span className="text-xs text-gray-400">
                  {displayedLogs.length} of {total} shown
                </span>
              </div>
              <div className="max-h-[600px] divide-y divide-gray-50 overflow-y-auto">
                {displayedLogs.map((log: any, idx: number) => {
                  const sc = statusConfig(log.status);
                  const Icon = sc.icon;
                  return (
                    <div key={log.id ?? idx} className="flex items-start gap-3 px-4 py-3.5">
                      <div
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${sc.cls}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-sm font-bold text-gray-800">
                            {log.recipient_phone}
                          </p>
                          <Badge
                            variant="outline"
                            className={`border text-[10px] font-bold ${sc.cls}`}
                          >
                            {sc.label}
                          </Badge>
                          {log.fallback_sent && (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                            >
                              Fallback: {log.fallback_channel ?? "sent"}
                            </Badge>
                          )}
                        </div>
                        {log.wa_message_id && (
                          <p className="mt-0.5 truncate font-mono text-[11px] text-gray-400">
                            {log.wa_message_id}
                          </p>
                        )}
                        {log.error_message && (
                          <p className="mt-0.5 text-xs leading-snug text-red-500">
                            Error {log.error_code ? `(${log.error_code})` : ""}: {log.error_message}
                          </p>
                        )}
                        {log.context_type && (
                          <p className="mt-0.5 text-[10px] text-gray-400">
                            Context: {log.context_type}
                            {log.context_id ? ` · ${log.context_id}` : ""}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-gray-400">{fd(log.sent_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  className="gap-2 rounded-xl"
                  onClick={loadMore}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Load More
                  <span className="text-muted-foreground text-xs">
                    ({total - displayedLogs.length} remaining)
                  </span>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
