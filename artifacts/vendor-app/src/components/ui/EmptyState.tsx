import type { LucideIcon } from "lucide-react";
import { Package } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon = Package,
  emoji,
  title,
  subtitle,
  actionLabel,
  onAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`}
    >
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-gray-100 bg-gray-50">
        {emoji ? (
          <span className="text-3xl">{emoji}</span>
        ) : (
          <Icon size={28} className="text-gray-300" />
        )}
      </div>
      <p className="text-base font-bold text-gray-700">{title}</p>
      {subtitle && (
        <p className="mt-1 max-w-xs text-sm leading-relaxed text-gray-400">{subtitle}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 rounded-2xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-600 active:bg-orange-700"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
