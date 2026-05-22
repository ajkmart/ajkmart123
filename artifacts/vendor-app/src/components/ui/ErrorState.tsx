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
      <div
        className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl"
        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.22)" }}
      >
        <AlertCircle size={28} style={{ color: "#F87171" }} />
      </div>
      <p className="text-base font-bold text-white">{title}</p>
      {subtitle && (
        <p className="mt-1 max-w-xs text-sm leading-relaxed" style={{ color: "#6B7280" }}>
          {subtitle}
        </p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold transition-colors"
          style={{
            background: "rgba(239,68,68,0.12)",
            color: "#F87171",
            border: "1px solid rgba(239,68,68,0.22)",
          }}
        >
          <RefreshCw size={13} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
