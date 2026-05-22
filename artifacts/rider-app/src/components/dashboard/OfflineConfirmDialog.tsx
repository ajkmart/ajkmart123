interface OfflineConfirmDialogProps {
  totalRequests: number;
  onStayOnline: () => void;
  onGoOffline: () => void;
}

export function OfflineConfirmDialog({
  totalRequests,
  onStayOnline,
  onGoOffline,
}: OfflineConfirmDialogProps) {
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[1100] flex animate-[fadeIn_0.15s_ease-out] items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm going offline"
    >
      <div className="mx-auto w-full max-w-sm animate-[slideUp_0.2s_ease-out] rounded-t-3xl bg-white px-6 py-6 shadow-2xl">
        <p className="mb-1.5 text-base font-extrabold text-gray-900">Go Offline?</p>
        <p className="mb-5 text-sm text-gray-500">
          You have {totalRequests} request{totalRequests > 1 ? "s" : ""} waiting — go offline
          anyway?
        </p>
        <div className="flex gap-3">
          <button
            onClick={onStayOnline}
            className="h-12 flex-1 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Stay Online
          </button>
          <button
            onClick={onGoOffline}
            className="h-12 flex-1 rounded-xl bg-gray-900 text-sm font-bold text-white transition-colors hover:bg-gray-800"
          >
            Go Offline
          </button>
        </div>
      </div>
    </div>
  );
}
