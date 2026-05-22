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
import { useParcelBookings, useUpdateParcelBooking } from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { AlertTriangle, Box, CheckCircle2, MapPin, Phone, Search, User } from "lucide-react";
import { useEffect, useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  searching: "Searching",
  accepted: "Accepted",
  in_transit: "In Transit",
  completed: "Completed",
  cancelled: "Cancelled",
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["searching", "cancelled"],
  searching: ["accepted", "cancelled"],
  accepted: ["in_transit", "cancelled"],
  in_transit: ["completed", "cancelled"],
  completed: ["completed"],
  cancelled: ["cancelled"],
};

export default function Parcel() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data, isLoading } = useParcelBookings();
  const updateMutation = useUpdateParcelBooking();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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

  const handleUpdateStatus = (id: string, status: string) => {
    updateMutation.mutate(
      { id, status },
      {
        onSuccess: () => {
          toast({ title: `Status → ${STATUS_LABELS[status]} ✅` });
          if (selectedBooking?.id === id) setSelectedBooking((p: any) => ({ ...p, status }));
        },
        onError: (err) =>
          toast({ title: "Update failed", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleCancelBooking = () => {
    setCancelling(true);
    updateMutation.mutate(
      { id: selectedBooking.id, status: "cancelled" },
      {
        onSuccess: () => {
          setSelectedBooking((p: any) => ({ ...p, status: "cancelled" }));
          setShowCancelConfirm(false);
          setCancelling(false);
          toast({
            title:
              "Parcel booking cancelled ✅" +
              (selectedBooking.paymentMethod === "wallet" ? " — Wallet refund issued" : ""),
          });
        },
        onError: (err) => {
          setCancelling(false);
          toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const bookings = data?.bookings || [];
  const q = search.toLowerCase();
  const filtered = bookings.filter(
    (b: any) =>
      b.id.toLowerCase().includes(q) ||
      (b.userName || "").toLowerCase().includes(q) ||
      (b.userPhone || "").includes(q) ||
      (b.senderName || "").toLowerCase().includes(q) ||
      (b.receiverName || "").toLowerCase().includes(q)
  );

  const totalCount = bookings.length;
  const pendingCount = bookings.filter((b: any) =>
    ["pending", "searching"].includes(b.status)
  ).length;
  const activeCount = bookings.filter((b: any) =>
    ["accepted", "in_transit"].includes(b.status)
  ).length;
  const completedCount = bookings.filter((b: any) => b.status === "completed").length;
  const _cancelledCount = bookings.filter((b: any) => b.status === "cancelled").length;

  const isTerminal = (s: string) => s === "completed" || s === "cancelled";
  const canCancel = (b: any) => !isTerminal(b.status);
  const allowedNext = (b: any) => ALLOWED_TRANSITIONS[b.status] ?? [];

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Parcel page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          icon={Box}
          title={T("parcelBookings")}
          subtitle={`${totalCount} ${T("total")} · ${pendingCount} ${T("pending")} · ${activeCount} ${T("active")}`}
          iconBgClass="bg-orange-100"
          iconColorClass="text-orange-600"
          actions={
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${secAgo < 35 ? "bg-green-500" : "bg-amber-400"} animate-pulse`}
              />
              {isLoading ? "Refreshing..." : `Refreshed ${secAgo}s ago`}
            </div>
          }
        />

        {/* Pending parcel bookings alert */}
        {pendingCount > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border-2 border-orange-400 bg-orange-50 px-4 py-3">
            <span className="text-2xl">📫</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-orange-800">
                {pendingCount} parcel booking{pendingCount > 1 ? "s" : ""} pending / searching for a
                rider!
              </p>
              <p className="text-xs text-orange-600">
                {bookings
                  .filter((b: any) => ["pending", "searching"].includes(b.status))
                  .slice(0, 3)
                  .map((b: any) => `#${b.id.slice(-6).toUpperCase()}`)
                  .join(" · ")}
              </p>
            </div>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border-border/50 rounded-2xl p-4 text-center shadow-sm">
            <p className="text-foreground text-3xl font-bold">{totalCount}</p>
            <p className="text-muted-foreground mt-1 text-xs">{T("totalBookings")}</p>
          </Card>
          <Card className="border-border/50 rounded-2xl border-amber-200/60 bg-amber-50/60 p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-amber-700">{pendingCount}</p>
            <p className="mt-1 text-xs text-amber-600">{T("pending")}</p>
          </Card>
          <Card className="border-border/50 rounded-2xl border-blue-200/60 bg-blue-50/60 p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-blue-700">{activeCount}</p>
            <p className="mt-1 text-xs text-blue-500">{T("activeInTransit")}</p>
          </Card>
          <Card className="border-border/50 rounded-2xl border-green-200/60 bg-green-50/60 p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-green-700">{completedCount}</p>
            <p className="mt-1 text-xs text-green-500">{T("completed")}</p>
          </Card>
        </div>

        {/* Search */}
        <Card className="border-border/50 rounded-2xl p-3 shadow-sm sm:p-4">
          <div className="relative w-full max-w-md">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search by ID, sender, receiver, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-muted/30 border-border/50 h-11 rounded-xl pl-9"
            />
          </div>
        </Card>

        {/* Mobile card list — shown below md breakpoint */}
        <section className="space-y-3 md:hidden" aria-label="Parcel bookings">
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
              <Box className="text-muted-foreground/25 mb-3 h-10 w-10" aria-hidden="true" />
              <p className="text-muted-foreground font-semibold">No bookings found.</p>
            </div>
          ) : (
            filtered.map((b: any) => (
              <Card
                key={b.id}
                role="button"
                tabIndex={0}
                aria-label={`View parcel booking ${b.id.slice(-8).toUpperCase()}, ${STATUS_LABELS[b.status] ?? b.status}`}
                className="border-border/50 cursor-pointer overflow-hidden rounded-2xl shadow-sm"
                onClick={() => {
                  setSelectedBooking(b);
                  setShowCancelConfirm(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedBooking(b);
                    setShowCancelConfirm(false);
                  }
                }}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold">
                        {b.id.slice(-8).toUpperCase()}
                      </p>
                      <Badge variant="outline" className="mt-1 text-[10px] uppercase">
                        {b.parcelType}
                      </Badge>
                    </div>
                    <Badge
                      className={`shrink-0 text-[10px] font-bold uppercase ${getStatusColor(b.status)}`}
                    >
                      {STATUS_LABELS[b.status] ?? b.status}
                    </Badge>
                  </div>
                  {b.userName && (
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100"
                        aria-hidden="true"
                      >
                        <User className="h-3.5 w-3.5 text-orange-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{b.userName}</p>
                        <p className="text-muted-foreground text-xs">{b.userPhone}</p>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full bg-green-500"
                        aria-hidden="true"
                      />
                      <span className="truncate">
                        {b.senderName} — {b.pickupAddress}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                        aria-hidden="true"
                      />
                      <span className="truncate">
                        {b.receiverName} — {b.dropAddress}
                      </span>
                    </div>
                  </div>
                  <div className="border-border/50 flex items-center justify-between border-t pt-2">
                    <span className="text-foreground font-bold">{formatCurrency(b.fare)}</span>
                    <span className="text-muted-foreground text-xs">{formatDate(b.createdAt)}</span>
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
                  <TableHead className="font-semibold">{T("bookingId")}</TableHead>
                  <TableHead className="font-semibold">{T("bookedBy")}</TableHead>
                  <TableHead className="font-semibold">{T("route")}</TableHead>
                  <TableHead className="font-semibold">{T("fare")}</TableHead>
                  <TableHead className="font-semibold">{T("status")}</TableHead>
                  <TableHead className="text-right font-semibold">{T("date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground h-32 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground h-32 text-center">
                      No bookings found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((b: any) => (
                    <TableRow
                      key={b.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => {
                        setSelectedBooking(b);
                        setShowCancelConfirm(false);
                      }}
                    >
                      <TableCell>
                        <p className="font-mono text-sm font-medium">
                          {b.id.slice(-8).toUpperCase()}
                        </p>
                        <Badge variant="outline" className="mt-1 text-[10px] uppercase">
                          {b.parcelType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {b.userName ? (
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100">
                              <User className="h-3.5 w-3.5 text-orange-600" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{b.userName}</p>
                              <p className="text-muted-foreground text-xs">{b.userPhone}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                            <span className="max-w-[140px] truncate">
                              {b.senderName} — {b.pickupAddress}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                            <span className="max-w-[140px] truncate">
                              {b.receiverName} — {b.dropAddress}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-foreground font-bold">
                        {formatCurrency(b.fare)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={b.status}
                          onValueChange={(val) => {
                            if (!allowedNext(b).includes(val)) {
                              toast({
                                title: "Invalid transition",
                                description: `Can't move ${STATUS_LABELS[b.status]} → ${STATUS_LABELS[val]}`,
                                variant: "destructive",
                              });
                              return;
                            }
                            handleUpdateStatus(b.id, val);
                          }}
                        >
                          <SelectTrigger
                            className={`h-8 w-36 border-2 text-[11px] font-bold tracking-wider uppercase ${getStatusColor(b.status)}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {allowedNext(b).map((s) => (
                              <SelectItem key={s} value={s} className="text-xs font-bold uppercase">
                                {STATUS_LABELS[s] ?? s.replace("_", " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-sm">
                        {formatDate(b.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Booking Detail Modal */}
        <Dialog
          open={!!selectedBooking}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedBooking(null);
              setShowCancelConfirm(false);
            }
          }}
        >
          <DialogContent className="max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto rounded-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Box className="h-5 w-5 text-orange-600" />
                Parcel Booking Detail
                {selectedBooking && (
                  <Badge
                    variant="outline"
                    className={`ml-2 text-[10px] font-bold uppercase ${getStatusColor(selectedBooking.status)}`}
                  >
                    {STATUS_LABELS[selectedBooking.status]}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>

            {selectedBooking && (
              <div className="mt-2 space-y-4">
                {/* Cancel confirmation inline */}
                {showCancelConfirm && (
                  <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                      <p className="text-sm font-bold text-red-700">
                        Cancel Booking #{selectedBooking.id.slice(-6).toUpperCase()}?
                      </p>
                    </div>
                    <p className="text-xs text-red-600">
                      {selectedBooking.paymentMethod === "wallet"
                        ? `${formatCurrency(Math.round(selectedBooking.fare))} customer ki wallet mein refund ho jayega.`
                        : "Cash booking — no wallet refund needed."}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowCancelConfirm(false)}
                        className="h-9 flex-1 rounded-xl border border-red-200 bg-white text-sm font-bold text-red-600"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleCancelBooking}
                        disabled={cancelling}
                        className="h-9 flex-1 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {cancelling ? "Cancelling..." : "Confirm Cancel"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Info */}
                <div className="bg-muted/40 space-y-2 rounded-xl p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Booking ID</span>
                    <span className="font-mono font-bold">
                      {selectedBooking.id.slice(-8).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {selectedBooking.parcelType}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fare</span>
                    <span className="text-lg font-bold">
                      {formatCurrency(selectedBooking.fare)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment</span>
                    <span
                      className={`font-medium capitalize ${selectedBooking.paymentMethod === "wallet" ? "text-blue-600" : "text-green-600"}`}
                    >
                      {selectedBooking.paymentMethod === "wallet" ? "💳 Wallet" : "💵 Cash"}
                    </span>
                  </div>
                </div>

                {/* Sender & Receiver */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 rounded-xl border border-green-200 bg-green-50 p-3">
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-bold text-green-700">
                      <MapPin className="h-3 w-3" /> Sender (Pickup)
                    </p>
                    <p className="text-sm font-semibold text-gray-800">
                      {selectedBooking.senderName}
                    </p>
                    {selectedBooking.senderPhone && (
                      <div className="mt-1 flex gap-2">
                        <a
                          href={`tel:${selectedBooking.senderPhone}`}
                          className="flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                        >
                          <Phone className="h-3 w-3" /> Call
                        </a>
                        <a
                          href={`https://wa.me/92${selectedBooking.senderPhone.replace(/^(\+92|0)/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                        >
                          💬 WA
                        </a>
                      </div>
                    )}
                    <p className="text-muted-foreground mt-1 text-xs">
                      {selectedBooking.pickupAddress}
                    </p>
                  </div>
                  <div className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-bold text-red-700">
                      <MapPin className="h-3 w-3" /> Receiver (Drop)
                    </p>
                    <p className="text-sm font-semibold text-gray-800">
                      {selectedBooking.receiverName}
                    </p>
                    {selectedBooking.receiverPhone && (
                      <div className="mt-1 flex gap-2">
                        <a
                          href={`tel:${selectedBooking.receiverPhone}`}
                          className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                        >
                          <Phone className="h-3 w-3" /> Call
                        </a>
                        <a
                          href={`https://wa.me/92${selectedBooking.receiverPhone.replace(/^(\+92|0)/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                        >
                          💬 WA
                        </a>
                      </div>
                    )}
                    <p className="text-muted-foreground mt-1 text-xs">
                      {selectedBooking.dropAddress}
                    </p>
                  </div>
                </div>

                {selectedBooking.description && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <p className="mb-1 text-xs font-bold text-blue-700">Parcel Description</p>
                    <p className="text-sm text-blue-900">{selectedBooking.description}</p>
                  </div>
                )}

                {/* Action buttons */}
                {!isTerminal(selectedBooking.status) && (
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <p className="text-muted-foreground mb-1.5 text-xs font-medium">
                        Move to Next Status
                      </p>
                      <Select
                        value={selectedBooking.status}
                        onValueChange={(val) => {
                          if (val === selectedBooking.status) return;
                          handleUpdateStatus(selectedBooking.id, val);
                        }}
                      >
                        <SelectTrigger
                          className={`h-9 border-2 text-[11px] font-bold tracking-wider uppercase ${getStatusColor(selectedBooking.status)}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedNext(selectedBooking)
                            .filter((s) => s !== "cancelled")
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

                    {canCancel(selectedBooking) && !showCancelConfirm && (
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
                )}

                <p className="text-muted-foreground border-border/40 border-t pt-3 text-right text-xs">
                  Booked: {formatDate(selectedBooking.createdAt)}
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
}
