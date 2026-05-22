import { CheckCircle } from "lucide-react";

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 ${className || ""}`} />;
}

export function SkeletonProfile() {
  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <div
        className="rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-24"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
      />
      <div className="-mt-20 space-y-4 px-4">
        <div className="rounded-3xl bg-white p-5 shadow-lg">
          <div className="flex items-start gap-4">
            <SkeletonBlock className="h-16 w-16 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-5 w-32" />
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} className="h-20 flex-1 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonBlock key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <SkeletonBlock className="h-48 rounded-3xl" />
      </div>
    </div>
  );
}

export function InfoRow({
  label,
  value,
  empty,
  icon,
}: {
  label: string;
  value?: string | null;
  empty?: string;
  icon?: React.ReactElement;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-50 px-5 py-3.5 last:border-0">
      <span className="flex flex-shrink-0 items-center gap-2 text-xs font-semibold text-gray-500">
        {icon}
        {label}
      </span>
      <span
        className={`text-right text-sm font-semibold ${value ? "text-gray-800" : "text-xs text-gray-300 italic"}`}
      >
        {value || empty || "—"}
      </span>
    </div>
  );
}

export function SavedCheckmark({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <span className="inline-flex animate-[fadeIn_0.3s_ease-out] items-center gap-1 text-xs font-bold text-green-600">
      <CheckCircle size={14} className="text-green-500" /> {label}
    </span>
  );
}
