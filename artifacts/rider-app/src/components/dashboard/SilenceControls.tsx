import { Volume2, VolumeX } from "lucide-react";
import { silenceFor, unsilence } from "../../lib/notificationSound";

interface SilenceControlsProps {
  silenced: boolean;
  /** Remaining silence time in whole minutes (from getSilenceRemaining) */
  silenceRemaining: number;
  showSilenceMenu: boolean;
  onSetShowSilenceMenu: (show: boolean) => void;
  onSetSilenced: (val: boolean) => void;
  onSetSilenceRemaining: (val: number) => void;
  showToast: (msg: string, type: "success" | "error") => void;
}

export function SilenceControls({
  silenced,
  silenceRemaining,
  showSilenceMenu,
  onSetShowSilenceMenu,
  onSetSilenced,
  onSetSilenceRemaining,
  showToast,
}: SilenceControlsProps) {
  const displayMin = Math.max(1, silenceRemaining);

  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        onClick={() => onSetShowSilenceMenu(!showSilenceMenu)}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${silenced ? "border-red-500/30 bg-red-500/15 text-red-400" : "border-white/[0.06] bg-white/[0.06] text-white/50 hover:text-white/70"}`}
        aria-label={
          silenced ? `Sound muted, ${displayMin} minutes remaining` : "Timed mute options"
        }
      >
        {silenced ? <VolumeX size={13} /> : <Volume2 size={13} />}
        {silenced ? `Muted ${displayMin}m` : "Sound"}
      </button>
      {showSilenceMenu && (
        <div className="flex animate-[slideUp_0.2s_ease-out] items-center gap-1.5">
          {silenced ? (
            <button
              onClick={() => {
                unsilence();
                onSetSilenced(false);
                onSetShowSilenceMenu(false);
                showToast("Sound unmuted", "success");
              }}
              className="rounded-lg border border-green-500/30 bg-green-500/20 px-2.5 py-1.5 text-[10px] font-bold text-green-400"
            >
              Unmute
            </button>
          ) : (
            <>
              {[15, 30, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    silenceFor(m);
                    onSetSilenced(true);
                    onSetSilenceRemaining(m);
                    onSetShowSilenceMenu(false);
                    showToast(`Sound muted for ${m}min`, "success");
                  }}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.08] px-2.5 py-1.5 text-[10px] font-bold text-white/60 transition-colors hover:bg-white/[0.12]"
                >
                  {m}m
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
