import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileDrawer } from "@/components/MobileDrawer";
import { PageHeader, StatCard } from "@/components/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LastUpdated } from "@/components/ui/LastUpdated";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAdminCancelRide,
  useAdminReassignRide,
  useAdminRefundRide,
  useCreateLocation,
  useCreateRideService,
  useCreateSchoolRoute,
  useDeleteLocation,
  useDeleteRideService,
  useDeleteSchoolRoute,
  useDispatchMonitor,
  usePlatformSettings,
  usePopularLocations,
  useRideAuditTrail,
  useRideDetail,
  useRidesEnriched,
  useRideServices,
  useSchoolRoutes,
  useSearchRiders,
  useUpdateLocation,
  useUpdatePlatformSettings,
  useUpdateRideService,
  useUpdateSchoolRoute,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { adminAbsoluteFetch, adminFetch, getAdminAccessToken } from "@/lib/adminFetcher";
import { formatCurrency, formatDate } from "@/lib/format";
import { createLogger } from "@/lib/logger";
import { isAbortError, useAbortableEffect } from "@/lib/useAbortableEffect";
import { useLanguage } from "@/lib/useLanguage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpDown,
  BarChart2,
  Bus,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  DollarSign,
  Eye,
  Filter,
  GraduationCap,
  Info,
  Layers,
  Loader2,
  MapPin,
  MessageCircle,
  Navigation,
  Pencil,
  Phone,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Shield,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TrendingUp,
  User,
  UserCheck,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { io } from "socket.io-client";
const log = createLogger("[rides]");

interface EnrichedRide {
  id: string;
  status: string;
  type: string;
  userId: string;
  riderId: string | null;
  userName: string | null;
  userPhone: string | null;
  riderName: string | null;
  riderPhone: string | null;
  pickupAddress: string;
  dropAddress: string;
  pickupLat: string | null;
  pickupLng: string | null;
  dropLat: string | null;
  dropLng: string | null;
  fare: number;
  distance: number;
  offeredFare: number | null;
  counterFare: number | null;
  paymentMethod: string;
  bargainStatus: string | null;
  totalBids: number;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  bargaining: "Bargaining",
  searching: "Searching",
  accepted: "Accepted",
  arrived: "Arrived",
  in_transit: "In Transit",
  completed: "Completed",
  cancelled: "Cancelled",
};
const SVC_ICONS: Record<string, string> = {
  bike: "🏍️",
  car: "🚗",
  rickshaw: "🛺",
  daba: "🚐",
  school_shift: "🚌",
};
const SVC_CLR: Record<string, string> = {
  bike: "bg-orange-50 text-orange-600 border-orange-200",
  car: "bg-sky-50 text-sky-600 border-sky-200",
  rickshaw: "bg-yellow-50 text-yellow-700 border-yellow-200",
  daba: "bg-purple-50 text-purple-600 border-purple-200",
  school_shift: "bg-blue-50 text-blue-600 border-blue-200",
};
const svcIcon = (type: string) => SVC_ICONS[type] ?? "🚗";
const svcClr = (type: string) => SVC_CLR[type] ?? "bg-gray-50 text-gray-600 border-gray-200";
const svcName = (type: string) => type?.replace(/_/g, " ") ?? "ride";
const isTerminal = (s: string) => s === "completed" || s === "cancelled";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TimeAgo({ date }: { date: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
      const sec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
      if (sec < 60) setLabel(`${sec}s ago`);
      else if (sec < 3600) setLabel(`${Math.floor(sec / 60)}m ago`);
      else setLabel(`${Math.floor(sec / 3600)}h ago`);
    };
    update();
    const t = setInterval(update, 10_000);
    return () => clearInterval(t);
  }, [date]);
  return <span>{label}</span>;
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

type Tab = "rides" | "dispatch" | "settings" | "services" | "locations" | "school" | "analytics";

function RideDetailModal({ rideId, onClose }: { rideId: string; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useRideDetail(rideId);
  const { data: auditData } = useRideAuditTrail(rideId);
  const cancelMut = useAdminCancelRide();
  const refundMut = useAdminRefundRide();
  const reassignMut = useAdminReassignRide();
  const { toast } = useToast();

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [showReassign, setShowReassign] = useState(false);
  const [assignName, setAssignName] = useState("");
  const [assignPhone, setAssignPhone] = useState("");
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [riderSearch, setRiderSearch] = useState("");
  const [debouncedRiderSearch, setDebouncedRiderSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedRiderSearch(riderSearch), 300);
    return () => clearTimeout(t);
  }, [riderSearch]);

  const { data: riderSearchData } = useSearchRiders(debouncedRiderSearch);

  if (isError)
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="w-[95vw] max-w-lg rounded-3xl">
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <p className="text-sm font-semibold text-red-600">Failed to load ride details</p>
            <p className="text-muted-foreground text-xs">
              {(error as Error)?.message || "Unknown error"}
            </p>
            <button
              onClick={() => refetch()}
              className="bg-primary rounded-xl px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            >
              Retry
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );

  if (isLoading || !data)
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="w-[95vw] max-w-lg rounded-3xl">
          <div className="flex items-center justify-center py-12">
            <div className="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
            <span className="text-muted-foreground ml-2 text-sm">Loading ride details...</span>
          </div>
        </DialogContent>
      </Dialog>
    );

  const { ride, customer, rider, fareBreakdown, eventLogs, bids, notifiedRiderCount } = data;
  const trail: any[] = auditData?.trail ?? [];

  const handleCancel = () => {
    cancelMut.mutate(
      { id: rideId, reason: cancelReason || undefined },
      {
        onSuccess: () => {
          toast({ title: "Ride cancelled" });
          onClose();
        },
        onError: (e: unknown) => {
          toast({
            title: "Failed to cancel ride",
            description:
              e instanceof Error ? (e instanceof Error ? e.message : String(e)) : "Unknown error",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleRefund = () => {
    const amt = refundAmount ? parseFloat(refundAmount) : undefined;
    if (amt !== undefined && (isNaN(amt) || amt <= 0)) {
      toast({ title: "Enter a valid positive amount", variant: "destructive" });
      return;
    }
    refundMut.mutate(
      { id: rideId, amount: amt, reason: refundReason || undefined },
      {
        onSuccess: (d: any) => {
          toast({ title: `Refunded ${formatCurrency(Number(d.refundedAmount))}` });
          setShowRefund(false);
          void refetch();
        },
        onError: (e: unknown) => {
          toast({
            title: "Refund failed",
            description:
              e instanceof Error ? (e instanceof Error ? e.message : String(e)) : "Unknown error",
            variant: "destructive",
          });
        },
      }
    );
  };

  const filteredRiders: any[] = riderSearchData?.riders ?? [];

  const selectRider = (r: any) => {
    setSelectedRiderId(r.id);
    setAssignName(r.name || "");
    setAssignPhone(r.phone || "");
  };

  const handleReassign = () => {
    if (!selectedRiderId) {
      toast({ title: "Select a rider from the list", variant: "destructive" });
      return;
    }
    if (selectedRiderId === ride?.riderId) {
      toast({ title: "Same rider already assigned", variant: "destructive" });
      return;
    }
    reassignMut.mutate(
      {
        id: rideId,
        riderId: selectedRiderId,
        riderName: assignName.trim(),
        riderPhone: assignPhone.trim(),
      },
      {
        onSuccess: () => {
          toast({ title: "Rider reassigned" });
          setShowReassign(false);
          void refetch();
        },
        onError: (e: unknown) => {
          toast({
            title: "Reassignment failed",
            description:
              e instanceof Error ? (e instanceof Error ? e.message : String(e)) : "Unknown error",
            variant: "destructive",
          });
        },
      }
    );
  };

  const openInMaps = () => {
    if (ride.pickupLat && ride.dropLat) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&origin=${ride.pickupLat},${ride.pickupLng}&destination=${ride.dropLat},${ride.dropLng}&travelmode=driving`,
        "_blank"
      );
    }
  };

  return (
    <MobileDrawer
      open
      onClose={onClose}
      title={
        <>
          <Car className="h-5 w-5 text-emerald-600" /> Ride Detail{" "}
          <StatusBadge status={ride.status} />{" "}
          <span className="text-muted-foreground ml-auto font-mono text-xs">
            #{ride.id.slice(-8).toUpperCase()}
          </span>
        </>
      }
      dialogClassName="w-[95vw] max-w-2xl rounded-3xl max-h-[90vh] overflow-y-auto"
    >
      <div className="mt-1 space-y-4">
        {/* Customer & Rider */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 rounded-xl border border-blue-100 bg-blue-50 p-3">
            <p className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-blue-600 uppercase">
              <User className="h-3 w-3" /> Customer
            </p>
            <p className="text-sm font-semibold text-gray-800">{customer?.name || "Unknown"}</p>
            {customer?.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              >
                <Phone className="h-3 w-3" /> {customer.phone}
              </a>
            )}
          </div>
          <div
            className={`space-y-1 rounded-xl border p-3 ${rider ? "border-green-100 bg-green-50" : "border-amber-100 bg-amber-50"}`}
          >
            <p
              className={`flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase ${rider ? "text-green-600" : "text-amber-600"}`}
            >
              <Car className="h-3 w-3" /> Rider
            </p>
            {rider ? (
              <>
                <p className="text-sm font-semibold text-gray-800">
                  {ride.riderName || rider.name}
                </p>
                {(ride.riderPhone || rider.phone) && (
                  <a
                    href={`tel:${ride.riderPhone || rider.phone}`}
                    className="flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                  >
                    <Phone className="h-3 w-3" /> {ride.riderPhone || rider.phone}
                  </a>
                )}
              </>
            ) : (
              <p className="text-xs font-semibold text-amber-600">Not assigned yet</p>
            )}
          </div>
        </div>

        {/* Fare Breakdown */}
        <div className="bg-muted/40 space-y-2 rounded-xl p-4 text-sm">
          <p className="text-muted-foreground mb-2 text-[10px] font-bold tracking-wide uppercase">
            Fare Breakdown
          </p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type</span>
            <Badge
              variant="outline"
              className={`text-[10px] font-bold uppercase ${svcClr(ride.type)}`}
            >
              {svcIcon(ride.type)} {svcName(ride.type)}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base Fare</span>
            <span className="font-bold">{formatCurrency(fareBreakdown.baseFare)}</span>
          </div>
          {fareBreakdown.surgeMultiplier > 1 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Surge ({fareBreakdown.surgeMultiplier}x)
              </span>
              <span className="font-bold text-orange-600">Applied</span>
            </div>
          )}
          {fareBreakdown.gstPct > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST ({fareBreakdown.gstPct}%)</span>
              <span className="font-bold">{formatCurrency(fareBreakdown.gstAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2">
            <span className="font-bold">Total Fare</span>
            <span className="text-lg font-extrabold">{formatCurrency(fareBreakdown.total)}</span>
          </div>
          {ride.offeredFare != null && (
            <div className="flex justify-between text-orange-600">
              <span>Customer Offer</span>
              <span className="font-bold">{formatCurrency(ride.offeredFare)}</span>
            </div>
          )}
          {ride.counterFare != null && (
            <div className="flex justify-between text-green-600">
              <span>Agreed Fare</span>
              <span className="font-bold">{formatCurrency(ride.counterFare)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Distance</span>
            <span>{ride.distance} km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment</span>
            <span
              className={`font-medium capitalize ${ride.paymentMethod === "wallet" ? "text-blue-600" : "text-green-600"}`}
            >
              {ride.paymentMethod === "wallet" ? "💳 Wallet" : "💵 Cash"}
            </span>
          </div>
          {notifiedRiderCount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Notified Riders</span>
              <span className="font-bold">{notifiedRiderCount}</span>
            </div>
          )}
        </div>

        {/* Route */}
        <div className="space-y-3 rounded-xl border border-green-200 bg-gradient-to-b from-green-50 to-red-50 p-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-muted-foreground flex items-center gap-1 text-xs font-bold">
              <Navigation className="h-3.5 w-3.5" /> Route
            </p>
            {ride.pickupLat && (
              <button
                onClick={openInMaps}
                className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100"
              >
                Open in Maps
              </button>
            )}
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            <div>
              <p className="text-[10px] font-bold tracking-wide text-green-700 uppercase">Pickup</p>
              <p className="text-sm">{ride.pickupAddress || "—"}</p>
            </div>
          </div>
          <div className="border-muted ml-[7px] h-3 border-l-2 border-dashed" />
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <p className="text-[10px] font-bold tracking-wide text-red-700 uppercase">Drop</p>
              <p className="text-sm">{ride.dropAddress || "—"}</p>
            </div>
          </div>
        </div>

        {/* Cancellation Reason */}
        {ride.status === "cancelled" && ride.cancellationReason && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <p className="text-[10px] font-bold tracking-wide text-red-700 uppercase">
                Cancellation Reason
              </p>
              <p className="mt-0.5 text-sm text-red-800">{ride.cancellationReason}</p>
            </div>
          </div>
        )}

        {/* Admin Actions */}
        {!showCancel && !showRefund && !showReassign && (
          <div className="flex flex-wrap gap-2">
            {!isTerminal(ride.status) && (
              <button
                onClick={() => setShowCancel(true)}
                className="flex h-10 min-w-[100px] flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-red-300 bg-red-50 text-xs font-bold text-red-600 transition-colors hover:bg-red-100"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            )}
            <button
              onClick={() => {
                setShowRefund(true);
                setRefundAmount(String(ride.fare));
              }}
              className="flex h-10 min-w-[100px] flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-blue-300 bg-blue-50 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100"
            >
              <DollarSign className="h-3.5 w-3.5" /> Refund
            </button>
            {!isTerminal(ride.status) && (
              <button
                onClick={() => setShowReassign(true)}
                className="flex h-10 min-w-[100px] flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-amber-300 bg-amber-50 text-xs font-bold text-amber-600 transition-colors hover:bg-amber-100"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" /> Reassign
              </button>
            )}
          </div>
        )}

        {/* Cancel confirmation */}
        {showCancel && (
          <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm font-bold text-red-700">
                Cancel Ride #{ride.id.slice(-6).toUpperCase()}?
              </p>
            </div>
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (optional)"
              className="text-sm"
            />
            <p className="text-xs text-red-600">
              {ride.paymentMethod === "wallet"
                ? `${formatCurrency(Math.round(ride.fare))} will be refunded to customer wallet.`
                : "Cash ride — no wallet refund needed."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCancel(false)}
                className="h-9 flex-1 rounded-xl border border-red-200 bg-white text-sm font-bold text-red-600"
              >
                Back
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelMut.isPending}
                className="h-9 flex-1 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-60"
              >
                {cancelMut.isPending ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        )}

        {/* Refund confirmation */}
        {showRefund && (
          <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 shrink-0 text-blue-600" />
              <p className="text-sm font-bold text-blue-700">Refund to Customer Wallet</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="Amount"
                className="text-sm"
              />
              <Input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Reason (optional)"
                className="text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRefund(false)}
                className="h-9 flex-1 rounded-xl border border-blue-200 bg-white text-sm font-bold text-blue-600"
              >
                Back
              </button>
              <button
                onClick={handleRefund}
                disabled={refundMut.isPending}
                className="h-9 flex-1 rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-60"
              >
                {refundMut.isPending
                  ? "Processing..."
                  : `Refund ${formatCurrency(Number(refundAmount || ride.fare))}`}
              </button>
            </div>
          </div>
        )}

        {/* Reassign */}
        {showReassign && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
              <UserCheck className="h-3.5 w-3.5" /> Reassign to a Different Rider
            </p>
            <Input
              value={riderSearch}
              onChange={(e) => {
                setRiderSearch(e.target.value);
                setSelectedRiderId(null);
              }}
              placeholder="Search rider by name or phone..."
              className="text-sm"
            />
            <div className="max-h-40 divide-y divide-amber-100 overflow-y-auto rounded-lg border border-amber-200 bg-white">
              {filteredRiders.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-xs">
                  No active riders found
                </p>
              ) : (
                filteredRiders.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => selectRider(r)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-amber-50 ${selectedRiderId === r.id ? "bg-amber-100 ring-2 ring-amber-400 ring-inset" : ""}`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${selectedRiderId === r.id ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-700"}`}
                    >
                      {(r.name || "?")[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.name || "Unnamed"}</p>
                      <p className="text-muted-foreground text-xs">{r.phone || "No phone"}</p>
                    </div>
                    {selectedRiderId === r.id && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-600" />
                    )}
                  </button>
                ))
              )}
            </div>
            {selectedRiderId && (
              <p className="text-xs font-medium text-amber-700">
                Selected: <span className="font-bold">{assignName}</span> ({assignPhone})
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowReassign(false);
                  setSelectedRiderId(null);
                  setRiderSearch("");
                }}
                className="h-9 flex-1 rounded-xl border border-amber-200 bg-white text-sm font-bold text-amber-600"
              >
                Back
              </button>
              <button
                onClick={handleReassign}
                disabled={reassignMut.isPending || !selectedRiderId}
                className="h-9 flex-1 rounded-xl bg-amber-500 text-sm font-bold text-white disabled:opacity-50"
              >
                {reassignMut.isPending ? "Assigning..." : "Confirm Reassign"}
              </button>
            </div>
          </div>
        )}

        {/* Status Timeline */}
        {eventLogs.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-2 flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase">
              <Navigation className="h-3 w-3" /> Journey Log ({eventLogs.length} events)
            </p>
            <div className="space-y-1.5">
              {eventLogs.map((log: any) => {
                const ts = new Date(log.createdAt);
                return (
                  <div
                    key={log.id}
                    className="bg-muted/30 border-border/30 flex items-start gap-3 rounded-lg border p-2 text-xs"
                  >
                    <span className="w-24 shrink-0 font-bold capitalize">
                      {log.event.replace(/_/g, " ")}
                    </span>
                    <div className="min-w-0 flex-1">
                      {log.lat != null && log.lng != null ? (
                        <a
                          href={`https://www.google.com/maps?q=${log.lat},${log.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-0.5 font-mono text-blue-600 hover:underline"
                        >
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          {log.lat.toFixed(5)}, {log.lng.toFixed(5)}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">No GPS</span>
                      )}
                      {log.notes && <p className="text-muted-foreground mt-0.5">{log.notes}</p>}
                    </div>
                    <span className="text-muted-foreground shrink-0 font-mono">
                      {ts.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bids */}
        {bids.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-2 text-[10px] font-bold tracking-wide uppercase">
              Rider Bids ({bids.length})
            </p>
            <div className="space-y-1.5">
              {bids.map((b: any) => (
                <div
                  key={b.id}
                  className="bg-muted/30 border-border/30 flex items-center justify-between rounded-lg border p-2 text-xs"
                >
                  <div>
                    <span className="font-bold">{formatCurrency(b.fare)}</span>
                    {b.note && <span className="text-muted-foreground ml-2">{b.note}</span>}
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${b.status === "accepted" ? "border-green-200 bg-green-100 text-green-700" : b.status === "rejected" ? "border-red-200 bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}
                  >
                    {b.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit Trail */}
        {trail.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-2 flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase">
              <Shield className="h-3 w-3" /> Admin Audit Trail ({trail.length})
            </p>
            <div className="space-y-1.5">
              {trail.map((e: any, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-purple-200 bg-purple-50 p-2 text-xs"
                >
                  <span className="w-24 shrink-0 font-bold text-purple-700 capitalize">
                    {e.action.replace(/_/g, " ")}
                  </span>
                  <span className="flex-1 text-purple-600">{e.details}</span>
                  <span className="text-muted-foreground shrink-0 font-mono">
                    {new Date(e.timestamp).toLocaleString("en-PK", {
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parcel Info */}
        {ride.isParcel && (
          <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-amber-800 uppercase">
              📦 Parcel Delivery
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {ride.receiverName && (
                <>
                  <span className="text-muted-foreground">Receiver</span>
                  <span className="text-right font-semibold">{ride.receiverName}</span>
                </>
              )}
              {ride.receiverPhone && (
                <>
                  <span className="text-muted-foreground">Phone</span>
                  <span className="text-right font-semibold">{ride.receiverPhone}</span>
                </>
              )}
              {ride.packageType && (
                <>
                  <span className="text-muted-foreground">Package</span>
                  <span className="text-right font-semibold capitalize">{ride.packageType}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* OTP Status */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Trip OTP:</span>
          {ride.otpVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-bold text-green-700">
              <CheckCircle2 className="h-3 w-3" /> Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 font-bold text-yellow-700">
              <Clock className="h-3 w-3" /> Pending
            </span>
          )}
          {ride.tripOtp && (
            <span className="text-muted-foreground ml-auto font-mono tracking-widest">
              {ride.tripOtp}
            </span>
          )}
        </div>

        {/* Event Timestamps */}
        <div className="border-border/50 bg-muted/20 space-y-1.5 rounded-xl border px-4 py-3">
          <p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            Event Timeline
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            <span className="text-muted-foreground">Requested</span>
            <span className="text-right font-semibold">{formatDate(ride.createdAt)}</span>
            {ride.acceptedAt && (
              <>
                <span className="text-muted-foreground">Accepted</span>
                <span className="text-right font-semibold">{formatDate(ride.acceptedAt)}</span>
              </>
            )}
            {ride.arrivedAt && (
              <>
                <span className="text-muted-foreground">Arrived</span>
                <span className="text-right font-semibold">{formatDate(ride.arrivedAt)}</span>
              </>
            )}
            {ride.startedAt && (
              <>
                <span className="text-muted-foreground">Started</span>
                <span className="text-right font-semibold">{formatDate(ride.startedAt)}</span>
              </>
            )}
            {ride.completedAt && (
              <>
                <span className="text-muted-foreground">Completed</span>
                <span className="text-right font-semibold">{formatDate(ride.completedAt)}</span>
              </>
            )}
            {ride.cancelledAt && (
              <>
                <span className="text-muted-foreground text-red-500">Cancelled</span>
                <span className="text-right font-semibold text-red-600">
                  {formatDate(ride.cancelledAt)}
                </span>
              </>
            )}
            <span className="text-muted-foreground">Last updated</span>
            <span className="text-right font-semibold">{formatDate(ride.updatedAt)}</span>
          </div>
        </div>
      </div>
    </MobileDrawer>
  );
}

/* ── Tile config hook: fetches provider from /api/maps/config?app=admin ── */
function useDispatchTileConfig() {
  const [tile, setTile] = useState<{ url: string; attribution: string; provider: string }>({
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    provider: "osm",
  });
  useAbortableEffect((signal) => {
    adminAbsoluteFetch("/api/maps/config?app=admin", { signal })
      .then((cfg: any) => {
        if (signal.aborted) return;
        const prov = cfg?.provider ?? "osm";
        const tok = cfg?.token ?? "";
        if (prov === "mapbox" && tok) {
          setTile({
            url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${tok}`,
            attribution:
              '© <a href="https://www.mapbox.com/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            provider: "mapbox",
          });
        } else if (prov === "google" && tok) {
          setTile({
            url: `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${tok}`,
            attribution: "© Google Maps",
            provider: "google",
          });
        }
      })
      .catch((err) => {
        if (isAbortError(err)) return;
      });
  }, []);
  return tile;
}

/* ── FitBounds: auto-zooms map to show all markers ── */
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const posKey = useMemo(() => positions.map((p) => p.join(",")).join("|"), [positions]);
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0]!, 14);
    } else {
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40], maxZoom: 15 });
    }
  }, [posKey, map, positions]);
  return null;
}

/* Fix leaflet default icons in Vite builds */
const _fixLeafletIcons = () => {
  delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
};
_fixLeafletIcons();

function makeRideIcon(color: string) {
  return L.divIcon({
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    html: `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
      <div style="background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:24px;height:24px;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">
      </div>
    </div>`,
  });
}

function DispatchMap({ rides }: { rides: any[] }) {
  const tile = useDispatchTileConfig();
  const geoRides = rides.filter((r) => r.pickupLat != null && r.pickupLng != null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const positions: [number, number][] = geoRides.map((r) => [r.pickupLat, r.pickupLng]);
  const center: [number, number] =
    positions.length > 0
      ? [
          positions.reduce((s, p) => s + p[0], 0) / positions.length,
          positions.reduce((s, p) => s + p[1], 0) / positions.length,
        ]
      : [34.3697, 73.4716];

  if (geoRides.length === 0) return null;

  return (
    <Card className="overflow-hidden rounded-2xl border-2 border-blue-200/60">
      <div className="flex items-center justify-between border-b border-blue-200/40 bg-blue-50/60 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-blue-700 uppercase">
          <MapPin className="h-3.5 w-3.5" /> Live Dispatch Map
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
            {tile.provider.toUpperCase()}
          </span>
          <span className="text-[10px] font-semibold text-blue-600">
            {geoRides.length} active pickup{geoRides.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
      <div className="h-[240px] sm:h-[340px]">
        <MapContainer
          center={center}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer url={tile.url} attribution={tile.attribution} maxZoom={19} />
          <FitBounds positions={positions} />
          {geoRides.map((r) => {
            const elapsed = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 1000);
            const isUrgent = elapsed > 120;
            const isBargaining = r.status === "bargaining";
            const color = isBargaining ? "#f97316" : isUrgent ? "#ef4444" : "#3b82f6";
            return (
              <Marker
                key={r.id}
                position={[r.pickupLat, r.pickupLng]}
                icon={makeRideIcon(color)}
                eventHandlers={{ click: () => setSelectedId(selectedId === r.id ? null : r.id) }}
              >
                <Popup>
                  <div className="min-w-[160px]">
                    <p className="text-sm font-bold">
                      {svcIcon(r.type)} #{r.id.slice(-6).toUpperCase()}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">{r.customerName}</p>
                    <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-gray-500">
                      {r.pickupAddress}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-800">
                        {formatCurrency(r.offeredFare ?? r.fare)}
                      </span>
                      <span
                        className={`text-xs font-bold ${elapsed > 120 ? "text-red-600" : "text-green-600"}`}
                      >
                        {formatElapsed(elapsed)}
                      </span>
                    </div>
                    <a
                      href={`https://www.google.com/maps?q=${r.pickupLat},${r.pickupLng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-[10px] text-blue-600 underline"
                    >
                      Open in Maps
                    </a>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
      <div className="bg-muted/30 text-muted-foreground flex items-center gap-4 border-t px-4 py-2 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Searching
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Bargaining
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-red-500" /> Urgent (&gt;2min)
        </span>
        <span className="text-muted-foreground ml-auto text-[10px]">
          Provider: {tile.provider.toUpperCase()} • Click marker for details
        </span>
      </div>
    </Card>
  );
}

function DispatchMonitor() {
  const { data, isLoading } = useDispatchMonitor();
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const token = getAdminAccessToken() ?? "";
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      query: { rooms: "admin-fleet" },
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("ride:dispatch-update", () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-dispatch-monitor"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-rides-enriched"] });
    });

    socket.on("connect_error", (err) => {
      log.warn("dispatch-monitor WebSocket connect_error:", err?.message ?? err);
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const rides: any[] = data?.rides ?? [];

  if (isLoading)
    return (
      <Card className="rounded-2xl p-12 text-center">
        <div className="border-primary mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
        <p className="text-muted-foreground text-sm">Loading dispatch monitor...</p>
      </Card>
    );

  if (rides.length === 0)
    return (
      <Card className="rounded-2xl p-12 text-center">
        <Radio className="text-muted-foreground/40 mx-auto mb-3 h-10 w-10" />
        <p className="text-muted-foreground font-bold">No active dispatches</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Rides in searching or bargaining state will appear here with live updates every 10 seconds
        </p>
      </Card>
    );

  const searching = rides.filter((r) => r.status === "searching");
  const bargaining = rides.filter((r) => r.status === "bargaining");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Search}
          label="Searching"
          value={searching.length}
          iconBgClass="bg-amber-100"
          iconColorClass="text-amber-600"
        />
        <StatCard
          icon={MessageCircle}
          label="Bargaining"
          value={bargaining.length}
          iconBgClass="bg-orange-100"
          iconColorClass="text-orange-600"
        />
        <StatCard
          icon={Users}
          label="Riders Notified"
          value={rides.reduce((s, r) => s + r.notifiedRiders, 0)}
          iconBgClass="bg-blue-100"
          iconColorClass="text-blue-600"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Bids"
          value={rides.reduce((s, r) => s + r.totalBids, 0)}
          iconBgClass="bg-green-100"
          iconColorClass="text-green-600"
        />
      </div>

      {/* Live Dispatch Map */}
      {rides.some((r) => r.pickupLat) && <DispatchMap rides={rides} />}

      {/* Mobile Dispatch Cards */}
      <div className="block space-y-3 md:hidden">
        {rides.map((r: any) => {
          const elapsed = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 1000);
          return (
            <Card key={r.id} className="border-border/50 space-y-2 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">
                    #{r.id.slice(-6).toUpperCase()}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold uppercase ${svcClr(r.type)}`}
                  >
                    {svcIcon(r.type)} {svcName(r.type)}
                  </Badge>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-bold uppercase ${r.status === "bargaining" ? "animate-pulse border-orange-200 bg-orange-100 text-orange-700" : "animate-pulse border-amber-200 bg-amber-100 text-amber-700"}`}
                >
                  {r.status === "bargaining" ? "💬 Bargaining" : "🔍 Searching"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <p className="font-medium">{r.customerName}</p>
                <span
                  className={`font-bold ${elapsed > 120 ? "text-red-600" : elapsed > 60 ? "text-amber-600" : "text-green-600"}`}
                >
                  {formatElapsed(elapsed)}
                </span>
              </div>
              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                <span>{r.notifiedRiders} notified</span>
                <span>{r.totalBids} bids</span>
                <span className="text-foreground ml-auto font-bold">
                  {formatCurrency(r.offeredFare ?? r.fare)}
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Desktop Dispatch Table */}
      <Card className="border-border/50 hidden overflow-hidden rounded-2xl shadow-sm md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Ride</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Elapsed</TableHead>
                <TableHead>Notified</TableHead>
                <TableHead>Bids</TableHead>
                <TableHead>Fare</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rides.map((r: any) => {
                const elapsed = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 1000);
                return (
                  <TableRow key={r.id} className="hover:bg-muted/20">
                    <TableCell>
                      <span className="font-mono text-sm font-bold">
                        #{r.id.slice(-6).toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{r.customerName}</p>
                      {r.customerPhone && (
                        <p className="text-muted-foreground text-xs">{r.customerPhone}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold uppercase ${svcClr(r.type)}`}
                      >
                        {svcIcon(r.type)} {svcName(r.type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold uppercase ${r.status === "bargaining" ? "animate-pulse border-orange-200 bg-orange-100 text-orange-700" : "animate-pulse border-amber-200 bg-amber-100 text-amber-700"}`}
                      >
                        {r.status === "bargaining" ? "💬 Bargaining" : "🔍 Searching"}
                      </Badge>
                      {r.bargainStatus && (
                        <p className="text-muted-foreground mt-0.5 text-[10px] capitalize">
                          {r.bargainStatus.replace(/_/g, " ")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-sm font-bold ${elapsed > 120 ? "text-red-600" : elapsed > 60 ? "text-amber-600" : "text-green-600"}`}
                      >
                        {formatElapsed(elapsed)}
                      </span>
                    </TableCell>
                    <TableCell className="font-bold">{r.notifiedRiders}</TableCell>
                    <TableCell className="font-bold">{r.totalBids}</TableCell>
                    <TableCell>
                      <span className="font-bold">{formatCurrency(r.offeredFare ?? r.fare)}</span>
                      {r.offeredFare && (
                        <p className="text-muted-foreground text-[10px]">
                          Platform: {formatCurrency(r.fare)}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function RideSettings() {
  const { data: settingsData, isLoading } = usePlatformSettings();
  const updateMut = useUpdatePlatformSettings();
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const DISPATCH_KEYS = [
    { key: "dispatch_min_radius_km", label: "Broadcast Radius (KM)", type: "number" },
    {
      key: "dispatch_request_timeout_sec",
      label: "Rider Accept Timeout (seconds)",
      type: "number",
    },
    { key: "dispatch_max_loops", label: "Max Dispatch Loops", type: "number" },
    { key: "dispatch_avg_speed_kmh", label: "Avg Rider Speed for ETA (km/h)", type: "number" },
    {
      key: "dispatch_ride_start_proximity_m",
      label: "Ride Start Proximity (meters)",
      type: "number",
    },
  ];
  const CANCELLATION_KEYS = [
    { key: "ride_cancellation_fee", label: "Cancellation Fee (Rs.)", type: "number" },
    {
      key: "rider_cancel_limit_daily",
      label: "Max Cancellations/Day Before Penalty",
      type: "number",
    },
    { key: "rider_cancel_penalty_amount", label: "Cancellation Penalty (Rs.)", type: "number" },
  ];
  const SURGE_KEYS = [
    { key: "ride_surge_enabled", label: "Surge Pricing", type: "toggle" },
    { key: "ride_surge_multiplier", label: "Surge Multiplier", type: "number" },
  ];
  const BARGAINING_KEYS = [
    { key: "ride_bargaining_enabled", label: "Price Bargaining", type: "toggle" },
    { key: "ride_bargaining_min_pct", label: "Min Offer % of Platform Fare", type: "number" },
    { key: "ride_bargaining_max_rounds", label: "Max Bargaining Rounds", type: "number" },
  ];
  const FARE_KEYS = [
    { key: "ride_bike_base_fare", label: "Bike Base Fare (Rs.)" },
    { key: "ride_bike_per_km", label: "Bike Per KM (Rs.)" },
    { key: "ride_bike_min_fare", label: "Bike Min Fare (Rs.)" },
    { key: "ride_car_base_fare", label: "Car Base Fare (Rs.)" },
    { key: "ride_car_per_km", label: "Car Per KM (Rs.)" },
    { key: "ride_car_min_fare", label: "Car Min Fare (Rs.)" },
    { key: "ride_rickshaw_base_fare", label: "Rickshaw Base Fare (Rs.)" },
    { key: "ride_rickshaw_per_km", label: "Rickshaw Per KM (Rs.)" },
    { key: "ride_rickshaw_min_fare", label: "Rickshaw Min Fare (Rs.)" },
    { key: "ride_daba_base_fare", label: "Daba On-Demand Base Fare (Rs.)" },
    { key: "ride_daba_per_km", label: "Daba On-Demand Per KM (Rs.)" },
    { key: "ride_daba_min_fare", label: "Daba On-Demand Min Fare (Rs.)" },
  ];

  useEffect(() => {
    if (settingsData?.settings) {
      const map: Record<string, string> = {};
      for (const s of settingsData.settings) map[s.key] = s.value;
      setForm(map);
    }
  }, [settingsData]);

  const getVal = (key: string) => form[key] ?? "";
  const setVal = (key: string, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const NUMERIC_BOUNDS: Record<string, { min: number; max: number; label: string }> = {
    dispatch_min_radius_km: { min: 0.1, max: 100, label: "Broadcast Radius" },
    dispatch_request_timeout_sec: { min: 5, max: 600, label: "Rider Accept Timeout" },
    dispatch_max_loops: { min: 1, max: 20, label: "Max Dispatch Loops" },
    dispatch_avg_speed_kmh: { min: 5, max: 200, label: "Avg Rider Speed" },
    dispatch_ride_start_proximity_m: { min: 10, max: 5000, label: "Start Proximity" },
    ride_cancellation_fee: { min: 0, max: 10000, label: "Cancellation Fee" },
    rider_cancel_limit_daily: { min: 1, max: 50, label: "Daily Cancel Limit" },
    rider_cancel_penalty_amount: { min: 0, max: 10000, label: "Cancel Penalty" },
    ride_surge_multiplier: { min: 1, max: 10, label: "Surge Multiplier" },
    ride_bargaining_min_pct: { min: 10, max: 100, label: "Min Offer %" },
    ride_bargaining_max_rounds: { min: 1, max: 20, label: "Max Bargaining Rounds" },
  };

  const validateSettings = (): string[] => {
    const errors: string[] = [];
    const allNumKeys = [
      ...DISPATCH_KEYS,
      ...CANCELLATION_KEYS,
      ...SURGE_KEYS,
      ...BARGAINING_KEYS,
      ...FARE_KEYS.map((f) => ({ ...f, type: "number" })),
    ].filter((k) => k.type === "number" || !k.type);
    for (const k of allNumKeys) {
      const val = getVal(k.key);
      if (val === "") continue;
      const num = parseFloat(val);
      if (isNaN(num)) {
        errors.push(`${k.label}: must be a valid number`);
        continue;
      }
      const bounds = NUMERIC_BOUNDS[k.key];
      if (bounds) {
        if (num < bounds.min) errors.push(`${bounds.label}: minimum ${bounds.min}`);
        if (num > bounds.max) errors.push(`${bounds.label}: maximum ${bounds.max}`);
      } else if (num < 0) {
        errors.push(`${k.label}: cannot be negative`);
      }
    }
    return errors;
  };

  const handleSave = () => {
    const errors = validateSettings();
    if (errors.length > 0) {
      toast({ title: "Validation errors", description: errors.join("; "), variant: "destructive" });
      return;
    }
    const allKeys = [
      ...DISPATCH_KEYS,
      ...CANCELLATION_KEYS,
      ...SURGE_KEYS,
      ...BARGAINING_KEYS,
      ...FARE_KEYS.map((f) => ({ ...f, type: "number" })),
    ];
    const settings = allKeys
      .map((k) => ({ key: k.key, value: getVal(k.key) }))
      .filter((s) => s.value !== "");
    updateMut.mutate(settings, {
      onSuccess: () => {
        toast({ title: "Settings saved" });
        setDirty(false);
        setShowConfirm(false);
      },
      onError: (e) =>
        toast({
          title: "Failed to save",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        }),
    });
  };

  if (isLoading)
    return (
      <Card className="rounded-2xl p-12 text-center">
        <p className="text-muted-foreground">Loading settings...</p>
      </Card>
    );

  const renderField = (f: { key: string; label: string; type?: string }) => {
    if (f.type === "toggle") {
      const isOn = getVal(f.key) === "on";
      return (
        <div key={f.key} className="flex items-center justify-between py-2">
          <span className="text-sm font-medium">{f.label}</span>
          <button
            onClick={() => setVal(f.key, isOn ? "off" : "on")}
            disabled={updateMut.isPending}
            className={`rounded-xl p-1 transition-colors disabled:opacity-50 ${isOn ? "text-green-600" : "text-gray-400"}`}
          >
            {updateMut.isPending ? (
              <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            ) : isOn ? (
              <ToggleRight className="h-8 w-8" />
            ) : (
              <ToggleLeft className="h-8 w-8" />
            )}
          </button>
        </div>
      );
    }
    return (
      <div key={f.key}>
        <label className="text-muted-foreground mb-1 block text-xs font-semibold">{f.label}</label>
        <Input
          type="number"
          value={getVal(f.key)}
          onChange={(e) => setVal(f.key, e.target.value)}
          className="text-sm"
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Ride & Dispatch Settings</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Configure dispatch engine, fares, and surge rules
          </p>
        </div>
        {dirty && (
          <button
            onClick={() => setShowConfirm(true)}
            className="bg-primary flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            <Save className="h-4 w-4" /> Save Changes
          </button>
        )}
      </div>

      {/* Confirm Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Confirm Settings Change
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Are you sure you want to update ride and dispatch settings? Changes will take effect
            immediately for all users.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowConfirm(false)}
              className="hover:bg-muted rounded-xl border px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={updateMut.isPending}
              className="bg-primary rounded-xl px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {updateMut.isPending ? "Saving..." : "Confirm & Save"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="space-y-4 rounded-2xl p-5">
          <p className="text-foreground flex items-center gap-2 text-sm font-bold">
            <Radio className="h-4 w-4 text-blue-600" /> Dispatch Engine
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DISPATCH_KEYS.map(renderField)}
          </div>
        </Card>

        <Card className="space-y-4 rounded-2xl p-5">
          <p className="text-foreground flex items-center gap-2 text-sm font-bold">
            <AlertTriangle className="h-4 w-4 text-red-600" /> Cancellation
          </p>
          <div className="grid grid-cols-1 gap-3">{CANCELLATION_KEYS.map(renderField)}</div>
        </Card>

        <Card className="space-y-4 rounded-2xl p-5">
          <p className="text-foreground flex items-center gap-2 text-sm font-bold">
            <Zap className="h-4 w-4 text-orange-600" /> Surge Pricing
          </p>
          <div className="space-y-3">{SURGE_KEYS.map(renderField)}</div>
        </Card>

        <Card className="space-y-4 rounded-2xl p-5">
          <p className="text-foreground flex items-center gap-2 text-sm font-bold">
            <MessageCircle className="h-4 w-4 text-purple-600" /> Bargaining
          </p>
          <div className="space-y-3">{BARGAINING_KEYS.map(renderField)}</div>
        </Card>

        <Card className="space-y-4 rounded-2xl p-5 lg:col-span-2">
          <p className="text-foreground flex items-center gap-2 text-sm font-bold">
            <DollarSign className="h-4 w-4 text-green-600" /> Per-Service Fare Rates
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {FARE_KEYS.map((f) => renderField({ ...f, type: "number" }))}
          </div>
          <div className="mt-1 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-amber-800">
              <strong>Daba (On-Demand) fares above do not apply to Van bookings.</strong> Van
              intercity routes use a fixed per-route fare set in the{" "}
              <a href="/van" className="font-semibold underline hover:text-amber-900">
                Van Management page
              </a>
              .
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

interface ServiceFormValues {
  key: string;
  name: string;
  nameUrdu: string;
  icon: string;
  description: string;
  baseFare: string;
  perKm: string;
  minFare: string;
  maxPassengers: string;
  allowBargaining: boolean;
  color: string;
}

interface ServiceFormPanelProps {
  isNew: boolean;
  form: ServiceFormValues;
  setForm: React.Dispatch<React.SetStateAction<ServiceFormValues>>;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
}

function ServiceFormPanel({
  isNew,
  form,
  setForm,
  onSubmit,
  onCancel,
  isPending,
}: ServiceFormPanelProps) {
  return (
    <Card className="border-primary/20 bg-primary/5 space-y-4 rounded-2xl border-2 p-5">
      <h3 className="text-base font-bold">{isNew ? "Add Custom Service" : `Edit: ${form.name}`}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold">Icon</label>
          <Input
            value={form.icon}
            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
            placeholder="🚗"
            className="text-2xl"
          />
        </div>
        {isNew && (
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-semibold">Key</label>
            <Input
              value={form.key}
              onChange={(e) =>
                setForm((f) => ({ ...f, key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))
              }
              placeholder="school_van"
            />
          </div>
        )}
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold">Name</label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="School Van"
          />
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold">
            Name (Urdu)
          </label>
          <Input
            value={form.nameUrdu}
            onChange={(e) => setForm((f) => ({ ...f, nameUrdu: e.target.value }))}
            className="text-right"
            dir="rtl"
          />
        </div>
        <div className={isNew ? "sm:col-span-2" : ""}>
          <label className="text-muted-foreground mb-1 block text-xs font-semibold">
            Description
          </label>
          <Input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      </div>
      <div className="border-t pt-4">
        <p className="text-muted-foreground mb-3 text-xs font-bold tracking-wide uppercase">
          Fare Settings (Rs.)
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Base Fare", key: "baseFare" },
            { label: "Per Km", key: "perKm" },
            { label: "Min Fare", key: "minFare" },
            { label: "Max Pax", key: "maxPassengers" },
          ].map((f) => (
            <div key={f.key}>
              <label className="text-muted-foreground mb-1 block text-xs font-semibold">
                {f.label}
              </label>
              <Input
                type="number"
                value={form[f.key as keyof ServiceFormValues] as string}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={form.allowBargaining}
          onChange={(e) => setForm((f) => ({ ...f, allowBargaining: e.target.checked }))}
          className="h-4 w-4 rounded"
        />
        <span className="text-sm font-medium">Allow Bargaining</span>
      </label>
      <div className="flex gap-3">
        <button
          onClick={onSubmit}
          disabled={isPending}
          className="bg-primary flex-1 rounded-xl py-2.5 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? "Saving..." : isNew ? "Create" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="text-muted-foreground hover:bg-muted/50 rounded-xl border px-4 py-2.5 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </Card>
  );
}

function ServicesManager() {
  const { data: svcData, isLoading: svcLoading } = useRideServices();
  const createMut = useCreateRideService();
  const updateMut = useUpdateRideService();
  const deleteMut = useDeleteRideService();
  const { toast } = useToast();

  const services: any[] = svcData?.services ?? [];
  const EMPTY_FORM: ServiceFormValues = {
    key: "",
    name: "",
    nameUrdu: "",
    icon: "🚗",
    description: "",
    baseFare: "15",
    perKm: "8",
    minFare: "50",
    maxPassengers: "1",
    allowBargaining: true,
    color: "#6B7280",
  };
  const [form, setForm] = useState<ServiceFormValues>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [delConfirm, setDelConfirm] = useState<string | null>(null);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    setShowAdd(false);
  };

  const startEdit = (svc: any) => {
    setEditId(svc.id);
    setShowAdd(false);
    setForm({
      key: svc.key,
      name: svc.name,
      nameUrdu: svc.nameUrdu || "",
      icon: svc.icon,
      description: svc.description || "",
      baseFare: String(svc.baseFare),
      perKm: String(svc.perKm),
      minFare: String(svc.minFare),
      maxPassengers: String(svc.maxPassengers),
      allowBargaining: svc.allowBargaining,
      color: svc.color || "#6B7280",
    });
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!form.icon.trim()) {
      toast({ title: "Icon is required", variant: "destructive" });
      return;
    }
    if (!editId && !form.key.trim()) {
      toast({ title: "Key is required for new services", variant: "destructive" });
      return;
    }
    if (isNaN(Number(form.baseFare)) || Number(form.baseFare) < 0) {
      toast({ title: "Base fare must be a valid non-negative number", variant: "destructive" });
      return;
    }
    if (isNaN(Number(form.perKm)) || Number(form.perKm) < 0) {
      toast({ title: "Per KM rate must be a valid non-negative number", variant: "destructive" });
      return;
    }
    if (isNaN(Number(form.minFare)) || Number(form.minFare) < 0) {
      toast({ title: "Min fare must be a valid non-negative number", variant: "destructive" });
      return;
    }
    const payload = {
      ...form,
      baseFare: Number(form.baseFare),
      perKm: Number(form.perKm),
      minFare: Number(form.minFare),
      maxPassengers: Number(form.maxPassengers),
      sortOrder: services.length,
    };
    try {
      if (editId) {
        await updateMut.mutateAsync({ id: editId, ...payload });
        toast({ title: "Service updated" });
      } else {
        await createMut.mutateAsync(payload);
        toast({ title: "Service created" });
      }
      resetForm();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  const toggleEnabled = (svc: any) => {
    updateMut.mutate(
      { id: svc.id, isEnabled: !svc.isEnabled },
      {
        onSuccess: () => toast({ title: svc.isEnabled ? "Disabled" : "Enabled" }),
        onError: (e: Error) =>
          toast({
            title: "Toggle failed",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          }),
      }
    );
  };

  const reorder = async (svc: any, dir: "up" | "down") => {
    const sorted = [...services].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((s) => s.id === svc.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx]!;
    try {
      await updateMut.mutateAsync({ id: svc.id, sortOrder: other.sortOrder });
      await updateMut.mutateAsync({ id: other.id, sortOrder: svc.sortOrder });
    } catch (e: unknown) {
      toast({
        title: "Reorder failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMut.mutateAsync(id);
      toast({ title: "Service deleted" });
      setDelConfirm(null);
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const sorted = [...services].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold">Ride Services Management</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Control which vehicle services customers can book.
          </p>
        </div>
        <button
          onClick={() => {
            setShowAdd(true);
            setEditId(null);
            setForm({ ...EMPTY_FORM });
          }}
          className="bg-primary flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add Service
        </button>
      </div>

      {showAdd && !editId && (
        <ServiceFormPanel
          isNew
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          onCancel={resetForm}
          isPending={isPending}
        />
      )}

      {svcLoading ? (
        <Card className="rounded-2xl p-12 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((svc, idx) => (
            <Card
              key={svc.id}
              className={`overflow-hidden rounded-2xl border-2 transition-all ${svc.isEnabled ? "border-border/50" : "border-border/30 border-dashed opacity-60"}`}
            >
              <div className="h-1.5" style={{ backgroundColor: svc.color ?? "#6B7280" }} />
              <div className="p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="border-border/30 flex h-12 w-12 items-center justify-center rounded-xl border text-2xl shadow-sm"
                      style={{ backgroundColor: svc.color ? `${svc.color}18` : "#6B728018" }}
                    >
                      {svc.icon}
                    </div>
                    <div>
                      <p className="text-base leading-tight font-bold">{svc.name}</p>
                      {svc.nameUrdu && (
                        <p className="text-muted-foreground text-xs font-medium" dir="rtl">
                          {svc.nameUrdu}
                        </p>
                      )}
                      <code className="text-muted-foreground/60 bg-muted/40 rounded px-1 text-[10px]">
                        {svc.key}
                      </code>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleEnabled(svc)}
                    disabled={updateMut.isPending}
                    className={`rounded-xl p-1.5 disabled:opacity-50 ${svc.isEnabled ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}
                  >
                    {updateMut.isPending ? (
                      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                    ) : svc.isEnabled ? (
                      <ToggleRight className="h-6 w-6" />
                    ) : (
                      <ToggleLeft className="h-6 w-6" />
                    )}
                  </button>
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {[
                    { l: "Base", v: `Rs. ${svc.baseFare}` },
                    { l: "Per km", v: `Rs. ${svc.perKm}` },
                    { l: "Min", v: `Rs. ${svc.minFare}` },
                  ].map((f) => (
                    <div key={f.l} className="bg-muted/30 rounded-xl p-2 text-center">
                      <p className="text-xs font-bold">{f.v}</p>
                      <p className="text-muted-foreground text-[10px]">{f.l}</p>
                    </div>
                  ))}
                </div>
                {editId === svc.id && (
                  <ServiceFormPanel
                    isNew={false}
                    form={form}
                    setForm={setForm}
                    onSubmit={handleSubmit}
                    onCancel={resetForm}
                    isPending={isPending}
                  />
                )}
                {editId !== svc.id && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => reorder(svc, "up")}
                        disabled={idx === 0}
                        className="text-muted-foreground hover:text-foreground rounded-lg p-1.5 disabled:opacity-30"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => reorder(svc, "down")}
                        disabled={idx === sorted.length - 1}
                        className="text-muted-foreground hover:text-foreground rounded-lg p-1.5 disabled:opacity-30"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => startEdit(svc)}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted/40 flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    {svc.isCustom &&
                      (delConfirm === svc.id ? (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleDelete(svc.id)}
                            className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDelConfirm(null)}
                            className="rounded-xl border px-3 py-2 text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDelConfirm(svc.id)}
                          className="rounded-xl p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function LocationsManager() {
  const { data, isLoading } = usePopularLocations();
  const createMut = useCreateLocation();
  const updateMut = useUpdateLocation();
  const deleteMut = useDeleteLocation();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    nameUrdu: "",
    lat: "",
    lng: "",
    category: "general",
    icon: "📍",
    sortOrder: "0",
    isActive: true,
  });
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const locations = data?.locations || [];
  const CATEGORIES = ["chowk", "school", "hospital", "bazar", "park", "landmark", "general"];

  const openAdd = () => {
    setEditing(null);
    setForm({
      name: "",
      nameUrdu: "",
      lat: "",
      lng: "",
      category: "general",
      icon: "📍",
      sortOrder: "0",
      isActive: true,
    });
    setShowForm(true);
  };
  const openEdit = (l: any) => {
    setEditing(l);
    setForm({
      name: l.name,
      nameUrdu: l.nameUrdu || "",
      lat: String(l.lat),
      lng: String(l.lng),
      category: l.category,
      icon: l.icon,
      sortOrder: String(l.sortOrder),
      isActive: l.isActive,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.name || !form.lat || !form.lng) {
      toast({ title: "Name, Lat & Lng required", variant: "destructive" });
      return;
    }
    const payload = {
      ...form,
      sortOrder: Number(form.sortOrder),
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
    };
    if (editing) {
      updateMut.mutate(
        { id: editing.id, ...payload },
        {
          onSuccess: () => {
            toast({ title: "Location updated" });
            setShowForm(false);
          },
          onError: (e) =>
            toast({
              title: "Error",
              description: e instanceof Error ? e.message : String(e),
              variant: "destructive",
            }),
        }
      );
    } else {
      createMut.mutate(payload, {
        onSuccess: () => {
          toast({ title: "Location added" });
          setShowForm(false);
        },
        onError: (e) =>
          toast({
            title: "Error",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          }),
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Popular Locations</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Manage quick-pick stops shown in the customer app
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-primary hover:bg-primary/90 flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Add Location
        </button>
      </div>
      {isLoading ? (
        <Card className="rounded-2xl p-8 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </Card>
      ) : locations.length === 0 ? (
        <Card className="rounded-2xl p-8 text-center">
          <MapPin className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
          <p className="text-muted-foreground font-semibold">No locations yet</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((l: any) => (
            <Card
              key={l.id}
              className={`rounded-2xl border-2 p-4 ${l.isActive ? "border-border/50" : "border-muted-foreground/30 border-dashed opacity-60"}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{l.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{l.name}</p>
                  {l.nameUrdu && (
                    <p className="text-muted-foreground text-xs" dir="rtl">
                      {l.nameUrdu}
                    </p>
                  )}
                  <p className="text-muted-foreground mt-1 text-[10px]">
                    {l.lat?.toFixed(4)}, {l.lng?.toFixed(4)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <button
                    onClick={() => updateMut.mutate({ id: l.id, isActive: !l.isActive })}
                    disabled={updateMut.isPending}
                    className="disabled:opacity-50"
                  >
                    {updateMut.isPending ? (
                      <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
                    ) : l.isActive ? (
                      <ToggleRight className="h-5 w-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    onClick={() => openEdit(l)}
                    className="text-muted-foreground hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(l)}
                    className="text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-muted-foreground text-xs font-medium">Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-medium">Urdu</label>
                <Input
                  value={form.nameUrdu}
                  onChange={(e) => setForm((f) => ({ ...f, nameUrdu: e.target.value }))}
                  dir="rtl"
                  className="mt-1 rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-muted-foreground text-xs font-medium">Latitude</label>
                <Input
                  type="number"
                  step="0.000001"
                  value={form.lat}
                  onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-medium">Longitude</label>
                <Input
                  type="number"
                  step="0.000001"
                  value={form.lng}
                  onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                  className="mt-1 rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-muted-foreground text-xs font-medium">Category</label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger className="mt-1 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-medium">Icon</label>
                <Input
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-medium">Sort</label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  className="mt-1 rounded-xl"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="hover:bg-muted rounded-xl border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={createMut.isPending || updateMut.isPending}
                className="bg-primary rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {editing ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" /> Delete Location
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">"{deleteTarget?.name}"</span>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMut.mutate(deleteTarget.id, {
                  onError: (e: Error) =>
                    toast({
                      title: "Delete failed",
                      description: e instanceof Error ? e.message : String(e),
                      variant: "destructive",
                    }),
                });
                setDeleteTarget(null);
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SchoolRoutesManager() {
  const { data: routesData, isLoading } = useSchoolRoutes();
  const createMut = useCreateSchoolRoute();
  const updateMut = useUpdateSchoolRoute();
  const deleteMut = useDeleteSchoolRoute();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    routeName: "",
    schoolName: "",
    schoolNameUrdu: "",
    fromArea: "",
    fromAreaUrdu: "",
    toAddress: "",
    monthlyPrice: "",
    morningTime: "7:30 AM",
    afternoonTime: "",
    capacity: "30",
    vehicleType: "school_shift",
    notes: "",
    isActive: true,
    sortOrder: "0",
  });
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const routes = routesData?.routes || [];

  const openAdd = () => {
    setEditing(null);
    setForm({
      routeName: "",
      schoolName: "",
      schoolNameUrdu: "",
      fromArea: "",
      fromAreaUrdu: "",
      toAddress: "",
      monthlyPrice: "",
      morningTime: "7:30 AM",
      afternoonTime: "",
      capacity: "30",
      vehicleType: "school_shift",
      notes: "",
      isActive: true,
      sortOrder: "0",
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (
      !form.routeName ||
      !form.schoolName ||
      !form.fromArea ||
      !form.toAddress ||
      !form.monthlyPrice
    ) {
      toast({ title: "Fill required fields", variant: "destructive" });
      return;
    }
    const payload = {
      ...form,
      sortOrder: Number(form.sortOrder),
      capacity: Number(form.capacity),
      monthlyPrice: parseFloat(form.monthlyPrice),
    };
    if (editing) {
      updateMut.mutate(
        { id: editing.id, ...payload },
        {
          onSuccess: () => {
            toast({ title: "Route updated" });
            setShowForm(false);
          },
          onError: (e) =>
            toast({
              title: "Error",
              description: e instanceof Error ? e.message : String(e),
              variant: "destructive",
            }),
        }
      );
    } else {
      createMut.mutate(payload, {
        onSuccess: () => {
          toast({ title: "Route added" });
          setShowForm(false);
        },
        onError: (e) =>
          toast({
            title: "Error",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          }),
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">School Routes</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Monthly school transport subscriptions
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-primary flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Add Route
        </button>
      </div>
      {isLoading ? (
        <Card className="rounded-2xl p-8 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </Card>
      ) : routes.length === 0 ? (
        <Card className="rounded-2xl p-10 text-center">
          <Bus className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
          <p className="text-muted-foreground font-bold">No routes yet</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {routes.map((r: any) => (
            <Card
              key={r.id}
              className={`rounded-2xl border-2 p-4 ${r.isActive ? "border-border/50" : "border-dashed opacity-60"}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-lg text-blue-600">
                  🚌
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{r.routeName}</p>
                  <p className="text-muted-foreground text-xs">{r.schoolName}</p>
                  <div className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                    <MapPin className="h-3 w-3" />
                    {r.fromArea} → {r.toAddress}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">
                      Rs. {r.monthlyPrice?.toLocaleString()}/mo
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                      <Users className="mr-0.5 inline h-3 w-3" />
                      {r.enrolledCount}/{r.capacity}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <button onClick={() => updateMut.mutate({ id: r.id, isActive: !r.isActive })}>
                    {r.isActive ? (
                      <ToggleRight className="h-5 w-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(r);
                      setForm({
                        routeName: r.routeName,
                        schoolName: r.schoolName,
                        schoolNameUrdu: r.schoolNameUrdu || "",
                        fromArea: r.fromArea,
                        fromAreaUrdu: r.fromAreaUrdu || "",
                        toAddress: r.toAddress,
                        monthlyPrice: String(r.monthlyPrice),
                        morningTime: r.morningTime || "7:30 AM",
                        afternoonTime: r.afternoonTime || "",
                        capacity: String(r.capacity),
                        vehicleType: r.vehicleType,
                        notes: r.notes || "",
                        isActive: r.isActive,
                        sortOrder: String(r.sortOrder),
                      });
                      setShowForm(true);
                    }}
                    className="text-muted-foreground hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(r)}
                    className="text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Route" : "Add Route"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-muted-foreground text-xs font-medium">Route Name</label>
                <Input
                  value={form.routeName}
                  onChange={(e) => setForm((f) => ({ ...f, routeName: e.target.value }))}
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-medium">School Name</label>
                <Input
                  value={form.schoolName}
                  onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-medium">From Area</label>
                <Input
                  value={form.fromArea}
                  onChange={(e) => setForm((f) => ({ ...f, fromArea: e.target.value }))}
                  className="mt-1 rounded-xl"
                />
              </div>
              <div className="col-span-2">
                <label className="text-muted-foreground text-xs font-medium">
                  School Address (To)
                </label>
                <Input
                  value={form.toAddress}
                  onChange={(e) => setForm((f) => ({ ...f, toAddress: e.target.value }))}
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-medium">Monthly Price</label>
                <Input
                  type="number"
                  value={form.monthlyPrice}
                  onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: e.target.value }))}
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-medium">Capacity</label>
                <Input
                  type="number"
                  value={form.capacity}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                  className="mt-1 rounded-xl"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="hover:bg-muted rounded-xl border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={createMut.isPending || updateMut.isPending}
                className="bg-primary rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {editing ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" /> Delete Route
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">"{deleteTarget?.routeName}"</span>? This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMut.mutate(deleteTarget.id, {
                  onError: (e: Error) =>
                    toast({
                      title: "Delete failed",
                      description: e instanceof Error ? e.message : String(e),
                      variant: "destructive",
                    }),
                });
                setDeleteTarget(null);
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FleetAnalyticsTab() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-fleet-analytics", fromDate, toDate],
    queryFn: () => adminFetch(`/fleet-analytics?from=${fromDate}&to=${toDate}`),
    staleTime: 60_000,
  });

  const heatPoints: Array<{ lat: number; lng: number; weight: number }> = data?.heatmap ?? [];
  const riderDistances: Array<{ userId: string; name: string; distanceKm: number }> =
    data?.riderDistances ?? [];
  const peakZones: Array<{ lat: number; lng: number; pings: number }> = data?.peakZones ?? [];
  const revenueTrend: Array<Record<string, any>> = data?.revenueTrend ?? [];
  const revenueServiceTypes: string[] = data?.revenueServiceTypes ?? [];

  const mapCenter: [number, number] =
    heatPoints.length > 0 ? [heatPoints[0]!.lat, heatPoints[0]!.lng] : [33.7294, 73.0931];

  /* Stable color palette per service type */
  const SVC_COLORS: Record<string, string> = {
    bike: "#f97316",
    car: "#3b82f6",
    rickshaw: "#eab308",
    daba: "#8b5cf6",
    school_shift: "#10b981",
    parcel: "#ec4899",
    van: "#06b6d4",
  };
  const svcColor = (type: string, idx: number) =>
    SVC_COLORS[type] ?? ["#6366f1", "#14b8a6", "#f43f5e", "#a3e635", "#fb923c"][idx % 5];

  const totalRevenue = revenueTrend.reduce((sum, day) => {
    const dayTotal = revenueServiceTypes.reduce((s, t) => s + (day[t] ?? 0), 0);
    return sum + dayTotal;
  }, 0);

  return (
    <div className="space-y-5">
      {/* Date Range Controls */}
      <Card className="border-border/50 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              From
            </label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              max={toDate}
              className="w-36 rounded-xl text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              To
            </label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate}
              max={new Date().toISOString().slice(0, 10)}
              className="w-36 rounded-xl text-sm"
            />
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground hover:border-primary/40 flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {data && (
            <span className="text-muted-foreground ml-auto text-xs">
              {data.from} → {data.to}
            </span>
          )}
        </div>
      </Card>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-border/50 rounded-2xl p-5 shadow-sm">
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">
            Total GPS Pings
          </p>
          <p className="text-foreground text-3xl font-black">
            {isLoading ? (
              <span className="text-muted-foreground animate-pulse text-xl">—</span>
            ) : (
              (data?.totalPings ?? 0).toLocaleString()
            )}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">Rider location updates</p>
        </Card>
        <Card className="border-border/50 rounded-2xl p-5 shadow-sm">
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">
            Avg Response Time
          </p>
          <p className="text-foreground text-3xl font-black">
            {isLoading ? (
              <span className="text-muted-foreground animate-pulse text-xl">—</span>
            ) : data?.avgResponseTimeMin != null ? (
              `${data.avgResponseTimeMin}m`
            ) : (
              "—"
            )}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">Request → acceptance</p>
        </Card>
        <Card className="border-border/50 rounded-2xl p-5 shadow-sm">
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">
            Active Riders
          </p>
          <p className="text-foreground text-3xl font-black">
            {isLoading ? (
              <span className="text-muted-foreground animate-pulse text-xl">—</span>
            ) : (
              riderDistances.length
            )}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">With tracked GPS distance</p>
        </Card>
        <Card className="border-border/50 rounded-2xl border-green-200/60 bg-green-50/60 p-5 shadow-sm">
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">
            Total Revenue
          </p>
          <p className="text-3xl font-black text-green-700">
            {isLoading ? (
              <span className="text-muted-foreground animate-pulse text-xl">—</span>
            ) : (
              `Rs ${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            )}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">Completed rides in period</p>
        </Card>
      </div>

      {/* Heatmap + Distance Chart */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Activity Heatmap */}
        <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
          <div className="border-border/40 flex items-center gap-2 border-b p-4">
            <Activity className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-bold">Activity Heatmap</h3>
            <span className="text-muted-foreground ml-1 text-xs">
              ({heatPoints.length.toLocaleString()} points)
            </span>
          </div>
          <div style={{ height: 350 }}>
            {isLoading ? (
              <div className="bg-muted/20 flex h-full w-full items-center justify-center">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            ) : heatPoints.length > 0 ? (
              <MapContainer center={mapCenter} zoom={11} style={{ width: "100%", height: "100%" }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="© OpenStreetMap"
                />
                {heatPoints.slice(0, 2000).map((pt, i) => (
                  <Circle
                    key={i}
                    center={[pt.lat, pt.lng]}
                    radius={120}
                    pathOptions={{ color: "transparent", fillColor: "#f97316", fillOpacity: 0.18 }}
                  />
                ))}
              </MapContainer>
            ) : (
              <div className="bg-muted/10 flex h-full w-full items-center justify-center">
                <p className="text-muted-foreground text-sm">
                  No location data for selected period
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Rider Distance Bar Chart */}
        <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
          <div className="border-border/40 flex items-center gap-2 border-b p-4">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-bold">Distance Covered</h3>
            <span className="text-muted-foreground ml-1 text-xs">(km · top 10 riders)</span>
          </div>
          <div className="p-4" style={{ height: 350 }}>
            {isLoading ? (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            ) : riderDistances.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={riderDistances.slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
                >
                  <XAxis type="number" tick={{ fontSize: 11 }} unit=" km" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={96} />
                  <Tooltip formatter={(v: any) => [`${v} km`, "Distance"]} />
                  <Bar dataKey="distanceKm" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <p className="text-muted-foreground text-sm">No rider distance data</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Revenue Trend by Service Type */}
      <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
        <div className="border-border/40 flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-500" />
            <h3 className="text-sm font-bold">Revenue Trend by Service Type</h3>
            {!isLoading && revenueTrend.length > 0 && (
              <span className="text-muted-foreground ml-1 text-xs">(completed rides · Rs)</span>
            )}
          </div>
          {!isLoading && revenueServiceTypes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {revenueServiceTypes.map((t, i) => (
                <span
                  key={t}
                  className="text-muted-foreground flex items-center gap-1 text-xs font-medium"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: svcColor(t, i) }}
                  />
                  {t.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="p-4" style={{ height: 320 }}>
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : revenueTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrend} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <defs>
                  {revenueServiceTypes.map((t, i) => (
                    <linearGradient key={t} id={`grad-${t}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={svcColor(t, i)} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={svcColor(t, i)} stopOpacity={0.03} />
                    </linearGradient>
                  ))}
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `Rs ${(v as number).toLocaleString()}`}
                  width={72}
                />
                <Tooltip
                  formatter={(value: any, name: string) => [
                    `Rs ${Number(value).toLocaleString()}`,
                    name.replace(/_/g, " "),
                  ]}
                  labelFormatter={(l) => `Date: ${l}`}
                  contentStyle={{ fontSize: 12, borderRadius: 10 }}
                />
                <Legend
                  formatter={(v) => v.replace(/_/g, " ")}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12 }}
                />
                {revenueServiceTypes.map((t, i) => (
                  <Area
                    key={t}
                    type="monotone"
                    dataKey={t}
                    name={t}
                    stroke={svcColor(t, i)}
                    strokeWidth={2}
                    fill={`url(#grad-${t})`}
                    dot={false}
                    activeDot={{ r: 4 }}
                    stackId="revenue"
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2">
              <DollarSign className="text-muted-foreground/30 h-8 w-8" />
              <p className="text-muted-foreground text-sm">No completed rides in selected period</p>
            </div>
          )}
        </div>
      </Card>

      {/* Peak Activity Zones */}
      {(isLoading || peakZones.length > 0) && (
        <Card className="border-border/50 rounded-2xl shadow-sm">
          <div className="border-border/40 flex items-center gap-2 border-b p-4">
            <Activity className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-bold">Peak Activity Zones</h3>
            {!isLoading && (
              <span className="text-muted-foreground ml-1 text-xs">
                (top {peakZones.length} clusters · ~500 m grid)
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="divide-border/40 divide-y">
              {peakZones.map((zone, i) => {
                const maxPings = peakZones[0]?.pings ?? 1;
                const pct = Math.round((zone.pings / maxPings) * 100);
                return (
                  <div key={i} className="flex items-center gap-4 px-4 py-3">
                    <span className="w-7 shrink-0 text-lg font-black text-orange-500">
                      #{i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-foreground font-mono text-sm font-medium">
                          {zone.lat.toFixed(4)}, {zone.lng.toFixed(4)}
                        </p>
                        <span className="text-foreground ml-3 shrink-0 text-sm font-bold">
                          {zone.pings.toLocaleString()} pings
                        </span>
                      </div>
                      <div className="bg-muted/40 h-1.5 w-full rounded-full">
                        <div
                          className="h-1.5 rounded-full bg-orange-400 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${zone.lat}&mlon=${zone.lng}&zoom=15`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-block text-xs text-blue-500 hover:underline"
                      >
                        View on map ↗
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default function Rides() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { toast: _toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("rides");
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [riderFilter, setRiderFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "fare">("date");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debouncedCustomer, setDebouncedCustomer] = useState("");
  const [debouncedRider, setDebouncedRider] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCustomer(customerFilter), 300);
    return () => clearTimeout(t);
  }, [customerFilter]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedRider(riderFilter), 300);
    return () => clearTimeout(t);
  }, [riderFilter]);

  const {
    data,
    isLoading: _isLoading,
    dataUpdatedAt,
    refetch,
    isFetching,
  } = useRidesEnriched({
    page,
    limit: PAGE_SIZE,
    status: statusFilter,
    type: typeFilter,
    search: debouncedSearch,
    customer: debouncedCustomer,
    rider: debouncedRider,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
  });

  /* ── Real-time ride list sync via Socket.io ── */
  useEffect(() => {
    const token = getAdminAccessToken() ?? "";
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      query: { rooms: "admin-fleet" },
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socket.on("ride:dispatch-update", () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-rides"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-rides-enriched"] });
    });
    socket.on("connect_error", (err) => {
      log.warn("WebSocket connect_error:", err?.message ?? err);
    });
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const rides: EnrichedRide[] = (data?.rides as EnrichedRide[]) || [];
  const serverTotal: number = data?.total ?? rides.length;
  const totalPages: number = data?.totalPages ?? Math.ceil(serverTotal / PAGE_SIZE);
  const pageRides = rides;

  useEffect(() => {
    setPage(1);
  }, [
    statusFilter,
    typeFilter,
    debouncedSearch,
    debouncedCustomer,
    debouncedRider,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
  ]);

  const bargaining = rides.filter((r) => r.status === "bargaining");
  const searching = rides.filter((r) => r.status === "searching");
  const activeCount = rides.filter((r) => !isTerminal(r.status)).length;
  const completed = rides.filter((r) => r.status === "completed");

  const serviceTypes = [...new Set(rides.map((r) => r.type))].sort();

  const toggleSort = (field: "date" | "fare") => {
    if (sortBy === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortBy(field);
      setSortDir("desc");
    }
  };

  const TabBtn = ({
    id,
    icon: Icon,
    label,
    count,
    urgent,
  }: {
    id: Tab;
    icon: any;
    label: string;
    count?: number;
    urgent?: boolean;
  }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-all ${
        tab === id
          ? "bg-primary border-primary text-white shadow-sm"
          : `bg-muted/30 border-border/50 text-muted-foreground hover:border-primary/50 ${urgent && (count ?? 0) > 0 ? "border-orange-300 bg-orange-50 text-orange-700" : ""}`
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
      {(count ?? 0) > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === id ? "bg-white/20 text-white" : urgent ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"}`}
        >
          {count}
        </span>
      )}
    </button>
  );

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Rides page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          icon={Car}
          title={T("ridesTitle")}
          subtitle={`${rides.length} total · ${activeCount} active · ${completed.length} completed`}
          iconBgClass="bg-green-100"
          iconColorClass="text-green-600"
          actions={
            <LastUpdated
              dataUpdatedAt={dataUpdatedAt ?? 0}
              onRefresh={() => refetch()}
              isRefreshing={isFetching}
            />
          }
        />

        {/* Urgent Alerts */}
        {(bargaining.length > 0 || searching.length > 0) && (
          <div className="flex items-center gap-3 rounded-2xl border-2 border-orange-400 bg-orange-50 px-4 py-3">
            <span className="text-2xl">{bargaining.length > 0 ? "💬" : "🚨"}</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-orange-800">
                {bargaining.length > 0 && `${bargaining.length} bargaining`}
                {bargaining.length > 0 && searching.length > 0 && " · "}
                {searching.length > 0 && `${searching.length} searching`}
              </p>
            </div>
            <button
              onClick={() => setTab("dispatch")}
              className="rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-bold whitespace-nowrap text-white hover:bg-orange-600"
            >
              Dispatch Monitor
            </button>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total", val: rides.length, cls: "text-foreground", bg: "" },
            {
              label: "Bargaining",
              val: bargaining.length,
              cls: "text-orange-600",
              bg: "bg-orange-50/60 border-orange-200/60",
            },
            {
              label: "Searching",
              val: searching.length,
              cls: "text-amber-700",
              bg: "bg-amber-50/60 border-amber-200/60",
            },
            {
              label: "Active",
              val: activeCount,
              cls: "text-blue-700",
              bg: "bg-blue-50/60 border-blue-200/60",
            },
            {
              label: "Completed",
              val: completed.length,
              cls: "text-green-700",
              bg: "bg-green-50/60 border-green-200/60",
            },
          ].map((s) => (
            <Card
              key={s.label}
              className={`border-border/50 rounded-2xl p-4 text-center shadow-sm ${s.bg}`}
            >
              <p className={`text-3xl font-bold ${s.cls}`}>{s.val}</p>
              <p className="text-muted-foreground text-xs font-medium">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <TabBtn id="rides" icon={Car} label="All Rides" count={rides.length} />
          <TabBtn
            id="dispatch"
            icon={Radio}
            label="Dispatch Monitor"
            count={bargaining.length + searching.length}
            urgent
          />
          <TabBtn id="analytics" icon={BarChart2} label="Fleet Analytics" />
          <TabBtn id="settings" icon={Settings2} label="Ride Settings" />
          <TabBtn id="services" icon={Layers} label="Services" />
          <TabBtn id="locations" icon={MapPin} label="Locations" />
          <TabBtn id="school" icon={GraduationCap} label="School" />
        </div>

        {/* Tab Content */}
        {tab === "rides" && (
          <div className="space-y-4">
            {/* Filters */}
            <Card className="space-y-3 rounded-2xl p-4">
              <div className="text-muted-foreground flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
                <Filter className="h-3.5 w-3.5" /> Filters
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <div className="sm:col-span-2 lg:col-span-2">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by ID, address..."
                    className="text-sm"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Service" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {serviceTypes.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {svcIcon(t)} {svcName(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Input
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  placeholder="Customer name or phone"
                  className="text-sm"
                />
                <Input
                  value={riderFilter}
                  onChange={(e) => setRiderFilter(e.target.value)}
                  placeholder="Rider name or phone"
                  className="text-sm"
                />
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="From"
                  className="text-sm"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="To"
                  className="text-sm"
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-xs">
                  {serverTotal} ride{serverTotal !== 1 ? "s" : ""} found
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleSort("date")}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold ${sortBy === "date" ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground border-border/50"}`}
                  >
                    <Clock className="h-3 w-3" /> Date{" "}
                    {sortBy === "date" && (sortDir === "desc" ? "↓" : "↑")}
                  </button>
                  <button
                    onClick={() => toggleSort("fare")}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold ${sortBy === "fare" ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground border-border/50"}`}
                  >
                    <DollarSign className="h-3 w-3" /> Fare{" "}
                    {sortBy === "fare" && (sortDir === "desc" ? "↓" : "↑")}
                  </button>
                </div>
              </div>
            </Card>

            {/* Mobile Card Layout */}
            <div className="block space-y-3 md:hidden">
              {pageRides.length === 0 ? (
                <Card className="text-muted-foreground rounded-2xl p-8 text-center">
                  No rides found
                </Card>
              ) : (
                pageRides.map((r) => (
                  <Card
                    key={r.id}
                    className="border-border/50 active:bg-muted/20 cursor-pointer space-y-3 rounded-2xl p-4 shadow-sm"
                    onClick={() => setSelectedRideId(r.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold">
                          #{r.id.slice(-6).toUpperCase()}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold uppercase ${svcClr(r.type)}`}
                        >
                          {svcIcon(r.type)} {svcName(r.type)}
                        </Badge>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground text-[10px] font-semibold uppercase">
                          Customer
                        </p>
                        <p className="truncate font-medium">{r.userName || "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px] font-semibold uppercase">
                          Rider
                        </p>
                        <p className="truncate font-medium">{r.riderName || "—"}</p>
                      </div>
                    </div>
                    <div className="space-y-0.5 text-xs">
                      <p className="truncate">
                        <MapPin className="mr-1 inline h-3 w-3 text-green-600" />
                        {r.pickupAddress || "—"}
                      </p>
                      <p className="text-muted-foreground truncate">
                        <MapPin className="mr-1 inline h-3 w-3 text-red-600" />
                        {r.dropAddress || "—"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-base font-bold">
                        {formatCurrency(r.counterFare ?? r.fare)}
                      </span>
                      <span
                        className={`font-medium capitalize ${r.paymentMethod === "wallet" ? "text-blue-600" : "text-green-600"}`}
                      >
                        {r.paymentMethod === "wallet" ? "💳 Wallet" : "💵 Cash"}
                      </span>
                      <span className="text-muted-foreground">{formatDate(r.createdAt)}</span>
                    </div>
                  </Card>
                ))
              )}
            </div>

            {/* Desktop Table */}
            <Card className="border-border/50 hidden overflow-hidden rounded-2xl shadow-sm md:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Rider</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort("fare")}>
                        <span className="flex items-center gap-1">
                          Fare <ArrowUpDown className="h-3 w-3" />
                        </span>
                      </TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort("date")}>
                        <span className="flex items-center gap-1">
                          Date <ArrowUpDown className="h-3 w-3" />
                        </span>
                      </TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRides.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-muted-foreground py-12 text-center">
                          No rides found
                        </TableCell>
                      </TableRow>
                    ) : (
                      pageRides.map((r) => (
                        <TableRow
                          key={r.id}
                          className="hover:bg-muted/20 cursor-pointer"
                          onClick={() => setSelectedRideId(r.id)}
                        >
                          <TableCell>
                            <span className="font-mono text-sm font-bold">
                              #{r.id.slice(-6).toUpperCase()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold uppercase ${svcClr(r.type)}`}
                            >
                              {svcIcon(r.type)} {svcName(r.type)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">{r.userName || "—"}</p>
                            {r.userPhone && (
                              <p className="text-muted-foreground text-xs">{r.userPhone}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">{r.riderName || "—"}</p>
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <p className="truncate text-xs">{r.pickupAddress || "—"}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {r.dropAddress || "—"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <span className="font-bold">
                              {formatCurrency(r.counterFare ?? r.fare)}
                            </span>
                            {r.offeredFare != null && r.offeredFare !== r.fare && (
                              <p className="text-muted-foreground text-[10px]">
                                Offer: {formatCurrency(r.offeredFare)}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`text-xs font-medium capitalize ${r.paymentMethod === "wallet" ? "text-blue-600" : "text-green-600"}`}
                            >
                              {r.paymentMethod === "wallet" ? "Wallet" : "Cash"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <p className="text-xs">{formatDate(r.createdAt)}</p>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setSelectedRideId(r.id)}
                              className="text-primary hover:bg-primary/10 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors"
                            >
                              <Eye className="h-3 w-3" /> View
                            </button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-2">
                <p className="text-muted-foreground text-xs">
                  Page {page} of {totalPages} ({serverTotal} rides)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="text-muted-foreground hover:text-foreground rounded-lg border p-2 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = page <= 3 ? i + 1 : page + i - 2;
                    if (p < 1 || p > totalPages) return null;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`h-8 w-8 rounded-lg text-xs font-bold ${page === p ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground border"}`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="text-muted-foreground hover:text-foreground rounded-lg border p-2 disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "dispatch" && <DispatchMonitor />}
        {tab === "analytics" && <FleetAnalyticsTab />}
        {tab === "settings" && <RideSettings />}
        {tab === "services" && <ServicesManager />}
        {tab === "locations" && <LocationsManager />}
        {tab === "school" && <SchoolRoutesManager />}

        {/* Ride Detail Modal */}
        {selectedRideId && (
          <RideDetailModal rideId={selectedRideId} onClose={() => setSelectedRideId(null)} />
        )}
      </div>
    </ErrorBoundary>
  );
}
