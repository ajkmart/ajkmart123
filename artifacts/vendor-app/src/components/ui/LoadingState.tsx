import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  rows?: number;
  className?: string;
}

export function LoadingState({ message, className = "" }: LoadingStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-16 ${className}`}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50">
        <Loader2 size={22} className="animate-spin text-orange-400" />
      </div>
      <p className="text-sm font-semibold text-gray-500">{message ?? "Loading…"}</p>
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-20 rounded-2xl" />
      ))}
    </div>
  );
}

export function LoadingCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton h-24 rounded-2xl" />
      ))}
    </div>
  );
}
