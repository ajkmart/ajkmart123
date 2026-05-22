import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ExportButton } from "@/components/ExportButton";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LastUpdated } from "@/components/ui/LastUpdated";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditLog } from "@/hooks/use-admin";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { useCallback, useState } from "react";

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "user_create", label: "User Created" },
  { value: "user_approve", label: "User Approved" },
  { value: "user_reject", label: "User Rejected" },
  { value: "user_delete", label: "User Deleted" },
  { value: "wallet_topup", label: "Wallet Top-up" },
  { value: "vendor_payout", label: "Vendor Payout" },
  { value: "vendor_credit", label: "Vendor Credit" },
  { value: "rider_payout", label: "Rider Payout" },
  { value: "rider_bonus", label: "Rider Bonus" },
  { value: "debt_waived", label: "Waive Debt" },
  { value: "revoke_session", label: "Revoke Session" },
  { value: "revoke_all_sessions", label: "Revoke All Sessions" },
  { value: "admin_reset_otp", label: "Reset OTP" },
  { value: "admin_otp_bypass", label: "OTP Bypass" },
  { value: "user_ban", label: "User Banned" },
  { value: "bulk_ban", label: "Bulk Ban" },
  { value: "kyc_approve", label: "KYC Approved" },
  { value: "kyc_reject", label: "KYC Rejected" },
  { value: "admin_2fa_disable", label: "2FA Disabled" },
  { value: "admin_login", label: "Admin Login" },
  { value: "admin_logout", label: "Admin Logout" },
  { value: "settings_update", label: "Settings Updated" },
  { value: "product_approve", label: "Product Approved" },
  { value: "order_refund", label: "Order Refund" },
];

const RESULT_BADGE: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  success: {
    label: "Success",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  fail: { label: "Failed", cls: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
  failure: { label: "Failed", cls: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
  warn: { label: "Warning", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertCircle },
  pending: { label: "Pending", cls: "bg-gray-50 text-gray-600 border-gray-200", icon: Loader2 },
};

function ActionBadge({ action }: { action: string }) {
  const isBan = action.includes("ban") || action.includes("block") || action.includes("delete");
  const isWallet =
    action.includes("wallet") ||
    action.includes("topup") ||
    action.includes("payout") ||
    action.includes("bonus") ||
    action.includes("credit") ||
    action.includes("debt");
  const isKyc = action.includes("kyc");
  const isOtp = action.includes("otp") || action.includes("2fa") || action.includes("session");
  const isAuth = action.includes("login") || action.includes("logout") || action.includes("mfa");

  const cls = isBan
    ? "bg-red-50 text-red-700 border-red-200"
    : isWallet
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : isKyc
        ? "bg-purple-50 text-purple-700 border-purple-200"
        : isOtp
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : isAuth
            ? "bg-blue-50 text-blue-700 border-blue-200"
            : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <Badge
      variant="outline"
      className={`max-w-[180px] truncate px-1.5 py-0.5 font-mono text-[10px] ${cls}`}
      title={action}
    >
      {action}
    </Badge>
  );
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("all");
  const [result, setResult] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const params = {
    page,
    action: action !== "all" ? action : undefined,
    result: result !== "all" ? result : undefined,
    from: dateFrom || undefined,
    to: dateTo || undefined,
    search: search || undefined,
  };

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useAuditLog(params);

  const entries: any[] = data?.entries || [];
  const total: number = data?.total || 0;
  const totalPages: number = data?.totalPages || 1;

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  const handleClear = () => {
    setAction("all");
    setResult("all");
    setDateFrom("");
    setDateTo("");
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const hasFilters = action !== "all" || result !== "all" || dateFrom || dateTo || search;

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Audit Logs page crashed. Please reload.
        </div>
      }
    >
      <div className="max-w-[1400px] space-y-6">
        <PageHeader
          icon={ClipboardList}
          title="Audit Logs"
          subtitle={`Admin action trail — ${total.toLocaleString()} total entries`}
          iconBgClass="bg-indigo-100"
          iconColorClass="text-indigo-600"
          actions={
            <div className="flex items-center gap-2">
              <LastUpdated
                dataUpdatedAt={dataUpdatedAt}
                onRefresh={refetch}
                isRefreshing={isFetching}
              />
              <ExportButton
                filename="audit_logs"
                label="Export CSV"
                data={
                  entries.length > 0
                    ? entries.map((entry: any) => ({
                        timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : "",
                        adminId: entry.adminId ?? "",
                        adminName: entry.adminName ?? "",
                        action: entry.action ?? "",
                        affectedUser: entry.affectedUserName ?? "",
                        affectedUserRole: entry.affectedUserRole ?? "",
                        ipAddress: entry.ip ?? "",
                        result: entry.result ?? "",
                        details:
                          typeof entry.details === "object"
                            ? JSON.stringify(entry.details)
                            : String(entry.details ?? ""),
                      }))
                    : []
                }
                disabled={isLoading || entries.length === 0}
              />
              <Button
                variant="outline"
                className="h-9 gap-2 rounded-xl"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          }
        />

        {/* Filter Bar */}
        <Card className="border-border rounded-2xl border p-4 shadow-sm">
          <div className="flex flex-col flex-wrap gap-3 sm:flex-row">
            <div className="relative min-w-[200px] flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search by admin, action, IP, or affected user..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="h-9 rounded-xl pl-9"
              />
            </div>

            <Select
              value={action}
              onValueChange={(v) => {
                setAction(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-[190px] rounded-xl">
                <Filter className="text-muted-foreground mr-1.5 h-3.5 w-3.5" />
                <SelectValue placeholder="Filter action" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={result}
              onValueChange={(v) => {
                setResult(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-[130px] rounded-xl">
                <ShieldCheck className="text-muted-foreground mr-1.5 h-3.5 w-3.5" />
                <SelectValue placeholder="Result" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Results</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="fail">Failed</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <CalendarDays className="text-muted-foreground h-4 w-4 flex-shrink-0" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-[140px] rounded-xl text-xs"
                title="From date"
              />
              <span className="text-muted-foreground text-xs">–</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-[140px] rounded-xl text-xs"
                title="To date"
              />
            </div>

            <Button
              variant="outline"
              className="h-9 flex-shrink-0 gap-1.5 rounded-xl"
              onClick={handleSearch}
            >
              <Search className="h-3.5 w-3.5" /> Search
            </Button>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground h-9 flex-shrink-0 rounded-xl"
                onClick={handleClear}
              >
                Clear
              </Button>
            )}
          </div>
        </Card>

        {/* Table */}
        <Card className="border-border overflow-hidden rounded-2xl border shadow-sm">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-muted-foreground flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                <span className="text-sm">Loading audit logs...</span>
              </div>
            </div>
          ) : isError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-red-500">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm font-medium">Failed to load audit logs</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-xl">
                Retry
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-muted-foreground w-[150px] text-xs font-semibold">
                        Timestamp
                      </TableHead>
                      <TableHead className="text-muted-foreground w-[190px] text-xs font-semibold">
                        Action
                      </TableHead>
                      <TableHead className="text-muted-foreground w-[140px] text-xs font-semibold">
                        Admin
                      </TableHead>
                      <TableHead className="text-muted-foreground w-[160px] text-xs font-semibold">
                        Affected User
                      </TableHead>
                      <TableHead className="text-muted-foreground w-[110px] text-xs font-semibold">
                        IP Address
                      </TableHead>
                      <TableHead className="text-muted-foreground w-[90px] text-center text-xs font-semibold">
                        Result
                      </TableHead>
                      <TableHead className="text-muted-foreground text-xs font-semibold">
                        Details
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-40">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <ClipboardList className="text-muted-foreground/30 h-10 w-10" />
                            <p className="text-muted-foreground text-sm font-medium">
                              No audit log entries found
                            </p>
                            {hasFilters && (
                              <button
                                type="button"
                                onClick={handleClear}
                                className="mt-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                              >
                                Clear filters
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      entries.map((entry: any, idx: number) => {
                        const resultInfo = RESULT_BADGE[entry.result] || {
                          label: entry.result || "—",
                          cls: "bg-gray-50 text-gray-600 border-gray-200",
                          icon: AlertCircle,
                        };
                        const ResultIcon = resultInfo.icon;
                        const ts = entry.timestamp ? new Date(entry.timestamp) : null;
                        const adminLabel =
                          entry.adminName ||
                          (entry.adminId ? entry.adminId.slice(0, 10) + "…" : "System");

                        return (
                          <TableRow
                            key={`${entry.timestamp}-${idx}`}
                            className="hover:bg-muted/30 group transition-colors"
                          >
                            <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                              {ts ? (
                                <div>
                                  <span className="text-foreground font-semibold">
                                    {ts.toLocaleDateString()}
                                  </span>
                                  <span className="block text-[10px]">
                                    {ts.toLocaleTimeString()}
                                  </span>
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>

                            <TableCell>
                              <ActionBadge action={entry.action || "—"} />
                            </TableCell>

                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100">
                                  <User className="h-3 w-3 text-indigo-600" />
                                </div>
                                <div className="min-w-0">
                                  <span
                                    className="text-foreground block max-w-[100px] truncate text-xs font-medium"
                                    title={entry.adminName || entry.adminId}
                                  >
                                    {adminLabel}
                                  </span>
                                  {entry.adminId && entry.adminName && (
                                    <span className="text-muted-foreground block max-w-[100px] truncate font-mono text-[10px]">
                                      {entry.adminId.slice(0, 8)}…
                                    </span>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            <TableCell>
                              {entry.affectedUserName ? (
                                <div className="min-w-0">
                                  <span
                                    className="text-foreground block max-w-[140px] truncate text-xs font-medium"
                                    title={entry.affectedUserName}
                                  >
                                    {entry.affectedUserName}
                                  </span>
                                  {entry.affectedUserRole && (
                                    <Badge
                                      variant="outline"
                                      className="mt-0.5 border-gray-200 px-1 py-0 text-[9px] text-gray-500"
                                    >
                                      {entry.affectedUserRole}
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>

                            <TableCell>
                              <span className="text-muted-foreground font-mono text-xs">
                                {entry.ip || "—"}
                              </span>
                            </TableCell>

                            <TableCell className="text-center">
                              <Badge
                                variant="outline"
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] ${resultInfo.cls}`}
                              >
                                <ResultIcon className="h-3 w-3 flex-shrink-0" />
                                {resultInfo.label}
                              </Badge>
                            </TableCell>

                            <TableCell>
                              <p
                                className="text-muted-foreground max-w-xs truncate text-xs transition-all group-hover:max-w-none group-hover:overflow-visible group-hover:whitespace-normal"
                                title={entry.details}
                              >
                                {entry.details || "—"}
                              </p>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="border-border/50 bg-muted/10 flex items-center justify-between border-t px-4 py-3">
                  <p className="text-muted-foreground text-xs">
                    Page {page} of {totalPages} · {total.toLocaleString()} entries
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 rounded-lg p-0"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1 || isFetching}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>

                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (page <= 3) {
                        pageNum = i + 1;
                      } else if (page >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = page - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={pageNum === page ? "default" : "outline"}
                          size="sm"
                          className={`h-7 w-7 rounded-lg p-0 text-xs ${pageNum === page ? "bg-[#1A56DB] text-white" : ""}`}
                          onClick={() => setPage(pageNum)}
                          disabled={isFetching}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 rounded-lg p-0"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages || isFetching}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {entries.length > 0 && totalPages <= 1 && (
                <div className="border-border/50 bg-muted/10 border-t px-4 py-2.5">
                  <p className="text-muted-foreground text-xs">
                    Showing {entries.length} of {total.toLocaleString()} entries
                  </p>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </ErrorBoundary>
  );
}
