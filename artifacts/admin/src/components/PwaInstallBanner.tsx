import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { usePwaInstall } from "../hooks/usePwaInstall";

export function PwaInstallBanner() {
  const { isInstallable, isInstalled, isIOS, isStandalone, isDismissed, promptInstall, dismiss } =
    usePwaInstall();

  if (isInstalled || isStandalone || isDismissed) return null;
  if (!isInstallable && !isIOS) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.35)]">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-indigo-300">
            <Download className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm leading-tight font-semibold text-slate-100">
              Install Admin Panel
            </p>
            <p className="mt-0.5 text-xs leading-snug text-slate-300/70">
              {isIOS ? "Tap Share → Add to Home Screen" : "Install for quick access & offline use"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isIOS && (
            <Button
              size="sm"
              onClick={promptInstall}
              className="h-9 rounded-lg bg-indigo-500 px-4 text-xs font-semibold text-white hover:bg-indigo-400"
            >
              Install
            </Button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install banner"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
