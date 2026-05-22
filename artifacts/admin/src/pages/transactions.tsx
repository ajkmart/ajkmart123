import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ExportButton } from "@/components/ExportButton";
import { FilterBar, PageHeader, StatCardSkeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorRetry } from "@/components/ui/ErrorRetry";
import { Input } from "@/components/ui/input";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTransactions } from "@/hooks/use-admin";
import { useLocation, useSearch } from "wouter";
import { parseApiError } from "@/lib/errorParser";
import { formatCurrency, formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  DollarSign,
  Receipt,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function Transactions() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const search_ = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(search_);
  const userIdFilter = urlParams.get("userId") ?? undefined;
  const { data, isLoading, isError, error, refetch, isFetching } = useTransactions(userIdFilter);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const transactions = data?.transactions || [];
  const filtered = transactions.filter((t: any) => {
    const q = search.toLowerCase();
    const matchSearch =
      (t.description || "").toLowerCase().includes(q) ||
      (t.userName || "").toLowerCase().includes(q) ||
      (t.userPhone || "").includes(q) ||
      t.userId.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q);
    const matchType = typeFilter === "all" || t.type === typeFilter;
    const matchDate =
      (!dateFrom || new Date(t.createdAt) >= new Date(dateFrom)) &&
      (!dateTo || new Date(t.createdAt) <= new Date(dateTo + "T23:59:59"));
    return matchSearch && matchType && matchDate;
  });

  const filteredCredits = filtered
    .filter((t: any) => t.type === "credit")
    .reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
  const filteredDebits = filtered
    .filter((t: any) => t.type === "debit")
    .reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);

  type TxnSortKey = "userName" | "type" | "amount" | "createdAt";
  const [sortKey, setSortKey] = useState<TxnSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    if (data) setLastRefreshed(new Date());
  }, [data]);

  const handleTxnSort = (key: TxnSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedFiltered = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a: any, b: any) => {
      let av: any = a[sortKey],
        bv: any = b[sortKey];
      if (sortKey === "amount") {
        av = Number(av);
        bv = Number(bv);
      } else if (sortKey === "createdAt") {
        av = new Date(av).getTime();
        bv = new Date(bv).getTime();
      } else {
        av = String(av ?? "").toLowerCase();
        bv = String(bv ?? "").toLowerCase();
      }
      return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === "asc" ? 1 : -1);
    });
  }, [filtered, sortKey, sortDir]);

  if (isError) {
    return (
      <ErrorRetry
        variant="page"
        title="Failed to load transactions"
        description={parseApiError(error)}
        onRetry={refetch}
      />
    );
  }

  function TxnSortIcon({ col }: { col: TxnSortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="text-primary ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="text-primary ml-1 inline h-3 w-3" />
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Transactions page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={Receipt}
          title={T("walletTransactions")}
          subtitle={T("walletTxnSubtitle")}
          iconBgClass="bg-sky-100"
          iconColorClass="text-sky-600"
          actions={
            <div className="flex items-center gap-2">
              <LastUpdated dataUpdatedAt={lastRefreshed?.getTime() ?? 0} />
              <ExportButton
                filename="transactions"
                label={T("csvExport")}
                data={
                  sortedFiltered.length <= 500
                    ? sortedFiltered.map((t: any) => ({
                        id: t.id,
                        date: t.createdAt?.slice(0, 10) ?? "",
                        userId: t.userId ?? "",
                        userName: t.userName ?? "",
                        type: t.type ?? "",
                        amount: t.amount ?? "",
                        status: t.status ?? "",
                        reference: t.reference ?? "",
                      }))
                    : undefined
                }
                apiUrl={
                  sortedFiltered.length > 500
                    ? `/api/admin/transactions/export?${new URLSearchParams({
                        ...(typeFilter !== "all" ? { type: typeFilter } : {}),
                        ...(search ? { search } : {}),
                        ...(dateFrom ? { dateFrom } : {}),
                        ...(dateTo ? { dateTo } : {}),
                      }).toString()}`
                    : undefined
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-9 gap-2 rounded-xl"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />{" "}
                {T("refresh")}
              </Button>
            </div>
          }
        />

        {/* Active userId filter banner */}
        {userIdFilter && (
          <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5">
            <User className="h-4 w-4 shrink-0 text-sky-600" />
            <span className="flex-1 text-sm font-medium text-sky-800">
              Filtered by rider:{" "}
              <span className="font-mono text-xs">{userIdFilter}</span>
            </span>
            <button
              onClick={() => navigate("/transactions")}
              className="ml-2 flex h-6 w-6 items-center justify-center rounded-full text-sky-600 hover:bg-sky-100"
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {isLoading ? (
            [1, 2, 3].map((i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <Card className="from-primary rounded-2xl border-none bg-gradient-to-br to-blue-700 text-white shadow-lg">
                <CardContent className="flex items-center gap-3 p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                    <DollarSign className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white/80">{T("totalTransactions")}</p>
                    <p className="text-xl font-bold">{transactions.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-green-200 bg-green-50 shadow-sm">
                <CardContent className="flex items-center gap-3 p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-green-700/80">{T("totalCredits")}</p>
                    <p className="text-xl font-bold text-green-700">
                      {formatCurrency(data?.totalCredit || 0)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-red-200 bg-red-50 shadow-sm">
                <CardContent className="flex items-center gap-3 p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-red-700/80">{T("totalDebits")}</p>
                    <p className="text-xl font-bold text-red-700">
                      {formatCurrency(data?.totalDebit || 0)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Filter-scoped summary row */}
        {(dateFrom || dateTo || typeFilter !== "all" || search) && (
          <div className="flex items-center gap-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
            <span className="font-semibold text-sky-800">Filtered summary:</span>
            <span className="text-sky-700">{filtered.length} txns</span>
            <span className="font-bold text-green-700">+{formatCurrency(filteredCredits)}</span>
            <span className="font-bold text-red-700">−{formatCurrency(filteredDebits)}</span>
            <span className="font-bold text-sky-700">
              Net: {formatCurrency(filteredCredits - filteredDebits)}
            </span>
          </div>
        )}

        {/* Filters */}
        <Card className="border-border/50 space-y-3 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <FilterBar
              search={search}
              onSearch={setSearch}
              placeholder="Search by user name, phone, or description..."
              className="flex-1"
            />
            <div className="flex gap-2">
              {[
                { value: "all", label: T("allTypes") },
                { value: "credit", label: `▲ ${T("creditLabel")}` },
                { value: "debit", label: `▼ ${T("debitLabel")}` },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTypeFilter(t.value)}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                    typeFilter === t.value
                      ? t.value === "credit"
                        ? "border-green-600 bg-green-600 text-white"
                        : t.value === "debit"
                          ? "border-red-600 bg-red-600 text-white"
                          : "bg-primary border-primary text-white"
                      : "bg-muted/30 border-border/50 text-muted-foreground hover:border-primary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="text-muted-foreground h-4 w-4 shrink-0" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-muted/30 h-9 w-32 rounded-xl text-xs"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-muted/30 h-9 w-32 rounded-xl text-xs"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="text-primary text-xs hover:underline"
              >
                {T("clearFilter")}
              </button>
            )}
          </div>
        </Card>

        {/* Mobile card list — shown below md breakpoint */}
        <section className="space-y-3 md:hidden" aria-label={T("transactions")}>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-border/50 animate-pulse rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="bg-muted h-4 w-28 rounded" />
                    <div className="bg-muted h-3 w-20 rounded" />
                  </div>
                  <div className="bg-muted h-5 w-14 rounded-full" />
                </div>
              </Card>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Receipt className="text-muted-foreground/25 mb-3 h-10 w-10" aria-hidden="true" />
              <p className="text-muted-foreground font-semibold">{T("noTransactions")}</p>
            </div>
          ) : (
            filtered.map((t: any) => (
              <Card key={t.id} className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${t.type === "credit" ? "bg-green-100" : "bg-red-100"}`}
                        aria-hidden="true"
                      >
                        {t.type === "credit" ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {t.userName || t.userId?.slice(-6).toUpperCase()}
                        </p>
                        {t.userPhone && (
                          <p className="text-muted-foreground text-xs">{t.userPhone}</p>
                        )}
                      </div>
                    </div>
                    <p
                      className={`shrink-0 text-base font-extrabold ${t.type === "credit" ? "text-green-600" : "text-red-600"}`}
                    >
                      {t.type === "credit" ? "+" : "-"}
                      {formatCurrency(t.amount)}
                    </p>
                  </div>
                  <div className="border-border/50 mt-3 flex items-center justify-between gap-2 border-t pt-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusBadge
                        status={t.type}
                        label={
                          t.type === "credit" ? `▲ ${T("creditLabel")}` : `▼ ${T("debitLabel")}`
                        }
                        size="xs"
                        className="shrink-0 font-bold uppercase"
                      />
                      <p className="text-muted-foreground truncate text-xs">{t.description}</p>
                    </div>
                    <p className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                      {formatDate(t.createdAt)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>

        {/* Desktop table — hidden below md breakpoint */}
        <Card className="border-border/50 hidden overflow-hidden rounded-2xl shadow-sm md:block">
          <div className="overflow-x-auto">
            <Table className="min-w-[580px]">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>{T("txnId")}</TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleTxnSort("userName")}
                      className="hover:text-foreground flex items-center gap-1"
                    >
                      {T("user")}
                      <TxnSortIcon col="userName" />
                    </button>
                  </TableHead>
                  <TableHead>{T("description")}</TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleTxnSort("type")}
                      className="hover:text-foreground flex items-center gap-1"
                    >
                      {T("type")}
                      <TxnSortIcon col="type" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      onClick={() => handleTxnSort("amount")}
                      className="hover:text-foreground ml-auto flex items-center gap-1"
                    >
                      {T("amount")}
                      <TxnSortIcon col="amount" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      onClick={() => handleTxnSort("createdAt")}
                      className="hover:text-foreground ml-auto flex items-center gap-1"
                    >
                      {T("date")}
                      <TxnSortIcon col="createdAt" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="bg-muted h-4 w-16 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="bg-muted h-4 w-32 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="bg-muted h-4 w-40 animate-pulse rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="bg-muted h-5 w-16 animate-pulse rounded-full" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="bg-muted ml-auto h-4 w-20 animate-pulse rounded" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="bg-muted ml-auto h-4 w-24 animate-pulse rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : sortedFiltered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground h-32 text-center">
                      {T("noTransactions")}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedFiltered.map((t: any) => (
                    <TableRow key={t.id} className="hover:bg-muted/30">
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {t.id.slice(-8).toUpperCase()}
                      </TableCell>
                      <TableCell>
                        {t.userName ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100"
                              aria-hidden="true"
                            >
                              <User className="h-3.5 w-3.5 text-sky-600" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{t.userName}</p>
                              <p className="text-muted-foreground text-xs">{t.userPhone}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground font-mono text-xs">
                            {t.userId.slice(-6).toUpperCase()}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm font-medium">
                        {t.description}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={t.type}
                          label={
                            t.type === "credit" ? `▲ ${T("creditLabel")}` : `▼ ${T("debitLabel")}`
                          }
                          size="xs"
                          className="font-bold uppercase"
                        />
                      </TableCell>
                      <TableCell
                        className={`text-right font-bold ${t.type === "credit" ? "text-green-600" : "text-red-600"}`}
                      >
                        {t.type === "credit" ? "+" : "-"}
                        {formatCurrency(t.amount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-sm whitespace-nowrap">
                        {formatDate(t.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </ErrorBoundary>
  );
}
