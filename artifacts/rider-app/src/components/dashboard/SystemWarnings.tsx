import type { TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  MapPin,
  Pin,
  SkipForward,
  Volume2,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import { Link } from "wouter";

/* ── Banner height constants — keep in sync with the CSS values below ──────
   Each banner is ~28 px tall (py-1.5 + text-xs = ~28 px). We stack them
   vertically so they never overlap each other or the page header.          */
const BANNER_H = 28; /* px — height of each top fixed banner               */

interface FixedBannersProps {
  socketConnected: boolean;
  effectiveOnline: boolean;
  zoneWarning: string | null;
  onDismissZone: () => void;
  wakeLockWarning: boolean;
  onDismissWakeLock: () => void;
  audioLocked: boolean;
  onUnlockAudio: () => void;
  onRetryConnect?: () => void;
  T: (key: TranslationKey) => string;
}

export function FixedBanners({
  socketConnected,
  effectiveOnline,
  zoneWarning,
  onDismissZone,
  wakeLockWarning,
  onDismissWakeLock,
  audioLocked,
  onUnlockAudio,
  onRetryConnect,
  T,
}: FixedBannersProps) {
  /* Build the ordered list of active top banners so we can stack them
     without overlap — each one is offset by the cumulative height of those
     above it. */
  const showConnection = !socketConnected && effectiveOnline;
  const showZone = !!zoneWarning && effectiveOnline;
  const showAudio = audioLocked && effectiveOnline;

  /* Safe-area base padding */
  const safeTop = "env(safe-area-inset-top, 0px)";

  /* Stack positions (top offset for each banner) */
  let bannerIdx = 0;
  const connectionTop = showConnection ? bannerIdx++ : -1;
  const zoneTop = showZone ? bannerIdx++ : -1;
  const audioTop = showAudio ? bannerIdx++ : -1;

  /* Number of top banners currently visible — used to position the bottom WakeLock toast */
  const _totalTopBanners = bannerIdx;

  return (
    <>
      {/* ── Connection lost banner ── */}
      {showConnection && (
        <div
          className="fixed right-0 left-0 z-[50] flex animate-pulse items-center justify-center gap-2 bg-red-600 text-center text-xs font-bold text-white shadow-lg"
          style={{
            top: `calc(${safeTop} + ${connectionTop * BANNER_H}px)`,
            height: BANNER_H,
          }}
          role="alert"
          aria-live="assertive"
        >
          <WifiOff size={13} />
          <span>{T("connectionLost")}</span>
          {onRetryConnect && (
            <button
              onClick={onRetryConnect}
              className="ml-1 rounded bg-white/20 px-2 py-0.5 text-[10px] font-extrabold text-white hover:bg-white/30 active:bg-white/40"
              aria-label="Retry connection"
            >
              Retry sync
            </button>
          )}
        </div>
      )}

      {/* ── Zone warning banner ── */}
      {showZone && (
        <div
          className="fixed right-0 left-0 z-[49] flex items-center justify-center gap-1.5 bg-amber-500 px-3 text-xs font-bold text-white shadow-lg"
          style={{
            top: `calc(${safeTop} + ${zoneTop * BANNER_H}px)`,
            height: BANNER_H,
          }}
          role="alert"
          aria-live="polite"
        >
          <MapPin size={13} className="flex-shrink-0" />
          <span className="truncate">{zoneWarning}</span>
          <button
            onClick={onDismissZone}
            className="ml-1 flex-shrink-0 rounded-full bg-white/20 p-0.5"
            aria-label="Dismiss zone warning"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* ── Audio locked banner ── */}
      {showAudio && (
        <button
          onClick={onUnlockAudio}
          onTouchEnd={(e) => {
            e.preventDefault();
            onUnlockAudio();
          }}
          onPointerUp={onUnlockAudio}
          className="fixed right-0 left-0 z-[48] flex w-full items-center justify-center gap-1.5 bg-indigo-600 px-3 text-xs font-bold text-white shadow-lg"
          style={{
            top: `calc(${safeTop} + ${audioTop * BANNER_H}px)`,
            height: BANNER_H,
          }}
          aria-label="Tap to enable ride alert sounds"
        >
          <Volume2 size={13} className="flex-shrink-0 animate-pulse" />
          Tap to enable ride sounds
        </button>
      )}

      {/* ── WakeLock toast (bottom, above nav) ── */}
      {wakeLockWarning && effectiveOnline && (
        <div
          className="fixed right-4 left-4 z-[1050] flex animate-[slideUp_0.3s_ease-out] items-center gap-2.5 rounded-2xl bg-amber-600 px-4 py-3 text-xs font-bold text-white shadow-lg"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
          role="alert"
        >
          <AlertTriangle size={14} className="flex-shrink-0" />
          <span className="flex-1">
            Screen may sleep — keep app open for uninterrupted deliveries.
          </span>
          <button
            onClick={onDismissWakeLock}
            className="flex-shrink-0 rounded-full bg-white/20 p-0.5"
            aria-label="Dismiss wake lock warning"
          >
            <X size={11} />
          </button>
        </div>
      )}
    </>
  );
}

interface CancelStats {
  dailyCancels: number;
  remaining: number;
  dailyLimit?: number | null;
  cancelRate?: number | null;
  penaltyAmount?: number;
}

interface IgnoreStats {
  dailyIgnores: number;
  remaining: number;
  dailyLimit?: number | null;
  penaltyAmount?: number;
}

interface InlineWarningsProps {
  gpsWarning: string | null;
  onDismissGps: () => void;
  isRestricted: boolean;
  riderNotice: string;
  riderNoticeDismissed: boolean;
  onDismissRiderNotice: () => void;
  cancelStatsData: CancelStats | null | undefined;
  ignoreStatsData: IgnoreStats | null | undefined;
  currency: string;
  minBalance: number;
  walletBalance: number;
}

export function InlineWarnings({
  gpsWarning,
  onDismissGps,
  isRestricted,
  riderNotice,
  riderNoticeDismissed,
  onDismissRiderNotice,
  cancelStatsData,
  ignoreStatsData,
  currency,
  minBalance,
  walletBalance,
}: InlineWarningsProps) {
  return (
    <>
      {gpsWarning && (
        <div className="flex animate-[slideUp_0.2s_ease-out] items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <AlertTriangle size={16} className="text-amber-500" />
          </div>
          <p className="flex-1 pt-1 text-xs leading-relaxed font-bold text-amber-700">
            {gpsWarning}
          </p>
          <button
            onClick={onDismissGps}
            className="rounded-lg p-1 text-amber-400 transition-colors hover:bg-amber-100 hover:text-amber-600"
            aria-label="Dismiss GPS warning"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {isRestricted && (
        <div className="flex animate-[slideUp_0.2s_ease-out] items-start gap-3 rounded-3xl border-2 border-red-300 bg-red-50 px-4 py-3.5 shadow-sm">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-red-100">
            <Ban size={18} className="text-red-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-extrabold text-red-800">Account Restricted</p>
            <p className="mt-0.5 text-xs leading-relaxed text-red-600">
              Your account has been restricted due to excessive cancellations or ignores. You cannot
              accept new rides. Contact support to resolve.
            </p>
          </div>
        </div>
      )}

      {riderNotice && !riderNoticeDismissed && (
        <div className="flex items-start gap-3 rounded-3xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100">
            <Pin size={14} className="text-blue-500" />
          </div>
          <p className="flex-1 pt-0.5 text-sm leading-relaxed font-medium text-blue-700">
            {riderNotice}
          </p>
          <button
            onClick={onDismissRiderNotice}
            className="mt-0.5 flex-shrink-0 text-blue-400 hover:text-blue-600"
            aria-label="Dismiss rider notice"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {cancelStatsData &&
        cancelStatsData.dailyCancels > 0 &&
        (() => {
          const atRisk = cancelStatsData.remaining <= 1;
          const cancelRate: number | null = cancelStatsData.cancelRate ?? null;
          return (
            <div
              className={`rounded-3xl border px-4 py-3.5 shadow-sm ${atRisk ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${atRisk ? "bg-red-100" : "bg-amber-100"}`}
                >
                  <XCircle size={18} className={atRisk ? "text-red-500" : "text-amber-500"} />
                </div>
                <div className="flex-1">
                  <p
                    className={`text-xs font-extrabold ${atRisk ? "text-red-800" : "text-amber-800"}`}
                  >
                    {cancelStatsData.dailyCancels} cancellation
                    {cancelStatsData.dailyCancels !== 1 ? "s" : ""} today
                    {cancelStatsData.remaining === 0
                      ? " — Limit Reached!"
                      : cancelStatsData.remaining === 1
                        ? " — 1 left before penalty!"
                        : ""}
                  </p>
                  {cancelStatsData.dailyLimit != null && (
                    <p className="mt-0.5 text-[10px] font-medium text-amber-600">
                      Limit: {cancelStatsData.dailyLimit}/day · {cancelStatsData.remaining}{" "}
                      remaining
                      {(cancelStatsData.penaltyAmount ?? 0) > 0 &&
                        ` · ${currency} ${Math.round(cancelStatsData.penaltyAmount ?? 0)} penalty per excess`}
                    </p>
                  )}
                </div>
              </div>
              {cancelRate != null && (
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 rounded-xl border border-amber-200/60 bg-white/70 px-2.5 py-1.5">
                    <span className="text-[10px] font-semibold text-gray-500">Cancel rate</span>
                    <span
                      className={`text-[10px] font-extrabold ${cancelRate > 20 ? "text-red-600" : "text-amber-700"}`}
                    >
                      {Math.round(cancelRate)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {ignoreStatsData &&
        ignoreStatsData.dailyIgnores > 0 &&
        (() => {
          const atRisk = ignoreStatsData.remaining <= 1;
          return (
            <div
              className={`rounded-3xl border px-4 py-3.5 shadow-sm ${atRisk ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${atRisk ? "bg-red-100" : "bg-amber-100"}`}
                >
                  <SkipForward size={18} className={atRisk ? "text-red-500" : "text-amber-500"} />
                </div>
                <div className="flex-1">
                  <p
                    className={`text-xs font-extrabold ${atRisk ? "text-red-800" : "text-amber-800"}`}
                  >
                    {ignoreStatsData.dailyIgnores} request
                    {ignoreStatsData.dailyIgnores !== 1 ? "s" : ""} ignored today
                    {ignoreStatsData.remaining === 0
                      ? " — Limit Reached!"
                      : ignoreStatsData.remaining === 1
                        ? " — 1 left before penalty!"
                        : ""}
                  </p>
                  {ignoreStatsData.dailyLimit != null && (
                    <p className="mt-0.5 text-[10px] font-medium text-amber-600">
                      Limit: {ignoreStatsData.dailyLimit}/day · {ignoreStatsData.remaining}{" "}
                      remaining
                      {(ignoreStatsData.penaltyAmount ?? 0) > 0 &&
                        ` · ${currency} ${Math.round(ignoreStatsData.penaltyAmount ?? 0)} penalty per excess`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {(() => {
        if (minBalance <= 0 || walletBalance >= minBalance) return null;
        const shortfall = minBalance - walletBalance;
        return (
          <Link href="/wallet">
            <div className="flex cursor-pointer items-start gap-3 rounded-3xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3.5 shadow-sm transition-transform active:scale-[0.98]">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-100">
                <AlertTriangle size={18} className="text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-extrabold text-amber-800">Low Wallet Balance</p>
                <p className="mt-0.5 text-xs leading-relaxed text-amber-700">
                  Minimum{" "}
                  <strong>
                    {currency} {Math.round(minBalance)}
                  </strong>{" "}
                  required for cash orders. Your balance:{" "}
                  <strong>
                    {currency} {Math.round(walletBalance)}
                  </strong>
                  .
                  {shortfall > 0 && (
                    <>
                      {" "}
                      Need {currency} {Math.round(shortfall)} more.
                    </>
                  )}
                </p>
                <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-amber-600">
                  Tap to deposit <ArrowUpRight size={10} />
                </p>
              </div>
            </div>
          </Link>
        );
      })()}
    </>
  );
}
