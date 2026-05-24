import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FilterBar, PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useApproveReview,
  useModerationQueue,
  useRejectReview,
  useRunRatingSuspension,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { adminFetch, fetchAdminAbsoluteResponse } from "@/lib/adminFetcher";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  MessageSquare,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  Store,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  XCircle,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

type Review = {
  id: string;
  type: "order" | "ride";
  rating: number;
  riderRating?: number | null;
  comment: string | null;
  orderType: string | null;
  hidden: boolean;
  status?: string;
  moderationNote?: string | null;
  vendorReply?: string | null;
  deletedAt: string | null;
  createdAt: string;
  reviewerId: string;
  subjectId: string | null;
  reviewerName: string | null;
  reviewerPhone: string | null;
  subjectName: string | null;
  subjectPhone: string | null;
  orderId?: string | null;
};

/* ── Helpers ── */
function StarDisplay({ value }: { value: number }) {
  return (
    <span className="text-sm leading-none">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= value ? "text-amber-400" : "text-gray-200"}>
          ★
        </span>
      ))}
    </span>
  );
}

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3 w-3 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
        />
      ))}
    </span>
  );
}

const STAR_COLORS: Record<number, string> = {
  5: "bg-green-100 text-green-700",
  4: "bg-lime-100 text-lime-700",
  3: "bg-yellow-100 text-yellow-700",
  2: "bg-orange-100 text-orange-700",
  1: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "visible")
    return <Badge className="border-0 bg-green-100 text-[10px] text-green-700">Visible</Badge>;
  if (status === "pending_moderation")
    return <Badge className="border-0 bg-amber-100 text-[10px] text-amber-700">Pending</Badge>;
  if (status === "rejected")
    return <Badge className="border-0 bg-red-100 text-[10px] text-red-700">Rejected</Badge>;
  return (
    <Badge variant="outline" className="text-[10px]">
      {status}
    </Badge>
  );
}

function ReviewRow({
  r,
  selected,
  onToggle,
  onHide,
  onDelete,
  hideLoading,
  deleteLoading,
  T,
}: {
  r: Review;
  selected: boolean;
  onToggle: () => void;
  onHide: () => void;
  onDelete: () => void;
  hideLoading: boolean;
  deleteLoading: boolean;
  T: (k: TranslationKey) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`flex items-start gap-3 border-b p-4 last:border-0 ${r.deletedAt ? "bg-red-50/30 opacity-50" : r.hidden ? "bg-yellow-50/30" : ""}`}
    >
      {!r.deletedAt && (
        <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-0.5 flex-shrink-0" />
      )}
      {r.deletedAt && <div className="w-4 flex-shrink-0" />}

      <div className="flex min-w-[90px] flex-shrink-0 flex-col gap-1.5">
        <Badge
          variant="outline"
          className={
            r.type === "ride"
              ? "border-blue-300 text-[10px] text-blue-700"
              : "border-orange-300 text-[10px] text-orange-700"
          }
        >
          {r.type === "ride"
            ? `🚗 ${T("rideReviews").split(" ")[0]}`
            : `📦 ${T("orderReviews").split(" ")[0]}`}
        </Badge>
        <span
          className={`rounded-full px-2 py-0.5 text-center text-xs font-bold ${STAR_COLORS[r.rating] ?? "bg-gray-100 text-gray-600"}`}
        >
          {r.rating}★
        </span>
        {r.status && <StatusBadge status={r.status} />}
        {r.hidden && !r.deletedAt && (
          <Badge
            variant="secondary"
            className="border-yellow-200 bg-yellow-100 text-[10px] text-yellow-700"
          >
            {T("hiddenLabel")}
          </Badge>
        )}
        {r.deletedAt && (
          <Badge variant="destructive" className="text-[10px]">
            {T("deletedLabel")}
          </Badge>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {r.riderRating ? (
            <>
              <span className="text-muted-foreground text-xs font-medium">Vendor:</span>
              <StarDisplay value={r.rating} />
              <span className="text-muted-foreground text-xs font-medium">
                {T("riderReviews").split(" ")[0]}:
              </span>
              <StarDisplay value={r.riderRating} />
            </>
          ) : (
            <StarDisplay value={r.rating} />
          )}
          {r.moderationNote && (
            <span className="flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
              <AlertTriangle className="h-2.5 w-2.5" /> {r.moderationNote}
            </span>
          )}
        </div>
        {r.orderType && r.type === "order" && (
          <Badge variant="outline" className="mt-1 text-[10px] capitalize">
            {r.orderType}
          </Badge>
        )}

        {/* Comment preview / full expand */}
        {r.comment ? (
          <div>
            <p
              className={`text-foreground mt-1.5 text-sm italic ${expanded ? "" : "line-clamp-2"}`}
            >
              "{r.comment}"
            </p>
            {r.comment.length > 120 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-primary mt-0.5 flex items-center gap-0.5 text-[11px] hover:underline"
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? T("hideReview").replace("Hide", "Collapse") : T("viewFullReview")}
              </button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground mt-1 text-xs">{T("noCommentAdded")}</p>
        )}

        {r.vendorReply && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-2">
            <MessageSquare className="mt-0.5 h-3 w-3 flex-shrink-0 text-blue-500" />
            <p className="text-[11px] text-blue-700">
              <strong>Vendor Reply:</strong> {r.vendorReply}
            </p>
          </div>
        )}

        <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
          <span>
            {T("reviewerLabel")}:{" "}
            <span className="text-foreground font-medium">
              {r.reviewerName ?? r.reviewerId.slice(0, 8)}
            </span>
            {r.reviewerPhone && <span className="ml-1 text-gray-400">· {r.reviewerPhone}</span>}
          </span>
          {r.subjectName && (
            <span>
              {T("subjectLabel")}:{" "}
              <span className="text-foreground font-medium">{r.subjectName}</span>
              {r.subjectPhone && <span className="ml-1 text-gray-400">· {r.subjectPhone}</span>}
            </span>
          )}
          <span>{formatDate(r.createdAt)}</span>
          {r.orderId && <span>Order: {r.orderId.slice(0, 8)}</span>}
        </div>
      </div>

      {!r.deletedAt && (
        <div className="flex flex-shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            title={r.hidden ? T("unhideReview") : T("hideReview")}
            onClick={onHide}
            disabled={hideLoading}
          >
            {r.hidden ? (
              <Eye className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-yellow-600" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 border-red-200 p-0 hover:bg-red-50"
            title={T("deleteReview")}
            onClick={onDelete}
            disabled={deleteLoading}
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Moderation Queue Modal ── */
function ModerationModal({
  onClose,
  T: _T,
}: {
  onClose: () => void;
  T: (k: TranslationKey) => string;
}) {
  const { data, isLoading } = useModerationQueue();
  const approveM = useApproveReview();
  const rejectM = useRejectReview();
  const { toast } = useToast();
  const reviews: any[] = data?.reviews || [];

  const approve = (id: string) => {
    approveM.mutate(id, {
      onSuccess: () => toast({ title: "Review approved ✅" }),
      onError: (e: Error) =>
        toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const reject = (id: string) => {
    rejectM.mutate(id, {
      onSuccess: () => toast({ title: "Review rejected" }),
      onError: (e: Error) =>
        toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] w-[95vw] max-w-2xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Moderation Queue{" "}
            {reviews.length > 0 && (
              <Badge className="border-0 bg-amber-100 text-amber-700">{reviews.length}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        )}
        {!isLoading && reviews.length === 0 && (
          <div className="text-muted-foreground py-10 text-center">
            <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-green-400" />
            <p className="font-medium">All clear! No reviews pending moderation.</p>
          </div>
        )}

        <div className="mt-2 space-y-3">
          {reviews.map((r: any) => (
            <div key={r.id} className="space-y-2 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StarRow rating={r.rating} />
                  <Badge variant="outline" className="text-xs capitalize">
                    {r.orderType}
                  </Badge>
                </div>
                <span className="text-muted-foreground text-xs">{formatDate(r.createdAt)}</span>
              </div>
              <p className="text-sm">
                {r.comment || <em className="text-muted-foreground">No comment</em>}
              </p>
              {r.moderationNote && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                  <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                  <span>AI Flag: {r.moderationNote}</span>
                </div>
              )}
              <p className="text-muted-foreground text-xs">
                By: {r.reviewerName || r.reviewerPhone || r.userId}
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-8 flex-1 bg-green-600 text-xs hover:bg-green-700"
                  onClick={() => approve(r.id)}
                  disabled={approveM.isPending || rejectM.isPending}
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 flex-1 text-xs"
                  onClick={() => reject(r.id)}
                  disabled={approveM.isPending || rejectM.isPending}
                >
                  <XCircle className="mr-1 h-3 w-3" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Import Modal ── */
function ImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [csvText, setCsvText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(String(ev.target?.result || ""));
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvText.trim()) {
      toast({ title: "Paste or upload a CSV file first", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const data = await adminFetch("/reviews/import", {
        method: "POST",
        body: JSON.stringify({ csvData: csvText }),
      });
      setResult(data);
      onSuccess();
    } catch (e: unknown) {
      toast({
        title: "Import failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[95vw] max-w-xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="text-primary h-5 w-5" /> Import Reviews CSV
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-4">
          <p className="text-muted-foreground text-xs">
            Required columns: <code>orderType, orderId, stars</code>. Optional:{" "}
            <code>userId, vendorId, riderId, comment, vendorReply, status</code>.
          </p>

          <div
            className="hover:bg-muted/30 cursor-pointer rounded-xl border-2 border-dashed p-4 text-center"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
            <p className="text-muted-foreground text-sm">Click to upload CSV file</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          <textarea
            className="focus:ring-primary h-28 w-full resize-none rounded-xl border p-3 font-mono text-xs focus:ring-1 focus:outline-none"
            placeholder="Or paste CSV content here..."
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />

          {result && (
            <div className="space-y-1 rounded-xl border border-green-200 bg-green-50 p-3 text-sm">
              <p className="font-semibold text-green-700">Import Complete</p>
              <p>
                Imported: <strong>{result.imported}</strong> &nbsp; Skipped:{" "}
                <strong>{result.skipped}</strong> &nbsp; Errors: <strong>{result.errored}</strong>
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleImport} disabled={loading}>
              {loading ? (
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ReviewsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const [page, setPage] = useState(1);
  const [typeFilter, setType] = useState("all");
  const [starsFilter, setStars] = useState("all");
  const [statusFilter, setStatus] = useState("all");
  const [subjectFilter, setSubject] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showModQueue, setShowModQueue] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const limit = 25;

  const buildQS = useCallback(
    (p = page) => {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (starsFilter !== "all") params.set("stars", starsFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (subjectFilter !== "all") params.set("subject", subjectFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (debouncedQ) params.set("q", debouncedQ);
      return params.toString();
    },
    [page, typeFilter, starsFilter, statusFilter, subjectFilter, dateFrom, dateTo, debouncedQ]
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      "admin-reviews",
      page,
      typeFilter,
      starsFilter,
      statusFilter,
      subjectFilter,
      dateFrom,
      dateTo,
      debouncedQ,
    ],
    queryFn: () => adminFetch(`/reviews?${buildQS()}`),
    staleTime: 10_000,
  });

  const { data: queueData } = useModerationQueue();
  const runSuspensionM = useRunRatingSuspension();

  const reviews: Review[] = data?.reviews ?? [];
  const total: number = data?.total ?? 0;
  const pages: number = data?.pages ?? 1;
  const pendingCount = queueData?.total || 0;
  const starBreakdown: Record<number, number> = (data as any)?.starBreakdown ?? {};

  const hideOrder = useMutation({
    mutationFn: (id: string) => adminFetch(`/reviews/${id}/hide`, { method: "PATCH" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      toast({ title: T("visibilityToggled") });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteOrder = useMutation({
    mutationFn: (id: string) => adminFetch(`/reviews/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      toast({ title: T("reviewDeleted") });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const hideRide = useMutation({
    mutationFn: (id: string) => adminFetch(`/ride-ratings/${id}/hide`, { method: "PATCH" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      toast({ title: T("visibilityToggled") });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteRide = useMutation({
    mutationFn: (id: string) => adminFetch(`/ride-ratings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      toast({ title: T("reviewDeleted") });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleHide(r: Review) {
    if (r.type === "order") hideOrder.mutate(r.id);
    else hideRide.mutate(r.id);
  }
  function handleDelete(r: Review) {
    if (!confirm(`${T("deleteReview")} #${r.id.slice(0, 8)}?`)) return;
    if (r.type === "order") deleteOrder.mutate(r.id);
    else deleteRide.mutate(r.id);
  }

  const allIds = reviews.filter((r) => !r.deletedAt).map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkHide() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`${T("toggleVisibility")} ${ids.length} review(s)?`)) return;
    const toHide = reviews.filter((r) => ids.includes(r.id) && r.type === "order");
    const toHideR = reviews.filter((r) => ids.includes(r.id) && r.type === "ride");
    await Promise.all([
      ...toHide.map((r) => adminFetch(`/reviews/${r.id}/hide`, { method: "PATCH" })),
      ...toHideR.map((r) => adminFetch(`/ride-ratings/${r.id}/hide`, { method: "PATCH" })),
    ]);
    void qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    setSelected(new Set());
    toast({ title: `${ids.length} ${T("visibilityToggled").toLowerCase()}` });
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`${T("deleteReview")} ${ids.length} review(s)?`)) return;
    const orders = reviews.filter((r) => ids.includes(r.id) && r.type === "order");
    const rides = reviews.filter((r) => ids.includes(r.id) && r.type === "ride");
    await Promise.all([
      ...orders.map((r) => adminFetch(`/reviews/${r.id}`, { method: "DELETE" })),
      ...rides.map((r) => adminFetch(`/ride-ratings/${r.id}`, { method: "DELETE" })),
    ]);
    void qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    setSelected(new Set());
    toast({ title: `${ids.length} ${T("reviewDeleted").toLowerCase()}` });
  }

  function handleFilterChange(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      setPage(1);
      setSelected(new Set());
    };
  }

  const handleSearch = (v: string) => {
    setSearchQ(v);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const timer = setTimeout(() => {
      setDebouncedQ(v);
      setPage(1);
    }, 400);
    searchTimerRef.current = timer;
  };

  const handleExport = async () => {
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== "all") qs.set("status", statusFilter);
      if (typeFilter !== "all") qs.set("type", typeFilter);
      const exportUrl = `/api/admin/reviews/export?${qs.toString()}`;
      const res = await fetchAdminAbsoluteResponse(exportUrl);
      if (!res.ok) {
        toast({ title: "Export failed", variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      const blobUrl = URL.createObjectURL(blob);
      a.href = blobUrl;
      a.download = `reviews-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    } catch (_err: unknown) {
      toast({
        title: "Export failed",
        description: "Unable to download reviews. Please try again.",
        variant: "destructive",
      });
    }
  };

  const runSuspension = () => {
    runSuspensionM.mutate(undefined, {
      onSuccess: (d: any) => toast({ title: "Auto-suspension job ran ✅", description: d.message }),
      onError: (e: Error) =>
        toast({ title: "Job failed", description: e.message, variant: "destructive" }),
    });
  };

  const statusStats = [
    { label: T("totalInView"), value: total, color: "text-blue-600" },
    {
      label: T("visibleLabel"),
      value: reviews.filter((r) => r.status === "visible" || (!r.hidden && !r.deletedAt)).length,
      color: "text-green-600",
    },
    {
      label: T("pendingLabel") || "Pending",
      value: reviews.filter((r) => r.status === "pending_moderation").length,
      color: "text-amber-600",
    },
    {
      label: T("deletedLabel"),
      value: reviews.filter((r) => !!r.deletedAt).length,
      color: "text-red-600",
    },
  ];

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Reviews page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={Star}
          title={T("reviewManagement")}
          subtitle={`${T("moderateCustomerReviews")} · ${total} ${T("totalInView")}`}
          iconBgClass="bg-amber-100"
          iconColorClass="text-amber-600"
        />

        <Tabs defaultValue="reviews">
          <TabsList className="mb-2">
            <TabsTrigger value="reviews" className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> All Reviews
            </TabsTrigger>
            <TabsTrigger value="vendor-ratings" className="flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Vendor Ratings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reviews" className="space-y-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowModQueue(true)}
                className="relative"
              >
                <ShieldAlert className="mr-1 h-4 w-4 text-amber-500" />
                Moderation Queue
                {pendingCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {pendingCount}
                  </span>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-1 h-4 w-4" /> Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
                <Upload className="mr-1 h-4 w-4" /> Import CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={runSuspension}
                disabled={runSuspensionM.isPending}
              >
                {runSuspensionM.isPending ? (
                  <div className="border-foreground mr-1 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
                ) : (
                  <Play className="mr-1 h-4 w-4 text-orange-500" />
                )}
                Run Auto-Suspend
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className={`mr-1.5 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {statusStats.map((s) => (
                <Card key={s.label} className="p-4 text-center">
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs font-medium">{s.label}</p>
                </Card>
              ))}
            </div>

            {total > 0 && Object.values(starBreakdown).some((v) => v > 0) && (
              <Card className="p-4">
                <p className="text-muted-foreground mb-3 text-[10px] font-bold tracking-widest uppercase">
                  Rating Distribution
                </p>
                <div className="space-y-2">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const cnt = starBreakdown[star] ?? 0;
                    const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
                    const barColor =
                      star === 5
                        ? "bg-green-500"
                        : star === 4
                          ? "bg-lime-400"
                          : star === 3
                            ? "bg-yellow-400"
                            : star === 2
                              ? "bg-orange-400"
                              : "bg-red-500";
                    return (
                      <div key={star} className="flex items-center gap-2 text-xs">
                        <span className="w-3 flex-shrink-0 text-right font-bold text-gray-500">
                          {star}
                        </span>
                        <Star className="h-3 w-3 flex-shrink-0 fill-amber-400 text-amber-400" />
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground w-20 flex-shrink-0 text-right tabular-nums text-[11px]">
                          {cnt} ({pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <Card className="space-y-3 p-4">
              <FilterBar
                search={searchQ}
                onSearch={handleSearch}
                placeholder="Search by reviewer or comment..."
                filters={
                  <>
                    <Select value={typeFilter} onValueChange={handleFilterChange(setType)}>
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue placeholder={T("reviewType")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{T("allTypes")}</SelectItem>
                        <SelectItem value="order">{T("orderReviews")}</SelectItem>
                        <SelectItem value="ride">{T("rideReviews")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={starsFilter} onValueChange={handleFilterChange(setStars)}>
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <SelectValue placeholder={T("starsFilter")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{T("allStars")}</SelectItem>
                        {[5, 4, 3, 2, 1].map((s) => (
                          <SelectItem key={s} value={String(s)}>
                            {s} ★
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={handleFilterChange(setStatus)}>
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue placeholder={T("reviewStatus")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{T("allStatus")}</SelectItem>
                        <SelectItem value="visible">{T("visibleLabel")}</SelectItem>
                        <SelectItem value="pending_moderation">Pending</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="hidden">{T("hiddenLabel")}</SelectItem>
                        <SelectItem value="deleted">{T("deletedLabel")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={subjectFilter} onValueChange={handleFilterChange(setSubject)}>
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue placeholder={T("allSubjects")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{T("allSubjects")}</SelectItem>
                        <SelectItem value="vendor">{T("vendorReviews")}</SelectItem>
                        <SelectItem value="rider">{T("riderReviews")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                }
              />

              <div className="flex flex-wrap items-center gap-2">
                <CalendarDays className="text-muted-foreground h-4 w-4 flex-shrink-0" />
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setPage(1);
                    }}
                    className="h-8 w-36 text-xs"
                  />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setPage(1);
                    }}
                    className="h-8 w-36 text-xs"
                  />
                  {(dateFrom || dateTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        setDateFrom("");
                        setDateTo("");
                        setPage(1);
                      }}
                    >
                      {T("clearDates")}
                    </Button>
                  )}
                </div>
              </div>

              {selected.size > 0 && (
                <div className="bg-primary/5 border-primary/10 flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-primary text-xs font-medium">
                    {selected.size} {T("selectedCount")}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px]"
                      onClick={bulkHide}
                    >
                      <EyeOff className="mr-1 h-3 w-3" /> {T("toggleVisibility")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-red-200 text-[10px] text-red-600 hover:bg-red-50"
                      onClick={bulkDelete}
                    >
                      <Trash2 className="mr-1 h-3 w-3" /> {T("deleteReview")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px]"
                      onClick={() => setSelected(new Set())}
                    >
                      {T("clearSelection")}
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <div className="divide-y">
                <div className="bg-muted/30 flex items-center justify-between p-2 px-4">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                      {T("onThisPage")}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-[10px] font-medium">
                    Page {page} of {pages}
                  </div>
                </div>

                {isLoading ? (
                  <div className="p-12 text-center">
                    <RefreshCw className="text-muted-foreground/20 mx-auto h-8 w-8 animate-spin" />
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="text-muted-foreground p-12 text-center">
                    <p>{T("noReviewsFound")}</p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => {
                        setType("all");
                        setStars("all");
                        setStatus("all");
                        setSubject("all");
                        setDateFrom("");
                        setDateTo("");
                        setSearchQ("");
                        setDebouncedQ("");
                      }}
                    >
                      {T("adjustFilters")}
                    </Button>
                  </div>
                ) : (
                  reviews.map((r) => (
                    <ReviewRow
                      key={r.id}
                      r={r}
                      selected={selected.has(r.id)}
                      onToggle={() => toggleOne(r.id)}
                      onHide={() => handleHide(r)}
                      onDelete={() => handleDelete(r)}
                      hideLoading={hideOrder.isPending || hideRide.isPending}
                      deleteLoading={deleteOrder.isPending || deleteRide.isPending}
                      T={T}
                    />
                  ))
                )}
              </div>
            </Card>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-center gap-1 pb-8">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={page === 1}
                  onClick={() => {
                    setPage((p) => p - 1);
                    setSelected(new Set());
                  }}
                >
                  {T("previousPage")}
                </Button>
                <div className="mx-2 flex items-center gap-1">
                  {[...Array(pages)].map((_, i) => {
                    const p = i + 1;
                    if (pages > 7 && Math.abs(p - page) > 2 && p !== 1 && p !== pages) {
                      if (Math.abs(p - page) === 3)
                        return (
                          <span key={p} className="text-muted-foreground">
                            ...
                          </span>
                        );
                      return null;
                    }
                    return (
                      <Button
                        key={p}
                        variant={page === p ? "default" : "outline"}
                        size="sm"
                        className="h-8 w-8 p-0 text-xs"
                        onClick={() => {
                          setPage(p);
                          setSelected(new Set());
                        }}
                      >
                        {p}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={page === pages}
                  onClick={() => {
                    setPage((p) => p + 1);
                    setSelected(new Set());
                  }}
                >
                  {T("nextPage") || "Next"}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="vendor-ratings">
            <VendorRatingsTab />
          </TabsContent>
        </Tabs>

        {showModQueue && <ModerationModal onClose={() => setShowModQueue(false)} T={T} />}
        {showImport && (
          <ImportModal onClose={() => setShowImport(false)} onSuccess={() => refetch()} />
        )}
      </div>
    </ErrorBoundary>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Vendor Ratings Leaderboard Tab                              */
/* ─────────────────────────────────────────────────────────── */

type VendorRating = {
  vendorId: string | null;
  storeName: string;
  storeType: string | null;
  isActive: boolean;
  phone: string | null;
  avgRating: string | null;
  totalReviews: number;
  oneStarCount: number;
  twoStarCount: number;
  fiveStarCount: number;
  pendingCount: number;
  hiddenCount: number;
  recentAvg: string | null;
  recentCount: number;
  latestReviewAt: string | null;
};

function StarBar({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i <= full
              ? "fill-amber-400 text-amber-400"
              : i === full + 1 && half
                ? "fill-amber-400/50 text-amber-400"
                : "text-muted-foreground/30"
          }`}
        />
      ))}
    </span>
  );
}

function RatingBadge({ rating }: { rating: number }) {
  const color =
    rating >= 4
      ? "bg-green-100 text-green-700 border-green-200"
      : rating >= 3
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-red-100 text-red-700 border-red-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${color}`}
    >
      {rating.toFixed(1)}
    </span>
  );
}

function VendorRatingsTab() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"rating_asc" | "rating_desc" | "reviews" | "recent">(
    "rating_asc"
  );
  const [showInactive, setShowInactive] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-vendor-ratings"],
    queryFn: () => adminFetch("/vendor-ratings"),
    staleTime: 30_000,
  });

  const vendors: VendorRating[] = data?.vendors ?? [];

  const filtered = vendors
    .filter((v) => (showInactive ? true : v.isActive !== false))
    .filter((v) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        v.storeName?.toLowerCase().includes(q) || v.phone?.includes(q) || v.vendorId?.includes(q)
      );
    })
    .sort((a, b) => {
      const aR = parseFloat(a.avgRating ?? "5");
      const bR = parseFloat(b.avgRating ?? "5");
      if (sortBy === "rating_asc") return aR - bR;
      if (sortBy === "rating_desc") return bR - aR;
      if (sortBy === "reviews") return b.totalReviews - a.totalReviews;
      /* recent: sort by recentAvg ascending (worst recent perf first) */
      const aRec = parseFloat(a.recentAvg ?? "5");
      const bRec = parseFloat(b.recentAvg ?? "5");
      return aRec - bRec;
    });

  const atRisk = vendors.filter(
    (v) => parseFloat(v.avgRating ?? "5") < 3 && v.totalReviews >= 5
  ).length;
  const needsAttention = vendors.filter(
    (v) => parseFloat(v.avgRating ?? "5") < 2 && v.totalReviews >= 5
  ).length;
  const excellent = vendors.filter(
    (v) => parseFloat(v.avgRating ?? "5") >= 4.5 && v.totalReviews >= 5
  ).length;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4 text-center">
          <p className="text-2xl font-black text-blue-600">{vendors.length}</p>
          <p className="text-muted-foreground mt-0.5 text-xs font-medium">Total Vendors Rated</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-black text-green-600">{excellent}</p>
          <p className="text-muted-foreground mt-0.5 text-xs font-medium">Excellent (≥4.5★)</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-black text-amber-600">{atRisk}</p>
          <p className="text-muted-foreground mt-0.5 text-xs font-medium">At Risk (&lt;3★)</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-black text-red-600">{needsAttention}</p>
          <p className="text-muted-foreground mt-0.5 text-xs font-medium">Critical (&lt;2★)</p>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            className="border-input bg-background focus:ring-ring h-8 w-full rounded-md border pr-3 pl-8 text-xs focus:ring-1 focus:outline-none"
            placeholder="Search vendor name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rating_asc">Worst First (↑ Rating)</SelectItem>
            <SelectItem value="rating_desc">Best First (↓ Rating)</SelectItem>
            <SelectItem value="reviews">Most Reviews</SelectItem>
            <SelectItem value="recent">Recent Trend (Worst)</SelectItem>
          </SelectContent>
        </Select>
        <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive vendors
        </label>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Mobile card list — shown below md breakpoint */}
      <section className="space-y-3 md:hidden" aria-label="Vendor reviews">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse rounded-xl border p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="bg-muted h-4 w-32 rounded" />
                  <div className="bg-muted h-3 w-20 rounded" />
                </div>
                <div className="bg-muted h-5 w-12 rounded-full" />
              </div>
            </Card>
          ))
        ) : filtered.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center py-12 text-center">
            <Store className="mx-auto mb-2 h-10 w-10 opacity-20" aria-hidden="true" />
            <p className="text-sm">
              {vendors.length === 0 ? "No vendor reviews yet." : "No vendors match your search."}
            </p>
          </div>
        ) : (
          filtered.map((v, idx) => {
            const rating = parseFloat(v.avgRating ?? "5");
            const isCritical = rating < 2 && v.totalReviews >= 5;
            const isAtRisk = rating < 3 && v.totalReviews >= 5;
            return (
              <Card
                key={v.vendorId ?? idx}
                className={`overflow-hidden rounded-xl border shadow-sm ${
                  isCritical
                    ? "border-red-200 bg-red-50/30"
                    : isAtRisk
                      ? "border-amber-200 bg-amber-50/20"
                      : ""
                }`}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{v.storeName}</p>
                      {v.storeType && (
                        <p className="text-muted-foreground text-xs capitalize">
                          {v.storeType.replace(/_/g, " ")}
                        </p>
                      )}
                    </div>
                    {v.isActive ? (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-green-200 bg-green-50 text-[10px] text-green-700"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-red-200 bg-red-50 text-[10px] text-red-700"
                      >
                        Suspended
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-muted/40 rounded-lg p-2">
                      <p className="font-bold">{rating.toFixed(1)}★</p>
                      <p className="text-muted-foreground">Rating</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-2">
                      <p className="font-bold">{v.totalReviews}</p>
                      <p className="text-muted-foreground">Reviews</p>
                    </div>
                    <div
                      className={`rounded-lg p-2 ${v.pendingCount > 0 ? "bg-amber-50" : "bg-muted/40"}`}
                    >
                      <p className={`font-bold ${v.pendingCount > 0 ? "text-amber-700" : ""}`}>
                        {v.pendingCount}
                      </p>
                      <p className="text-muted-foreground">Pending</p>
                    </div>
                  </div>
                  {v.latestReviewAt && (
                    <p className="text-muted-foreground border-border/50 border-t pt-1 text-xs">
                      Last review: {formatDate(v.latestReviewAt)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      {/* Desktop table — hidden below md breakpoint */}
      <Card className="hidden md:block">
        {isLoading ? (
          <div className="p-12 text-center">
            <RefreshCw className="text-muted-foreground/20 mx-auto h-8 w-8 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-muted-foreground p-12 text-center">
            <Store className="mx-auto mb-2 h-10 w-10 opacity-20" />
            <p className="text-sm">
              {vendors.length === 0 ? "No vendor reviews yet." : "No vendors match your search."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground border-b text-xs">
                  <th className="px-4 py-2.5 text-left font-medium">#</th>
                  <th className="px-4 py-2.5 text-left font-medium">Vendor</th>
                  <th className="px-3 py-2.5 text-center font-medium">Rating</th>
                  <th className="px-3 py-2.5 text-center font-medium">Reviews</th>
                  <th className="px-3 py-2.5 text-center font-medium">1★ / 5★</th>
                  <th className="px-3 py-2.5 text-center font-medium">30-day avg</th>
                  <th className="px-3 py-2.5 text-center font-medium">Pending</th>
                  <th className="px-3 py-2.5 text-center font-medium">Status</th>
                  <th className="px-3 py-2.5 text-left font-medium">Last Review</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, idx) => {
                  const rating = parseFloat(v.avgRating ?? "5");
                  const recentRating = v.recentAvg ? parseFloat(v.recentAvg) : null;
                  const trend =
                    recentRating != null
                      ? recentRating > rating + 0.2
                        ? "up"
                        : recentRating < rating - 0.2
                          ? "down"
                          : "flat"
                      : "flat";
                  const isCritical = rating < 2 && v.totalReviews >= 5;
                  const isAtRisk = rating < 3 && v.totalReviews >= 5;

                  return (
                    <tr
                      key={v.vendorId ?? idx}
                      className={`hover:bg-muted/20 border-b transition-colors last:border-0 ${
                        isCritical ? "bg-red-50/50" : isAtRisk ? "bg-amber-50/30" : ""
                      }`}
                    >
                      <td className="text-muted-foreground px-4 py-3 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm leading-tight font-medium">{v.storeName}</div>
                        {v.storeType && (
                          <div className="text-muted-foreground text-xs capitalize">
                            {v.storeType.replace(/_/g, " ")}
                          </div>
                        )}
                        {v.phone && <div className="text-muted-foreground text-xs">{v.phone}</div>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <RatingBadge rating={rating} />
                          <StarBar rating={rating} />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-semibold">{v.totalReviews}</span>
                        {v.hiddenCount > 0 && (
                          <div className="text-muted-foreground text-xs">
                            {v.hiddenCount} hidden
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-2 text-xs">
                          <span className="font-semibold text-red-600">{v.oneStarCount}★</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="font-semibold text-green-600">{v.fiveStarCount}★</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {recentRating != null ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs font-medium">{recentRating.toFixed(1)}</span>
                            {trend === "up" && (
                              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                            )}
                            {trend === "down" && (
                              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                            )}
                            <span className="text-muted-foreground text-xs">({v.recentCount})</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {v.pendingCount > 0 ? (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-xs text-amber-700"
                          >
                            {v.pendingCount} pending
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {v.isActive ? (
                          <Badge
                            variant="outline"
                            className="border-green-200 bg-green-50 text-xs text-green-700"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-red-200 bg-red-50 text-xs text-red-700"
                          >
                            Suspended
                          </Badge>
                        )}
                      </td>
                      <td className="text-muted-foreground px-3 py-3 text-xs whitespace-nowrap">
                        {v.latestReviewAt ? formatDate(v.latestReviewAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
