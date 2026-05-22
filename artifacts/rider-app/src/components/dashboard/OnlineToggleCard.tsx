import type { TranslationKey } from "@workspace/i18n";
import { Volume2, VolumeX, Wifi, Zap } from "lucide-react";
import { memo } from "react";

interface OnlineToggleCardProps {
  effectiveOnline: boolean;
  toggling: boolean;
  silenceOn: boolean;
  onToggleOnline: () => void;
  onToggleSilence: () => void;
  T: (key: TranslationKey) => string;
}

export const OnlineToggleCard = memo(function OnlineToggleCard({
  effectiveOnline,
  toggling,
  silenceOn,
  onToggleOnline,
  onToggleSilence,
  T,
}: OnlineToggleCardProps) {
  return (
    <div
      className={`rounded-2xl border p-4 backdrop-blur-sm transition-all duration-300 ${effectiveOnline ? "border-green-500/20 bg-white/[0.08]" : "border-white/[0.06] bg-white/[0.04]"}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl ${effectiveOnline ? "bg-green-500/15" : "bg-white/[0.06]"}`}
          >
            {effectiveOnline ? (
              <Zap size={22} className="text-green-400" />
            ) : (
              <Wifi size={22} className="text-white/40" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div
                className={`h-2.5 w-2.5 rounded-full ${effectiveOnline ? "animate-pulse bg-green-400 shadow-lg shadow-green-400/50" : "bg-gray-500"}`}
              />
              <p className="text-lg font-extrabold tracking-tight">
                {effectiveOnline ? T("online") : T("offline")}
              </p>
            </div>
            <p className="mt-0.5 text-xs text-white/40">
              {effectiveOnline ? T("acceptingOrders") : T("tapToStart")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSilence}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 transition-all ${silenceOn ? "border border-red-500/20 bg-red-500/20 text-red-400" : "border border-white/10 bg-white/10 text-white/40"}`}
            aria-label={silenceOn ? "Unmute notification sounds" : "Mute notification sounds"}
          >
            {silenceOn ? <VolumeX size={15} /> : <Volume2 size={15} />}
            <span className="text-[10px] leading-none font-bold">
              {silenceOn ? "Sound Off" : "Sound"}
            </span>
          </button>
          <button
            onClick={onToggleOnline}
            disabled={toggling}
            className={`relative h-[30px] w-[56px] rounded-full shadow-inner transition-all duration-300 ${effectiveOnline ? "bg-green-500 shadow-green-500/30" : "bg-white/20"} ${toggling ? "scale-95 opacity-50" : "active:scale-95"}`}
            role="switch"
            aria-checked={effectiveOnline}
            aria-label={effectiveOnline ? "Go offline" : "Go online"}
          >
            <div
              className={`absolute top-[3px] h-[24px] w-[24px] rounded-full bg-white shadow-md transition-all duration-300 ${effectiveOnline ? "left-[29px]" : "left-[3px]"}`}
            />
          </button>
        </div>
      </div>
    </div>
  );
});
