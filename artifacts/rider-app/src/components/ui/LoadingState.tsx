import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  rows?: number;
  className?: string;
}

export function LoadingState({ message, rows: _rows = 3, className = "" }: LoadingStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-16 ${className}`}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
        <Loader2 size={22} className="animate-spin text-gray-400" />
      </div>
      <p className="text-sm font-semibold text-gray-500">{message ?? "Loading…"}</p>
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-3xl border border-gray-100 bg-white p-4"
        >
          <div className="h-10 w-10 flex-shrink-0 rounded-2xl bg-gray-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-32 rounded-full bg-gray-200" />
            <div className="h-2.5 w-24 rounded-full bg-gray-100" />
          </div>
          <div className="flex flex-col items-end space-y-1.5">
            <div className="h-3.5 w-16 rounded-full bg-gray-200" />
            <div className="h-5 w-14 rounded-full bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
