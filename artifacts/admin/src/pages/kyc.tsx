import { PageHeader, StatCard, StatCardSkeleton } from "@/components/shared";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fetchAdminAbsolute } from "@/lib/adminFetcher";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BadgeCheck,
  Calendar,
  Car,
  CheckCircle,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileText,
  Filter,
  MapPin,
  Maximize2,
  Minimize2,
  Phone,
  RefreshCw,
  RotateCw,
  Search,
  User,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { SafeImage } from "@/components/ui/SafeImage";

const STATUS_CONFIG = {
  pending: {
    label: "Pending Review",
    color: "text-amber-700",
    bg: "bg-amber-100",
    border: "border-amber-300",
    dot: "bg-amber-400",
    Icon: Clock,
  },
  approved: {
    label: "Approved",
    color: "text-green-700",
    bg: "bg-green-100",
    border: "border-green-300",
    dot: "bg-green-500",
    Icon: BadgeCheck,
  },
  rejected: {
    label: "Rejected",
    color: "text-red-700",
    bg: "bg-red-100",
    border: "border-red-300",
    dot: "bg-red-500",
    Icon: XCircle,
  },
  resubmit: {
    label: "Resubmit",
    color: "text-blue-700",
    bg: "bg-blue-100",
    border: "border-blue-300",
    dot: "bg-blue-500",
    Icon: AlertCircle,
  },
};

type RiderProfile = {
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  vehicleRegNo?: string | null;
  drivingLicense?: string | null;
  vehiclePhoto?: string | null;
  documents?: string | null;
};

type KycRecord = {
  id: string;
  userId: string;
  status: string;
  fullName?: string;
  cnic?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  city?: string;
  frontIdPhoto?: string;
  backIdPhoto?: string;
  selfiePhoto?: string;
  idFront?: string;
  idBack?: string;
  idPhoto?: string;
  selfie?: string;
  rejectionReason?: string;
  reviewedAt?: string;
  submittedAt: string;
  userName?: string;
  userPhone?: string;
  userEmail?: string;
  user?: { name: string; phone: string; email: string; avatar?: string; roles?: string };
  riderProfile?: RiderProfile | null;
};

function exportKycCSV(records: KycRecord[]) {
  const header = "ID,UserID,Name,Phone,CNIC,Status,City,Submitted";
  const lines = records.map((r) =>
    [
      r.id,
      r.userId,
      r.userName ?? r.user?.name ?? "",
      r.userPhone ?? r.user?.phone ?? "",
      r.cnic ?? "",
      r.status,
      r.city ?? "",
      r.submittedAt?.slice(0, 10) ?? "",
    ].join(",")
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kyc-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

function PhotoModal({ url, label, onClose }: { url: string; label?: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const zoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const rotate = () => setRotation((r) => (r + 90) % 360);
  const reset = () => {
    setZoom(1);
    setRotation(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "r" || e.key === "R") rotate();
      else if (e.key === "f" || e.key === "F") setFullscreen((f) => !f);
      else if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const containerSize = fullscreen ? "max-w-full w-full h-full" : "max-w-3xl w-full max-h-[90vh]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <div
        className={`relative ${containerSize} flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-black/60 p-1.5 backdrop-blur">
            <button
              onClick={zoomOut}
              title="Zoom out (-)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10 disabled:opacity-30"
              disabled={zoom <= 0.5}
            >
              <ZoomOut size={16} />
            </button>
            <span className="w-12 text-center font-mono text-xs text-white select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={zoomIn}
              title="Zoom in (+)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10 disabled:opacity-30"
              disabled={zoom >= 4}
            >
              <ZoomIn size={16} />
            </button>
            <div className="mx-1 h-5 w-px bg-white/20" />
            <button
              onClick={rotate}
              title="Rotate 90° (R)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10"
            >
              <RotateCw size={16} />
            </button>
            <button
              onClick={() => setFullscreen((f) => !f)}
              title="Toggle fullscreen (F)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10"
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={reset}
              title="Reset (0)"
              className="flex h-9 items-center justify-center rounded-lg px-2 text-xs text-white hover:bg-white/10"
            >
              Reset
            </button>
          </div>
          <div className="flex items-center gap-2">
            {label && (
              <span className="rounded-lg bg-black/60 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
                {label}
              </span>
            )}
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur hover:bg-white/10"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Image canvas */}
        <div className="flex flex-1 items-center justify-center overflow-auto rounded-2xl bg-white/5 p-4">
          <img
            src={url}
            alt={label ?? "KYC Document"}
            draggable={false}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: "transform 0.15s ease",
              maxHeight: fullscreen ? "85vh" : "75vh",
            }}
            className="max-w-full object-contain shadow-2xl select-none"
          />
        </div>

        <p className="mt-2 text-center text-xs text-white/40 select-none">
          Shortcuts: + / − zoom · R rotate · F fullscreen · 0 reset · Esc close
        </p>
      </div>
    </div>
  );
}

function ApproveModal({
  onConfirm,
  onClose,
  loading,
}: {
  onConfirm: (reason: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");
  const QUICK = [
    "Documents clear and valid — approved",
    "CNIC matches selfie — approved",
    "Vehicle papers verified",
    "Identity confirmed via call-back",
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-1 text-lg font-bold text-gray-900">Approve KYC</h3>
        <p className="mb-4 text-sm text-gray-500">
          Optionally add a verification note. This is recorded in the audit log.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => setReason(q)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${reason === q ? "border-green-600 bg-green-600 text-white" : "border-gray-200 bg-gray-50 text-gray-600 hover:border-green-300"}`}
            >
              {q}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Verification note (optional)…"
          className="mb-4 w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-400 focus:outline-none"
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white transition hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Approve KYC"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({
  onConfirm,
  onClose,
  loading,
}: {
  onConfirm: (reason: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");
  const QUICK = [
    "CNIC photo is blurry or unclear",
    "CNIC photo is cut off — show all 4 corners",
    "Selfie does not match CNIC photo",
    "CNIC is expired",
    "Information provided does not match CNIC",
    "Document is not a valid CNIC",
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-1 text-lg font-bold text-gray-900">Reject KYC</h3>
        <p className="mb-4 text-sm text-gray-500">
          Select a reason or write your own. This will be shown to the user.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => setReason(q)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${reason === q ? "border-red-600 bg-red-600 text-white" : "border-gray-200 bg-gray-50 text-gray-600 hover:border-red-300"}`}
            >
              {q}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Or write a custom reason..."
          className="mb-4 w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-400 focus:outline-none"
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim() || loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Reject KYC"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResubmitModal({
  onConfirm,
  onClose,
  loading,
}: {
  onConfirm: (reason: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");
  const QUICK = [
    "Photo too small or blurry — upload a clearer image",
    "CNIC is expired — upload a valid CNIC",
    "Selfie quality too low — retake in good lighting",
    "CNIC corners are cut off — show all 4 corners",
    "Selfie does not match CNIC — use the same person",
    "Document is not a CNIC — submit your national ID card",
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-1 text-lg font-bold text-gray-900">Request Resubmission</h3>
        <p className="mb-4 text-sm text-gray-500">
          Tell the user what needs to be corrected. They will be notified via push, SMS, and email.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => setReason(q)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${reason === q ? "border-amber-500 bg-amber-500 text-white" : "border-gray-200 bg-gray-50 text-gray-600 hover:border-amber-300"}`}
            >
              {q}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Or describe what needs to be fixed…"
          className="mb-4 w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim() || loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Request Resubmit"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function KycDetailPanel({
  record,
  onClose,
  onApprove,
  onReject,
}: {
  record: KycRecord;
  onClose: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [photo, setPhoto] = useState<{ url: string; label: string } | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showResubmit, setShowResubmit] = useState(false);
  const qc = useQueryClient();

  const approveMut = useMutation({
    mutationFn: async (reason: string) => {
      return fetchAdminAbsolute(`/api/kyc/admin/${record.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-kyc"] });
      setShowApprove(false);
      onApprove();
      onClose();
    },
  });

  const rejectMut = useMutation({
    mutationFn: async (reason: string) => {
      return fetchAdminAbsolute(`/api/kyc/admin/${record.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-kyc"] });
      setShowReject(false);
      onReject("");
      onClose();
    },
  });

  const resubmitMut = useMutation({
    mutationFn: async (reason: string) => {
      return fetchAdminAbsolute(`/api/kyc/admin/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "resubmit", rejectionReason: reason }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-kyc"] });
      setShowResubmit(false);
      onReject("");
      onClose();
    },
  });

  const { data: fullRecord } = useQuery({
    queryKey: ["admin-kyc-detail", record.id],
    queryFn: async () => {
      const j = await fetchAdminAbsolute(`/api/kyc/admin/${record.id}`);
      return (j?.data ?? j) as KycRecord;
    },
  });

  const details = fullRecord ?? record;
  const stConf =
    STATUS_CONFIG[details.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;

  const fullApiUrl = (path?: string) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return `${window.location.origin}${path}`;
  };

  return (
    <>
      {photo && <PhotoModal url={photo.url} label={photo.label} onClose={() => setPhoto(null)} />}
      {showApprove && (
        <ApproveModal
          onConfirm={(r) => approveMut.mutate(r)}
          onClose={() => setShowApprove(false)}
          loading={approveMut.isPending}
        />
      )}
      {showReject && (
        <RejectModal
          onConfirm={(r) => rejectMut.mutate(r)}
          onClose={() => setShowReject(false)}
          loading={rejectMut.isPending}
        />
      )}
      {showResubmit && (
        <ResubmitModal
          onConfirm={(r) => resubmitMut.mutate(r)}
          onClose={() => setShowResubmit(false)}
          loading={resubmitMut.isPending}
        />
      )}

      <div
        className="fixed inset-0 z-40 flex items-start justify-end bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="h-full max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-4">
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${stConf.bg} ${stConf.color} border ${stConf.border}`}
            >
              <div className={`h-1.5 w-1.5 rounded-full ${stConf.dot}`} />
              {stConf.label}
            </div>
            <span className="flex-1 text-xs text-gray-400">#{record.id.slice(-8)}</span>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl hover:bg-gray-100"
            >
              <X size={18} className="text-gray-500" />
            </button>
          </div>

          <div className="space-y-5 p-5">
            {/* User info */}
            <div className="rounded-2xl bg-gray-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-lg font-bold text-blue-600">
                  {(details.userName ?? details.userPhone ?? "?")[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{details.userName ?? "—"}</p>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Phone size={11} /> {details.userPhone}
                    </span>
                    {details.userEmail && (
                      <span className="flex items-center gap-1">✉ {details.userEmail}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Personal details */}
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <div className="bg-blue-600 px-4 py-2.5">
                <p className="text-sm font-semibold text-white">Personal Information</p>
              </div>
              <div className="divide-y divide-gray-50">
                {[
                  { icon: User, label: "Full Name", val: details.fullName },
                  { icon: CreditCard, label: "CNIC", val: details.cnic },
                  { icon: Calendar, label: "Date of Birth", val: details.dateOfBirth },
                  { icon: User, label: "Gender", val: details.gender },
                  { icon: MapPin, label: "City", val: details.city },
                  { icon: MapPin, label: "Address", val: details.address },
                ].map(({ icon: Icon, label, val }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon size={14} className="shrink-0 text-gray-400" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400">{label}</p>
                      <p className="text-sm font-medium text-gray-800">
                        {val ?? <span className="text-xs text-gray-300 italic">Not provided</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Document photos */}
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <div className="bg-blue-600 px-4 py-2.5">
                <p className="text-sm font-semibold text-white">Submitted Documents</p>
              </div>
              <div className="grid grid-cols-3 gap-3 p-4">
                {[
                  {
                    keys: ["frontIdPhoto", "idFront", "idPhoto"] as const,
                    label: "CNIC Front",
                  },
                  {
                    keys: ["backIdPhoto", "idBack"] as const,
                    label: "CNIC Back",
                  },
                  {
                    keys: ["selfiePhoto", "selfie"] as const,
                    label: "Selfie",
                  },
                ].map(({ keys, label }) => {
                  const raw = keys
                    .map((k) => details[k as keyof KycRecord] as string | undefined)
                    .find(Boolean);
                  const url = fullApiUrl(raw);
                  return (
                    <div key={label} className="text-center">
                      {url ? (
                        <button
                          onClick={() => setPhoto({ url, label })}
                          className="group relative w-full"
                        >
                          <SafeImage
                            src={url}
                            alt={label}
                            className="h-24 w-full rounded-xl border border-gray-100 object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 opacity-0 transition group-hover:opacity-100">
                            <Eye size={18} className="text-white" />
                          </div>
                        </button>
                      ) : (
                        <div className="flex h-24 w-full items-center justify-center rounded-xl bg-gray-100">
                          <XCircle size={20} className="text-gray-300" />
                        </div>
                      )}
                      <p className="mt-1 text-[10px] text-gray-500">{label}</p>
                      <p className="text-[10px]">
                        {url ? (
                          <span className="text-green-600">✓ Uploaded</span>
                        ) : (
                          <span className="text-red-400">Missing</span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Vehicle papers (riders only) */}
            {details.riderProfile && (
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                <div className="flex items-center gap-2 bg-indigo-600 px-4 py-2.5">
                  <Car size={14} className="text-white" />
                  <p className="text-sm font-semibold text-white">Vehicle Papers</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {[
                    { label: "Vehicle Type", val: details.riderProfile.vehicleType },
                    { label: "Number Plate", val: details.riderProfile.vehiclePlate },
                    { label: "Registration No.", val: details.riderProfile.vehicleRegNo },
                    {
                      label: "Driving License",
                      val:
                        details.riderProfile.drivingLicense &&
                        !/^https?:|^\//.test(details.riderProfile.drivingLicense)
                          ? details.riderProfile.drivingLicense
                          : null,
                    },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center gap-3 px-4 py-2.5">
                      <FileText size={14} className="shrink-0 text-gray-400" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-gray-400">{label}</p>
                        <p className="text-sm font-medium text-gray-800">
                          {val ?? (
                            <span className="text-xs text-gray-300 italic">Not provided</span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 p-4">
                  {[
                    { key: "vehiclePhoto" as const, label: "Vehicle Photo" },
                    { key: "drivingLicense" as const, label: "Driving License" },
                  ].map(({ key, label }) => {
                    const raw = details.riderProfile?.[key] ?? null;
                    const isImage = !!raw && /^https?:|^\//.test(raw);
                    const url = isImage ? fullApiUrl(raw) : null;
                    return (
                      <div key={key} className="text-center">
                        {url ? (
                          <button
                            onClick={() => setPhoto({ url, label })}
                            className="group relative w-full"
                          >
                            <SafeImage
                              src={url}
                              alt={label}
                              className="h-28 w-full rounded-xl border border-gray-100 object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 opacity-0 transition group-hover:opacity-100">
                              <Eye size={18} className="text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="flex h-28 w-full flex-col items-center justify-center rounded-xl bg-gray-100 text-gray-300">
                            <FileText size={20} />
                            {raw && !isImage && (
                              <span className="mt-1 max-w-full truncate px-2 text-[10px] text-gray-500">
                                {raw}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="mt-1 text-[10px] text-gray-500">{label}</p>
                        <p className="text-[10px]">
                          {url ? (
                            <span className="text-green-600">✓ Uploaded</span>
                          ) : raw ? (
                            <span className="text-amber-500">Text on file</span>
                          ) : (
                            <span className="text-red-400">Missing</span>
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {details.riderProfile.documents && (
                  <div className="px-4 pb-4">
                    <p className="mb-1 text-[10px] text-gray-400">Additional Documents</p>
                    <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs break-all text-gray-700">
                      {details.riderProfile.documents}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Rejection reason */}
            {details.rejectionReason && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="mb-1 text-sm font-semibold text-red-700">Rejection Reason</p>
                <p className="text-sm text-red-600">{details.rejectionReason}</p>
              </div>
            )}

            {/* Timestamps */}
            <div className="space-y-1 text-xs text-gray-400">
              <p>Submitted: {new Date(details.submittedAt).toLocaleString("en-PK")}</p>
              {details.reviewedAt && (
                <p>Reviewed: {new Date(details.reviewedAt).toLocaleString("en-PK")}</p>
              )}
            </div>

            {/* Actions */}
            {details.status === "pending" && (
              <div className="space-y-2 pt-2">
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowReject(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-red-300 py-3 text-sm font-bold text-red-600 transition hover:bg-red-50"
                  >
                    <XCircle size={16} /> Reject
                  </button>
                  <button
                    onClick={() => setShowApprove(true)}
                    disabled={approveMut.isPending}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-white shadow-md shadow-green-100 transition hover:bg-green-700"
                  >
                    {approveMut.isPending ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <>
                        <CheckCircle size={16} /> Approve
                      </>
                    )}
                  </button>
                </div>
                <button
                  onClick={() => setShowResubmit(true)}
                  disabled={resubmitMut.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-300 py-2.5 text-sm font-bold text-amber-700 transition hover:bg-amber-50"
                >
                  {resubmitMut.isPending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  ) : (
                    <>
                      <AlertCircle size={16} /> Request Resubmit
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function KycPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<KycRecord | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [inlineLoadingId, setInlineLoadingId] = useState<string | null>(null);
  const [inlineRejectId, setInlineRejectId] = useState<string | null>(null);

  const inlineApproveMut = useMutation({
    mutationFn: async (id: string) => {
      setInlineLoadingId(id);
      return fetchAdminAbsolute(`/api/kyc/admin/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ reason: "" }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-kyc"] });
      setInlineLoadingId(null);
    },
    onError: () => setInlineLoadingId(null),
  });

  const inlineRejectMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      setInlineLoadingId(id);
      return fetchAdminAbsolute(`/api/kyc/admin/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-kyc"] });
      setInlineLoadingId(null);
      setInlineRejectId(null);
    },
    onError: () => {
      setInlineLoadingId(null);
      setInlineRejectId(null);
    },
  });

  /* Debounce search input */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-kyc", statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({ status: statusFilter, limit: "50" });
      if (search) params.set("q", search);
      const j = await fetchAdminAbsolute(`/api/kyc/admin/list?${params.toString()}`);
      return (j?.data ?? j) as { records: KycRecord[] };
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (data) setLastRefreshed(new Date());
  }, [data]);
  useEffect(() => {
    const handler = () => setSelected(null);
    window.addEventListener("admin:close-modal", handler);
    return () => window.removeEventListener("admin:close-modal", handler);
  }, []);

  type KycSortKey = "userName" | "city" | "status" | "submittedAt";
  const [kycSortKey, setKycSortKey] = useState<KycSortKey>("submittedAt");
  const [kycSortDir, setKycSortDir] = useState<"asc" | "desc">("desc");

  const handleKycSort = (key: KycSortKey) => {
    if (kycSortKey === key) setKycSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setKycSortKey(key);
      setKycSortDir("asc");
    }
  };

  function KycSortIcon({ col }: { col: KycSortKey }) {
    if (kycSortKey !== col) return <ArrowUpDown className="ml-0.5 inline h-3 w-3 opacity-40" />;
    return kycSortDir === "asc" ? (
      <ArrowUp className="ml-0.5 inline h-3 w-3 text-blue-600" />
    ) : (
      <ArrowDown className="ml-0.5 inline h-3 w-3 text-blue-600" />
    );
  }

  const statusOrder: Record<string, number> = { pending: 0, resubmit: 1, rejected: 2, approved: 3 };

  const records = data?.records ?? [];

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const dir = kycSortDir === "asc" ? 1 : -1;
      if (kycSortKey === "userName")
        return dir * (a.userName ?? "").localeCompare(b.userName ?? "");
      if (kycSortKey === "city") return dir * (a.city ?? "").localeCompare(b.city ?? "");
      if (kycSortKey === "status")
        return dir * ((statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));
      return dir * (new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, kycSortKey, kycSortDir]);

  const counts = {
    all: records.length,
    pending: records.filter((r) => r.status === "pending").length,
    approved: records.filter((r) => r.status === "approved").length,
    rejected: records.filter((r) => r.status === "rejected").length,
    resubmit: records.filter((r) => r.status === "resubmit").length,
  };

  const FILTERS = [
    { key: "all", label: "All", count: counts.all },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "approved", label: "Approved", count: counts.approved },
    { key: "rejected", label: "Rejected", count: counts.rejected },
    { key: "resubmit", label: "Resubmit", count: counts.resubmit },
  ];

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">KYC page crashed. Please reload.</div>
      }
    >
      <div className="space-y-6 p-6">
        {inlineRejectId && (
          <RejectModal
            onConfirm={(reason) => inlineRejectMut.mutate({ id: inlineRejectId, reason })}
            onClose={() => setInlineRejectId(null)}
            loading={inlineRejectMut.isPending}
          />
        )}
        {selected && (
          <KycDetailPanel
            record={selected}
            onClose={() => setSelected(null)}
            onApprove={() => {
              void qc.invalidateQueries({ queryKey: ["admin-kyc"] });
            }}
            onReject={() => {
              void qc.invalidateQueries({ queryKey: ["admin-kyc"] });
            }}
          />
        )}

        <PageHeader
          icon={BadgeCheck}
          title="KYC Verification"
          subtitle="Review and manage user identity verification requests"
          iconBgClass="bg-blue-100"
          iconColorClass="text-blue-600"
          actions={
            <div className="flex items-center gap-2">
              <div className="relative w-72">
                <Search
                  size={14}
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name, phone or CNIC…"
                  className="w-full rounded-xl border border-gray-200 py-2 pr-9 pl-9 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-300 focus:outline-none"
                />
                {searchInput && (
                  <button
                    onClick={() => setSearchInput("")}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                onClick={() => exportKycCSV(records)}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
              >
                <Download size={14} /> CSV
              </button>
              <button
                onClick={() => refetch()}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          }
        />
        <LastUpdated
          dataUpdatedAt={lastRefreshed?.getTime() ?? 0}
          className="-mt-3 mb-1 text-xs text-gray-400"
        />

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {isLoading ? (
            [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                icon={Filter}
                label="Total"
                value={records.length}
                iconBgClass="bg-gray-100"
                iconColorClass="text-gray-700"
              />
              <StatCard
                icon={Clock}
                label="Pending"
                value={counts.pending}
                iconBgClass="bg-amber-50"
                iconColorClass="text-amber-700"
                onClick={() => setStatusFilter("pending")}
              />
              <StatCard
                icon={BadgeCheck}
                label="Approved"
                value={counts.approved}
                iconBgClass="bg-green-50"
                iconColorClass="text-green-700"
                onClick={() => setStatusFilter("approved")}
              />
              <StatCard
                icon={XCircle}
                label="Rejected"
                value={counts.rejected}
                iconBgClass="bg-red-50"
                iconColorClass="text-red-700"
                onClick={() => setStatusFilter("rejected")}
              />
            </>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition ${statusFilter === f.key ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-blue-300"}`}
            >
              {f.label}
              {f.count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs ${statusFilter === f.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}
                >
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-3 border-blue-500 border-t-transparent" />
              <p className="text-sm text-gray-500">Loading KYC submissions…</p>
            </div>
          ) : records.length === 0 ? (
            <div className="p-12 text-center">
              <BadgeCheck size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="font-semibold text-gray-500">No submissions found</p>
              <p className="mt-1 text-sm text-gray-400">
                {statusFilter !== "all" ? "Try a different filter" : "No KYC requests yet"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 bg-gray-50 px-5 py-3 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                <button
                  onClick={() => handleKycSort("userName")}
                  className="col-span-3 flex items-center gap-0.5 text-left transition-colors hover:text-blue-600"
                >
                  User{KycSortIcon({ col: "userName" })}
                </button>
                <div className="col-span-2">CNIC / Name</div>
                <button
                  onClick={() => handleKycSort("city")}
                  className="col-span-2 flex items-center gap-0.5 text-left transition-colors hover:text-blue-600"
                >
                  City{KycSortIcon({ col: "city" })}
                </button>
                <button
                  onClick={() => handleKycSort("status")}
                  className="col-span-2 flex items-center gap-0.5 text-left transition-colors hover:text-blue-600"
                >
                  Status{KycSortIcon({ col: "status" })}
                </button>
                <button
                  onClick={() => handleKycSort("submittedAt")}
                  className="col-span-1 flex items-center gap-0.5 text-left transition-colors hover:text-blue-600"
                >
                  Date{KycSortIcon({ col: "submittedAt" })}
                </button>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              {sortedRecords.map((rec) => {
                const stConf =
                  STATUS_CONFIG[rec.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
                const isLoading = inlineLoadingId === rec.id;
                return (
                  <div
                    key={rec.id}
                    onClick={() => setSelected(rec)}
                    className="grid cursor-pointer grid-cols-12 items-center gap-4 px-5 py-3.5 transition hover:bg-gray-50"
                  >
                    <div className="col-span-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-sm font-bold text-blue-600">
                          {(rec.userName ?? rec.userPhone ?? "?")[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-800">
                            {rec.userName ?? "—"}
                          </p>
                          <p className="flex items-center gap-1 truncate text-xs text-gray-400">
                            <Phone size={10} /> {rec.userPhone}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <p className="truncate text-sm font-medium text-gray-700">
                        {rec.fullName ?? "—"}
                      </p>
                      <p className="font-mono text-xs text-gray-400">{rec.cnic ?? "—"}</p>
                    </div>
                    <div className="col-span-2 text-sm text-gray-600">{rec.city ?? "—"}</div>
                    <div className="col-span-2">
                      <StatusBadge status={rec.status} label={stConf.label} size="sm" />
                    </div>
                    <div className="col-span-1 text-xs text-gray-400">
                      {new Date(rec.submittedAt).toLocaleDateString("en-PK", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </div>
                    <div
                      className="col-span-2 flex items-center justify-end gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {rec.status === "pending" ? (
                        isLoading ? (
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                        ) : (
                          <>
                            <button
                              title="Approve"
                              onClick={(e) => {
                                e.stopPropagation();
                                inlineApproveMut.mutate(rec.id);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-green-200 bg-green-50 text-green-600 transition hover:bg-green-100"
                            >
                              <CheckCircle size={15} />
                            </button>
                            <button
                              title="Reject"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInlineRejectId(rec.id);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"
                            >
                              <XCircle size={15} />
                            </button>
                          </>
                        )
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
