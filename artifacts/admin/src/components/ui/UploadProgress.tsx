import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";

/**
 * UploadProgress — canonical upload feedback component shared by every
 * admin upload surface (banners, products, KYC, etc.).
 *
 * Backend streaming contract (documented in `bugs.md` under "File
 * Upload/Download Issues"):
 *   - Upload endpoints accept `multipart/form-data` and respond
 *     incrementally via `XMLHttpRequest.upload.onprogress` events.
 *   - The server writes a final `{ ok, url, error? }` payload on close.
 *   - Failures must surface a `{ ok: false, error: string }` body and a
 *     non-2xx status so the UI can flip to the `error` state.
 */
export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface UploadProgressProps {
  /** 0..100 — clamped on render. Required for `uploading` status. */
  progress?: number;
  status: UploadStatus;
  fileName?: string;
  errorMessage?: string;
  successMessage?: string;
  onCancel?: () => void;
  className?: string;
}

export function UploadProgress({
  progress = 0,
  status,
  fileName,
  errorMessage,
  successMessage,
  onCancel,
  className,
}: UploadProgressProps) {
  if (status === "idle") return null;

  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  const tone =
    status === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : status === "success"
        ? "border-green-200 bg-green-50 text-green-900"
        : "border-indigo-200 bg-indigo-50 text-indigo-900";

  const Icon = status === "error" ? AlertCircle : status === "success" ? CheckCircle2 : Loader2;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="upload-progress"
      className={cn("flex items-center gap-3 rounded-lg border px-3 py-2 text-sm", tone, className)}
    >
      <Icon
        className={cn("h-4 w-4 shrink-0", status === "uploading" && "animate-spin")}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{fileName ?? "Upload"}</span>
          {status === "uploading" && (
            <span className="text-xs tabular-nums" aria-label={`${pct}% uploaded`}>
              {pct}%
            </span>
          )}
        </div>
        {status === "uploading" && (
          <div
            className="mt-1 h-1.5 w-full rounded-full bg-indigo-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div
              className="h-full rounded-full bg-indigo-600 transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {status === "error" && errorMessage && (
          <p className="mt-1 text-xs text-red-700">{errorMessage}</p>
        )}
        {status === "success" && successMessage && (
          <p className="mt-1 text-xs text-green-700">{successMessage}</p>
        )}
      </div>
      {status === "uploading" && onCancel && (
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel upload"
          className="rounded p-1 text-indigo-700 hover:bg-indigo-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
