import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PullToRefresh } from "@/components/PullToRefresh";
import { ActionBar, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LastUpdated } from "@/components/ui/LastUpdated";
import {
  fetchOrdersExport,
  useAssignRider,
  useOrderRefund,
  useOrdersEnriched,
  useOrdersStats,
  useRiders,
  useUpdateOrder,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/lib/adminAuthContext";
import { adminFetch } from "@/lib/adminFetcher";
import { getAdminSocket } from "@/lib/adminSocket";
import { formatCurrency } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { AlertTriangle, Download, RefreshCw, ShoppingBag, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SortDir, SortKey } from "./constants";
import { STATUS_LABELS, exportOrdersCSV } from "./constants";
import { DeliverConfirmDialog } from "./DeliverConfirmDialog";
import { OrderDetailDrawer } from "./OrderDetailDrawer";
import { OrdersFilterBar } from "./OrdersFilterBar";
import { OrdersMobileList } from "./OrdersMobileList";
import { OrdersStatsCards } from "./OrdersStatsCards";
import { OrdersTable } from "./OrdersTable";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function Orders() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data: ridersData } = useRiders();
  const updateMutation = useUpdateOrder();
  const assignMutation = useAssignRider();
  const refundMutation = useOrderRefund();
  const { toast } = useToast();
  const { state } = useAdminAuth();
  const queryClient = useQueryClient();

  // Track which order IDs received a live update recently (for "Updated just now" indicator)
  const [liveUpdatedOrders, setLiveUpdatedOrders] = useState<Map<string, number>>(new Map());
  const liveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Real-time order status updates via shared admin socket
  useEffect(() => {
    if (!state.accessToken) return;
    const socket = getAdminSocket(state.accessToken);

    type OrderStatusPayload = {
      id?: string;
      orderId?: string;
      status?: string;
      updatedAt?: string;
    };

    const applyOrderUpdate = (data: OrderStatusPayload) => {
      const id = data.id ?? data.orderId;
      if (!id || !data.status) return;

      // Update the row in-place across all cached paginated pages
      queryClient.setQueriesData(
        { queryKey: ["admin-orders-enriched"], exact: false },
        (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const page = old as { orders?: unknown[] };
          if (!Array.isArray(page.orders)) return old;
          const orders = page.orders as Array<Record<string, unknown>>;
          const idx = orders.findIndex((o) => o.id === id);
          if (idx === -1) return old;
          const updated = [...orders];
          updated[idx] = {
            ...updated[idx],
            status: data.status,
            updatedAt: data.updatedAt ?? new Date().toISOString(),
          };
          return { ...page, orders: updated };
        }
      );

      // Mark this order as recently updated for the "Updated just now" badge
      setLiveUpdatedOrders((prev) => new Map(prev).set(id, Date.now()));

      // Clear the indicator after 6 seconds
      const existing = liveTimers.current.get(id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        setLiveUpdatedOrders((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        liveTimers.current.delete(id);
      }, 6000);
      liveTimers.current.set(id, t);
    };

    socket.on("order:status", applyOrderUpdate);
    socket.on("order:update", applyOrderUpdate);

    return () => {
      socket.off("order:status", applyOrderUpdate);
      socket.off("order:update", applyOrderUpdate);
    };
  }, [state.accessToken, queryClient]);

  // Cleanup timers on unmount — liveTimers is a ref and intentionally excluded
  useEffect(() => {
    return () => {
      liveTimers.current.forEach((t) => clearTimeout(t)); // eslint-disable-line react-hooks/exhaustive-deps
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [showAssignRider, setShowAssignRider] = useState(false);
  const [riderSearch, setRiderSearch] = useState("");
  const [showDeliverConfirm, setShowDeliverConfirm] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkFulfilledConfirm, setBulkFulfilledConfirm] = useState(false);
  const [bulkFulfilling, setBulkFulfilling] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, typeFilter, debouncedSearch, dateFrom, dateTo]);

  const serverFilters = useMemo(
    () => ({
      status: statusFilter,
      type: typeFilter,
      search: debouncedSearch || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      limit: pageSize,
      sortBy: sortKey,
      sortDir,
    }),
    [statusFilter, typeFilter, debouncedSearch, dateFrom, dateTo, page, pageSize, sortKey, sortDir]
  );

  const { data, isLoading, isError, error, dataUpdatedAt, refetch, isFetching } =
    useOrdersEnriched(serverFilters);
  const { data: statsData } = useOrdersStats();

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
      setPage(1);
    },
    [sortKey]
  );

  const handleUpdateStatus = useCallback(
    (id: string, status: string, extra?: { localUpdate?: any }) => {
      if (status === "delivered" && !extra?.localUpdate) {
        setShowDeliverConfirm(id);
        return;
      }
      const prevStatus: string | undefined =
        selectedOrder?.id === id ? selectedOrder.status : undefined;
      updateMutation.mutate(
        { id, status },
        {
          onSuccess: () => {
            toast({ title: `Order status updated to ${STATUS_LABELS[status] ?? status}` });
            setSelectedOrder((prev: any) =>
              prev?.id === id ? { ...prev, status, updatedAt: new Date().toISOString() } : prev
            );
          },
          onError: (err) => {
            if (prevStatus !== undefined) {
              setSelectedOrder((prev: any) =>
                prev?.id === id ? { ...prev, status: prevStatus } : prev
              );
            }
            toast({ title: "Update failed", description: err.message, variant: "destructive" });
          },
        }
      );
    },
    [updateMutation, toast, selectedOrder]
  );

  const confirmDeliver = useCallback(() => {
    if (!showDeliverConfirm) return;
    const id = showDeliverConfirm;
    setShowDeliverConfirm(null);
    updateMutation.mutate(
      { id, status: "delivered" },
      {
        onSuccess: () => {
          toast({ title: "Order marked as Delivered" });
          setSelectedOrder((prev: any) =>
            prev?.id === id
              ? { ...prev, status: "delivered", updatedAt: new Date().toISOString() }
              : prev
          );
        },
        onError: (err) =>
          toast({ title: "Update failed", description: err.message, variant: "destructive" }),
      }
    );
  }, [showDeliverConfirm, updateMutation, toast]);

  const handleCancelOrder = useCallback(() => {
    if (!selectedOrder) return;
    setCancelling(true);
    updateMutation.mutate(
      { id: selectedOrder.id, status: "cancelled" },
      {
        onSuccess: () => {
          setSelectedOrder((p: any) => ({
            ...p,
            status: "cancelled",
            updatedAt: new Date().toISOString(),
          }));
          setShowCancelConfirm(false);
          setCancelling(false);
          toast({
            title:
              "Order cancelled" +
              (selectedOrder.paymentMethod === "wallet" ? " — Wallet refund issued" : ""),
          });
        },
        onError: (err) => {
          setCancelling(false);
          toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
        },
      }
    );
  }, [selectedOrder, updateMutation, toast]);

  const handleRefundOrder = useCallback(
    (prefilledAmount?: number, prefilledReason?: string) => {
      if (!selectedOrder) return;
      // Pre-fill state if called from ReturnPanel with an approved return amount/reason
      const finalAmount = prefilledAmount ?? parseFloat(refundAmount);
      const finalReason = prefilledReason ?? refundReason.trim();
      if (
        !Number.isFinite(finalAmount) ||
        finalAmount <= 0 ||
        finalAmount > (selectedOrder.total || 0)
      )
        return;
      if (prefilledAmount !== undefined) {
        setRefundAmount(String(prefilledAmount));
        setRefundReason(prefilledReason ?? "");
      }
      const amt = finalAmount;
      refundMutation.mutate(
        { id: selectedOrder.id, amount: amt, reason: finalReason || undefined },
        {
          onSuccess: (res: any) => {
            toast({
              title: "Refund issued",
              description: `${formatCurrency(Math.round(res.refundedAmount))} credited to customer wallet`,
            });
            setShowRefundConfirm(false);
            setRefundAmount("");
            setRefundReason("");
          },
          onError: (err: any) =>
            toast({ title: "Refund failed", description: err.message, variant: "destructive" }),
        }
      );
    },
    [selectedOrder, refundAmount, refundReason, refundMutation, toast]
  );

  const handleAssignRider = useCallback(
    (rider: any) => {
      if (!selectedOrder) return;
      assignMutation.mutate(
        {
          orderId: selectedOrder.id,
          riderId: rider.id,
          riderName: rider.name || rider.phone,
          riderPhone: rider.phone,
        },
        {
          onSuccess: () => {
            toast({
              title: "Rider assigned",
              description: `${rider.name || rider.phone} assigned to order`,
            });
            setSelectedOrder((p: any) => ({
              ...p,
              riderId: rider.id,
              riderName: rider.name || rider.phone,
            }));
            setShowAssignRider(false);
          },
          onError: (e) =>
            toast({ title: "Failed", description: e.message, variant: "destructive" }),
        }
      );
    },
    [selectedOrder, assignMutation, toast]
  );

  const handleExportCSV = useCallback(async () => {
    setExporting(true);
    try {
      const result = await fetchOrdersExport({
        status: statusFilter,
        type: typeFilter,
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy: sortKey,
        sortDir,
      });
      exportOrdersCSV(result.orders || []);
      toast({
        title: "CSV exported",
        description: `${(result.orders || []).length} orders exported`,
      });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }, [statusFilter, typeFilter, debouncedSearch, dateFrom, dateTo, sortKey, sortDir, toast]);

  const orders = useMemo<any[]>(
    () => (Array.isArray(data?.orders) ? data.orders : []),
    [data?.orders]
  );
  const serverTotal: number = typeof data?.total === "number" ? data.total : orders.length;

  const liveSelectedOrder = selectedOrder
    ? (orders.find((o: any) => o.id === selectedOrder.id) ?? selectedOrder)
    : null;

  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, typeFilter, dateFrom, dateTo]);

  const allTotal: number = statsData?.total ?? 0;
  const pendingCount: number = statsData?.pending ?? 0;
  const activeCount: number = statsData?.active ?? 0;
  const deliveredCount: number = statsData?.delivered ?? 0;
  const totalRevenue: number = statsData?.totalRevenue ?? 0;

  const pendingOrders = useMemo(() => orders.filter((o: any) => o.status === "pending"), [orders]);

  const qc = useQueryClient();

  const handleBulkMarkFulfilled = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setBulkFulfilling(true);
    try {
      const result = (await adminFetch("/orders/bulk-status", {
        method: "PATCH",
        body: JSON.stringify({ ids, status: "delivered" }),
      })) as { updated: number };
      toast({
        title: `${result.updated} order${result.updated !== 1 ? "s" : ""} marked as delivered`,
      });
      setSelectedIds(new Set());
      setBulkFulfilledConfirm(false);
      void qc.invalidateQueries({ queryKey: ["admin-orders-enriched"] });
    } catch (e: unknown) {
      toast({
        title: "Bulk update failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
    setBulkFulfilling(false);
  }, [selectedIds, toast, qc]);

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-orders-enriched"] }),
      qc.invalidateQueries({ queryKey: ["admin-orders-stats"] }),
      qc.invalidateQueries({ queryKey: ["admin-riders"] }),
    ]);
  }, [qc]);

  const hasActiveFilters =
    statusFilter !== "all" || typeFilter !== "all" || !!dateFrom || !!dateTo || !!search;

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
  }, []);

  const handleSelectOrder = useCallback((order: any) => {
    setSelectedOrder(order);
    setShowCancelConfirm(false);
  }, []);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Orders page crashed. Please reload.
        </div>
      }
    >
      <PullToRefresh onRefresh={handlePullRefresh} className="space-y-5 sm:space-y-6">
        <PageHeader
          icon={ShoppingBag}
          title={T("martFoodOrders")}
          subtitle={`${allTotal} ${T("total")} · ${pendingCount} ${T("pending")} · ${deliveredCount} ${T("delivered")}`}
          iconBgClass="bg-indigo-100"
          iconColorClass="text-indigo-600"
          actions={
            <LastUpdated
              dataUpdatedAt={dataUpdatedAt ?? 0}
              onRefresh={() => refetch()}
              isRefreshing={isFetching}
            />
          }
        />

        <ActionBar
          secondary={
            <div className="flex items-center gap-2">
              {liveUpdatedOrders.size > 0 && (
                <div className="flex animate-pulse items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
                  <Zap className="h-3.5 w-3.5" />
                  {liveUpdatedOrders.size} order{liveUpdatedOrders.size !== 1 ? "s" : ""} updated
                  live
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={exporting}
                className="h-9 gap-2 rounded-xl"
                aria-label="Export orders as CSV"
              >
                <Download className="h-4 w-4" aria-hidden="true" />{" "}
                {exporting ? "Exporting..." : "Export CSV"}
              </Button>
            </div>
          }
        />

        {pendingCount > 0 && (
          <div
            className="flex items-center gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3"
            role="alert"
          >
            <span className="shrink-0 text-2xl" aria-hidden="true">
              📦
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-800">
                {pendingCount} new order{pendingCount > 1 ? "s" : ""} waiting for confirmation!
              </p>
              <p className="truncate text-xs text-amber-600">
                {pendingOrders
                  .slice(0, 3)
                  .map((o: any) => `#${o.id.slice(-6).toUpperCase()} (${o.type})`)
                  .join(" · ")}
                {pendingOrders.length > 3 ? ` +${pendingOrders.length - 3} more` : ""}
              </p>
            </div>
            <button
              onClick={() => setStatusFilter("pending")}
              className="min-h-[36px] rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold whitespace-nowrap text-white transition-colors hover:bg-amber-600"
              aria-label="Filter to show pending orders"
            >
              View All
            </button>
          </div>
        )}

        <OrdersStatsCards
          totalCount={allTotal}
          pendingCount={pendingCount}
          activeCount={activeCount}
          deliveredCount={deliveredCount}
          totalRevenue={totalRevenue}
          T={T}
        />

        <OrdersFilterBar
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          filteredCount={serverTotal}
          totalCount={allTotal}
          hasActiveFilters={hasActiveFilters}
          clearAll={clearAllFilters}
        />

        {selectedIds.size > 0 && (
          <div className="sticky top-0 z-20 flex items-center justify-between rounded-2xl bg-blue-600 px-4 py-3 text-white shadow-lg">
            <span className="text-sm font-semibold">
              {selectedIds.size} order{selectedIds.size > 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={() => setBulkFulfilledConfirm(true)}
              >
                <ShoppingBag className="mr-1 h-3.5 w-3.5" /> Mark Fulfilled
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-white hover:bg-white/20"
                onClick={() => setSelectedIds(new Set())}
              >
                ✕ Clear
              </Button>
            </div>
          </div>
        )}

        {isError && orders.length === 0 && (
          <Card
            className="space-y-3 rounded-2xl border-red-200 bg-red-50 p-6 text-center"
            role="alert"
          >
            <AlertTriangle className="mx-auto h-8 w-8 text-red-400" aria-hidden="true" />
            <p className="font-semibold text-red-700">Failed to load orders</p>
            <p className="text-xs text-red-500">
              {(error as Error)?.message || "An unexpected error occurred"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => qc.invalidateQueries({ queryKey: ["admin-orders-enriched"] })}
              className="gap-2 rounded-xl"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
            </Button>
          </Card>
        )}

        {isError && orders.length > 0 && (
          <div
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600"
            role="alert"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Failed to refresh — showing cached data.</span>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["admin-orders-enriched"] })}
              className="text-primary ml-auto min-h-[36px] font-semibold hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {!(isError && orders.length === 0) && (
          <OrdersTable
            isLoading={isLoading}
            paginated={orders}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onSelectOrder={handleSelectOrder}
            onUpdateStatus={handleUpdateStatus}
            hasActiveFilters={hasActiveFilters}
            clearAll={clearAllFilters}
            pageSize={pageSize}
            setPageSize={setPageSize}
            page={page}
            setPage={setPage}
            totalPages={totalPages}
            safePage={safePage}
            sortedLength={serverTotal}
            toastFn={toast}
            T={T}
            selectedIds={selectedIds}
            onToggleSelect={(id) =>
              setSelectedIds((prev) => {
                const s = new Set(prev);
                s.has(id) ? s.delete(id) : s.add(id);
                return s;
              })
            }
            onSelectAll={(checked) =>
              setSelectedIds(checked ? new Set(orders.map((o: any) => o.id)) : new Set())
            }
          />
        )}

        {!(isError && orders.length === 0) && (
          <OrdersMobileList
            isLoading={isLoading}
            paginated={orders}
            onSelectOrder={handleSelectOrder}
            hasActiveFilters={hasActiveFilters}
            clearAll={clearAllFilters}
            pageSize={pageSize}
            page={page}
            setPage={setPage}
            totalPages={totalPages}
            safePage={safePage}
            sortedLength={serverTotal}
          />
        )}

        <ConfirmDialog
          open={bulkFulfilledConfirm}
          title={`Mark ${selectedIds.size} Order${selectedIds.size !== 1 ? "s" : ""} as Delivered?`}
          description="These orders will be marked as delivered. This updates their status immediately."
          confirmLabel="Mark Fulfilled"
          variant="default"
          busy={bulkFulfilling}
          onConfirm={handleBulkMarkFulfilled}
          onClose={() => {
            if (!bulkFulfilling) setBulkFulfilledConfirm(false);
          }}
        />

        {showDeliverConfirm && (
          <DeliverConfirmDialog
            orderId={showDeliverConfirm}
            isPending={updateMutation.isPending}
            onConfirm={confirmDeliver}
            onClose={() => setShowDeliverConfirm(null)}
          />
        )}

        <OrderDetailDrawer
          selectedOrder={liveSelectedOrder}
          onClose={() => {
            setSelectedOrder(null);
            setShowCancelConfirm(false);
            setShowRefundConfirm(false);
          }}
          showCancelConfirm={showCancelConfirm}
          setShowCancelConfirm={setShowCancelConfirm}
          showRefundConfirm={showRefundConfirm}
          setShowRefundConfirm={setShowRefundConfirm}
          refundAmount={refundAmount}
          setRefundAmount={setRefundAmount}
          refundReason={refundReason}
          setRefundReason={setRefundReason}
          cancelling={cancelling}
          onCancelOrder={handleCancelOrder}
          onRefundOrder={handleRefundOrder}
          refundPending={refundMutation.isPending}
          showAssignRider={showAssignRider}
          setShowAssignRider={setShowAssignRider}
          riderSearch={riderSearch}
          setRiderSearch={setRiderSearch}
          ridersData={ridersData}
          onAssignRider={handleAssignRider}
          assignPending={assignMutation.isPending}
          onUpdateStatus={handleUpdateStatus}
          onDeliverConfirm={(id: string) => setShowDeliverConfirm(id)}
        />
      </PullToRefresh>
    </ErrorBoundary>
  );
}
