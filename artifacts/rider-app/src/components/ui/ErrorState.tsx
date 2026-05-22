import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  subtitle = "Check your connection and try again.",
  onRetry,
  retryLabel = "Try Again",
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`}
    >
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-red-50">
        <AlertCircle size={28} className="text-red-400" />
      </div>
      <p className="text-base font-bold text-gray-700">{title}</p>
      {subtitle && <p className="mt-1 text-sm leading-relaxed text-gray-400">{subtitle}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-5 py-2.5 text-sm font-bold text-red-700 transition-colors active:bg-red-100"
        >
          <RefreshCw size={13} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
