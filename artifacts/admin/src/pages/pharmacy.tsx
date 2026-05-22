import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { usePharmacyOrders, useUpdatePharmacyOrder } from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Phone,
  Pill,
  Search,
  ShoppingCart,
  TrendingUp,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";

const _STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
};

const isTerminal = (s: string) => s === "delivered" || s === "cancelled";

export default function Pharmacy() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data, isLoading } = usePharmacyOrders();
  const updateMutation = useUpdatePharmacyOrder();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const { onError: onUpdateStatusError } = useErrorHandler({ title: "Update failed" });
  const { onError: onCancelOrderError } = useErrorHandler({
    title: "Cancel failed",
    onError: () => setCancelling(false),
  });
  const handleUpdateStatus = (id: string, status: string, currentStatus?: string) => {
    if (currentStatus && !ALLOWED_TRANSITIONS[currentStatus]?.includes(status)) {
      toast({
        title: "Invalid transition",
        description: `Can't move ${STATUS_LABELS[currentStatus]} → ${STATUS_LABELS[status]}`,
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate(
      { id, status },
      {
        onSuccess: () => toast({ title: `Status → ${STATUS_LABELS[status]} ✅` }),
        onError: (err: any) => {
          onUpdateStatusError(err);
          toast({ title: "Update failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleAdminCancel = () => {
    if (!selectedOrder) return;
    setCancelling(true);
    updateMutation.mutate(
      { id: selectedOrder.id, status: "cancelled" },
      {
        onSuccess: () => {
          setSelectedOrder({ ...selectedOrder, status: "cancelled" });
          setShowCancelConfirm(false);
          setCancelling(false);
          toast({
            title:
              "Order cancelled ✅" +
              (selectedOrder.paymentMethod === "wallet" ? " — Wallet refund issued" : ""),
          });
        },
        onError: (err: any) => {
          setCancelling(false);
          onCancelOrderError(err);
          toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const orders = data?.orders || [];
  const q = search.toLowerCase();

  const filtered = orders.filter((o: any) => {
    const matchSearch =
      o.id.toLowerCase().includes(q) ||
      (o.userName || "").toLowerCase().includes(q) ||
      (o.userPhone || "").includes(q);
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" &&
        ["confirmed", "preparing", "out_for_delivery"].includes(o.status)) ||
      o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pendingOrders = orders.filter((o: any) => o.status === "pending");
  const pendingCount = pendingOrders.length;
  const activeCount = orders.filter((o: any) =>
    ["confirmed", "preparing", "out_for_delivery"].includes(o.status)
  ).length;
  const deliveredCount = orders.filter((o: any) => o.status === "delivered").length;
  const _cancelledCount = orders.filter((o: any) => o.status === "cancelled").length;
  const totalRevenue = orders
    .filter((o: any) => o.status === "delivered")
    .reduce((s: number, o: any) => s + parseFloat(o.total || 0), 0);

  /* Last-refreshed ticker */
  const [secAgo, setSecAgo] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  useEffect(() => {
    if (!isLoading) {
      setLastRefreshed(new Date());
      setSecAgo(0);
    }
  }, [isLoading]);
  useEffect(() => {
    const t = setInterval(() => setSecAgo((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [lastRefreshed]);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Pharmacy page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          icon={Pill}
          title={T("pharmacyOrders")}
          subtitle={`${T("medicineDeliveries")} — ${orders.length} ${T("total")}`}
          iconBgClass="bg-pink-100"
          iconColorClass="text-pink-600"
          actions={
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${secAgo < 35 ? "bg-green-500" : "bg-amber-400"} animate-pulse`}
              />
              {isLoading ? "Refreshing..." : `Refreshed ${secAgo}s ago`}
            </div>
          }
        />

        {/* Pending pharmacy orders alert */}
        {pendingCount > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border-2 border-pink-300 bg-pink-50 px-4 py-3">
            <span className="text-2xl">💊</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-pink-800">
                {pendingCount} pharmacy order{pendingCount > 1 ? "s" : ""} waiting for confirmation!
              </p>
              <p className="text-xs text-pink-600">
                {pendingOrders
                  .slice(0, 3)
                  .map((o: any) => `#${o.id.slice(-6).toUpperCase()}`)
                  .join(" · ")}
                {pendingOrders.length > 3 ? ` +${pendingOrders.length - 3} more` : ""}
              </p>
            </div>
            <button
              onClick={() => setStatusFilter("pending")}
              className="rounded-xl bg-pink-500 px-3 py-1.5 text-xs font-bold whitespace-nowrap text-white transition-colors hover:bg-pink-600"
            >
              View All
            </button>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Card className="border-border/50 rounded-2xl p-4 text-center shadow-sm">
            <p className="text-foreground text-3xl font-bold">{orders.length}</p>
            <p className="text-muted-foreground mt-1 text-xs">{T("totalOrders")}</p>
          </Card>
          <Card className="border-border/50 rounded-2xl border-yellow-200/60 bg-yellow-50/60 p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-yellow-700">{pendingCount}</p>
            <p className="mt-1 text-xs text-yellow-500">{T("pending")}</p>
          </Card>
          <Card className="border-border/50 rounded-2xl border-blue-200/60 bg-blue-50/60 p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-blue-700">{activeCount}</p>
            <p className="mt-1 text-xs text-blue-500">{T("activeNow")}</p>
          </Card>
          <Card className="border-border/50 rounded-2xl border-green-200/60 bg-green-50/60 p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-green-700">{deliveredCount}</p>
            <p className="mt-1 text-xs text-green-500">{T("delivered")}</p>
          </Card>
          <Card className="border-border/50 col-span-2 rounded-2xl border-amber-200/60 bg-amber-50/60 p-4 text-center shadow-sm sm:col-span-1">
            <div className="mb-1 flex items-center justify-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-amber-700">{formatCurrency(totalRevenue)}</p>
            <p className="mt-1 text-xs text-amber-500">{T("revenue")}</p>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-border/50 flex flex-col gap-3 rounded-2xl p-3 shadow-sm sm:p-4">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search by ID, customer name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-muted/30 border-border/50 h-10 rounded-xl pl-9 text-sm sm:h-11"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              {
                key: "all",
                label: "All",
                cls: "border-border/50 text-muted-foreground hover:border-primary",
              },
              {
                key: "pending",
                label: "🟡 Pending",
                cls: "border-yellow-300 text-yellow-700 bg-yellow-50",
              },
              {
                key: "active",
                label: "🔵 Active",
                cls: "border-blue-300 text-blue-700 bg-blue-50",
              },
              {
                key: "out_for_delivery",
                label: "🛵 Out for Delivery",
                cls: "border-indigo-300 text-indigo-700 bg-indigo-50",
              },
              {
                key: "delivered",
                label: "✅ Delivered",
                cls: "border-green-300 text-green-700 bg-green-50",
              },
              {
                key: "cancelled",
                label: "❌ Cancelled",
                cls: "border-red-300 text-red-600 bg-red-50",
              },
            ].map(({ key, label, cls }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === key
                    ? "bg-primary border-primary text-white"
                    : `bg-muted/30 ${cls}`
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Card>

        {/* Mobile card list — shown below md breakpoint */}
        <section className="space-y-3 md:hidden" aria-label="Pharmacy orders">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-border/50 animate-pulse rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="bg-muted h-4 w-28 rounded" />
                    <div className="bg-muted h-3 w-20 rounded" />
                  </div>
                  <div className="bg-muted h-5 w-16 rounded-full" />
                </div>
              </Card>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-muted-foreground font-semibold">No orders found.</p>
            </div>
          ) : (
            filtered.map((order: any) => (
              <Card
                key={order.id}
                role="button"
                tabIndex={0}
                aria-label={`View pharmacy order ${order.id.slice(-8).toUpperCase()}, ${STATUS_LABELS[order.status] ?? order.status}`}
                className="border-border/50 cursor-pointer overflow-hidden rounded-2xl shadow-sm"
                onClick={() => {
                  setSelectedOrder(order);
                  setShowCancelConfirm(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedOrder(order);
                    setShowCancelConfirm(false);
                  }
                }}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold">
                        {order.id.slice(-8).toUpperCase()}
                      </p>
                      <Badge
                        variant="outline"
                        className="mt-1 border-pink-200 bg-pink-50 text-[10px] text-pink-600"
                      >
                        💊 Pharmacy
                      </Badge>
                    </div>
                    <Badge
                      className={`shrink-0 text-[10px] font-bold uppercase ${getStatusColor(order.status)}`}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </Badge>
                  </div>
                  {order.userName && (
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pink-100"
                        aria-hidden="true"
                      >
                        <User className="h-3.5 w-3.5 text-pink-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{order.userName}</p>
                        <p className="text-muted-foreground text-xs">{order.userPhone}</p>
                      </div>
                    </div>
                  )}
                  {order.prescriptionNote && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <p className="truncate">{order.prescriptionNote}</p>
                    </div>
                  )}
                  <div className="border-border/50 flex items-center justify-between border-t pt-2">
                    <div>
                      <p className="font-bold">{formatCurrency(order.total)}</p>
                      <p className="text-muted-foreground text-xs capitalize">
                        {order.paymentMethod === "wallet" ? "💳 Wallet" : "💵 Cash"}
                      </p>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(order.createdAt)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>

        {/* Desktop table — hidden below md breakpoint */}
        <Card className="border-border/50 hidden overflow-hidden rounded-2xl shadow-sm md:block">
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-semibold">{T("orderId")}</TableHead>
                  <TableHead className="font-semibold">{T("customer")}</TableHead>
                  <TableHead className="font-semibold">{T("prescription")}</TableHead>
                  <TableHead className="font-semibold">{T("total")}</TableHead>
                  <TableHead className="font-semibold">{T("status")}</TableHead>
                  <TableHead className="text-right font-semibold">{T("date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground h-32 text-center">
                      Loading pharmacy orders...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground h-32 text-center">
                      No orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((order: any) => (
                    <TableRow
                      key={order.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => {
                        setSelectedOrder(order);
                        setShowCancelConfirm(false);
                      }}
                    >
                      <TableCell>
                        <p className="font-mono text-sm font-medium">
                          {order.id.slice(-8).toUpperCase()}
                        </p>
                        <Badge
                          variant="outline"
                          className="mt-1 border-pink-200 bg-pink-50 text-[10px] text-pink-600"
                        >
                          💊 Pharmacy
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.userName ? (
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pink-100">
                              <User className="h-3.5 w-3.5 text-pink-600" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{order.userName}</p>
                              <p className="text-muted-foreground text-xs">{order.userPhone}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {order.prescriptionNote ? (
                          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <p className="truncate">{order.prescriptionNote}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">No note</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="font-bold">{formatCurrency(order.total)}</p>
                        <p className="text-muted-foreground text-xs capitalize">
                          {order.paymentMethod === "wallet" ? "💳 Wallet" : "💵 Cash"}
                        </p>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={order.status}
                          onValueChange={(val) => {
                            if (!ALLOWED_TRANSITIONS[order.status]?.includes(val)) {
                              toast({
                                title: "Invalid transition",
                                description: `Can't move ${STATUS_LABELS[order.status]} → ${STATUS_LABELS[val]}`,
                                variant: "destructive",
                              });
                              return;
                            }
                            handleUpdateStatus(order.id, val);
                          }}
                        >
                          <SelectTrigger
                            className={`h-8 w-36 border-2 text-[10px] font-bold tracking-wider uppercase sm:text-[11px] ${getStatusColor(order.status)}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ALLOWED_TRANSITIONS[order.status]?.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs font-bold uppercase">
                                {STATUS_LABELS[s] ?? s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap sm:text-sm">
                        {formatDate(order.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Order Detail Modal */}
        <Dialog
          open={!!selectedOrder}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedOrder(null);
              setShowCancelConfirm(false);
            }
          }}
        >
          <DialogContent className="max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto rounded-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pill className="h-5 w-5 text-pink-600" />
                Pharmacy Order Detail
                {selectedOrder && (
                  <Badge
                    variant="outline"
                    className={`ml-2 text-[10px] font-bold uppercase ${getStatusColor(selectedOrder.status)}`}
                  >
                    {STATUS_LABELS[selectedOrder.status]}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>

            {selectedOrder && (
              <div className="mt-2 space-y-4">
                {/* Cancel Confirmation Inline */}
                {showCancelConfirm && (
                  <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                      <p className="text-sm font-bold text-red-700">
                        Cancel Order #{selectedOrder.id.slice(-6).toUpperCase()}?
                      </p>
                    </div>
                    <p className="text-xs text-red-600">
                      {selectedOrder.paymentMethod === "wallet"
                        ? `${formatCurrency(Math.round(parseFloat(selectedOrder.total)))} customer ki wallet mein refund ho jayega.`
                        : "Cash order — no refund needed."}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowCancelConfirm(false)}
                        className="h-9 flex-1 rounded-xl border border-red-200 bg-white text-sm font-bold text-red-600"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleAdminCancel}
                        disabled={cancelling}
                        className="h-9 flex-1 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {cancelling ? "Cancelling..." : "Confirm Cancel"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Info grid */}
                <div className="bg-muted/40 space-y-2 rounded-xl p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Order ID</span>
                    <span className="font-mono font-bold">
                      {selectedOrder.id.slice(-8).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="text-foreground font-bold">
                      {formatCurrency(selectedOrder.total)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment</span>
                    <span
                      className={`font-medium ${selectedOrder.paymentMethod === "wallet" ? "text-blue-600" : "text-green-600"}`}
                    >
                      {selectedOrder.paymentMethod === "wallet" ? "💳 Wallet" : "💵 Cash"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span
                      className={`rounded border px-2 py-0.5 text-[11px] font-bold uppercase ${getStatusColor(selectedOrder.status)}`}
                    >
                      {STATUS_LABELS[selectedOrder.status]}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ordered</span>
                    <span className="text-xs">{formatDate(selectedOrder.createdAt)}</span>
                  </div>
                </div>

                {/* Customer Contact */}
                <div className="space-y-1.5 rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <p className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-blue-600 uppercase">
                    <User className="h-3 w-3" /> Customer
                  </p>
                  <p className="text-sm font-semibold text-gray-800">
                    {selectedOrder.userName || "Unknown"}
                  </p>
                  {selectedOrder.userPhone && (
                    <div className="flex gap-2 pt-1">
                      <a
                        href={`tel:${selectedOrder.userPhone}`}
                        className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50"
                      >
                        <Phone className="h-3 w-3" /> {selectedOrder.userPhone}
                      </a>
                      <a
                        href={`https://wa.me/92${selectedOrder.userPhone.replace(/^(\+92|0)/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 transition-colors hover:bg-green-100"
                      >
                        💬 WhatsApp
                      </a>
                    </div>
                  )}
                </div>

                {/* Prescription Note + Photo */}
                {(selectedOrder.prescriptionNote || selectedOrder.prescriptionPhotoUri) && (
                  <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="flex items-center gap-1 text-xs font-bold text-amber-700">
                      <FileText className="h-3.5 w-3.5" /> Prescription
                    </p>
                    {selectedOrder.prescriptionNote && (
                      <p className="text-sm text-amber-900">{selectedOrder.prescriptionNote}</p>
                    )}
                    {selectedOrder.prescriptionPhotoUri && (
                      <div className="mt-2">
                        <a
                          href={selectedOrder.prescriptionPhotoUri}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={selectedOrder.prescriptionPhotoUri}
                            alt="Prescription"
                            className="max-h-56 w-full cursor-pointer rounded-lg border border-amber-200 bg-white object-contain transition-opacity hover:opacity-90"
                          />
                        </a>
                        <p className="mt-1 text-[10px] text-amber-600">Click to open full image</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Items */}
                {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 && (
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                      <ShoppingCart className="h-4 w-4" /> Items ({selectedOrder.items.length})
                    </p>
                    <div className="space-y-2">
                      {selectedOrder.items.map((item: any, i: number) => (
                        <div
                          key={i}
                          className="bg-muted/30 flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                        >
                          <span className="font-medium">{item.name}</span>
                          <span className="text-muted-foreground">
                            ×{item.quantity} — {formatCurrency(item.price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  {!isTerminal(selectedOrder.status) && (
                    <div className="flex-1">
                      <p className="text-muted-foreground mb-1.5 text-xs font-medium">
                        Move to Next Status
                      </p>
                      <Select
                        value={selectedOrder.status}
                        onValueChange={(val) => {
                          if (val === selectedOrder.status) return;
                          handleUpdateStatus(selectedOrder.id, val, selectedOrder.status);
                          setSelectedOrder({ ...selectedOrder, status: val });
                        }}
                      >
                        <SelectTrigger
                          className={`h-9 border-2 text-[11px] font-bold tracking-wider uppercase ${getStatusColor(selectedOrder.status)}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALLOWED_TRANSITIONS[selectedOrder.status]
                            ?.filter((s) => s !== "cancelled")
                            .map((s) => (
                              <SelectItem key={s} value={s} className="text-xs font-bold uppercase">
                                <span className="flex items-center gap-1.5">
                                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                                  {STATUS_LABELS[s]}
                                </span>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {!isTerminal(selectedOrder.status) && !showCancelConfirm && (
                    <div>
                      <p className="text-muted-foreground mb-1.5 text-xs font-medium">
                        Admin Actions
                      </p>
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="flex h-9 items-center gap-1.5 rounded-xl border-2 border-red-300 bg-red-50 px-4 text-xs font-bold whitespace-nowrap text-red-600 transition-colors hover:bg-red-100"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Cancel & Refund
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
}
