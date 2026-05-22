import type { TranslationKey } from "@workspace/i18n";
import {
  CheckCircle,
  Clock,
  MapPin,
  MessageSquare,
  Navigation,
  SkipForward,
  X,
  Zap,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import type { Ride } from "../../lib/api";
import type { PlatformConfig } from "../../lib/useConfig";
import { AcceptCountdown } from "./AcceptCountdown";
import { RideTypeIcon } from "./Icons";
import { MiniMap } from "./MiniMap";
import { RequestAge } from "./RequestAge";
import {
  ACCEPT_TIMEOUT_SEC,
  buildMapsDeepLink,
  formatCurrency,
  PRICING_DEFAULTS,
  SVC_NAMES,
} from "./helpers";

interface RideRequestCardProps {
  ride: Ride;
  userId: string;
  isRestricted: boolean;
  config: PlatformConfig;
  currency: string;
  onAccept: (id: string) => void;
  onCounter: (id: string, counterFare: number) => void;
  onRejectOffer: (id: string) => void;
  onIgnore: (id: string) => void;
  onDismiss: (id: string) => void;
  acceptPending: boolean;
  counterPending: boolean;
  rejectOfferPending: boolean;
  ignorePending: boolean;
  anyAcceptPending: boolean;
  /** ISO timestamp from server response envelope for clock-offset correction */
  serverTime?: string | null;
  T: (key: TranslationKey) => string;
}

export const RideRequestCard = memo(function RideRequestCard({
  ride: r,
  userId,
  isRestricted,
  config,
  currency,
  onAccept,
  onCounter,
  onRejectOffer,
  onIgnore,
  onDismiss,
  acceptPending,
  counterPending,
  rejectOfferPending,
  ignorePending,
  anyAcceptPending,
  serverTime,
  T,
}: RideRequestCardProps) {
  const [counterInput, setCounterInput] = useState("");
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterError, setCounterError] = useState("");
  const [localBidPending, setLocalBidPending] = useState(false);

  /* Clear local pending flag once the server confirms via r.myBid */
  useEffect(() => {
    if (r.myBid && localBidPending) setLocalBidPending(false);
  }, [r.myBid, localBidPending]);

  const acceptTimeoutSec =
    config.rides.acceptTimeoutSec ?? config.dispatch?.broadcastTimeoutSec ?? ACCEPT_TIMEOUT_SEC;

  const isBargain = r.status === "bargaining" && r.offeredFare != null;
  const isDispatched = r.dispatchedRiderId === userId;
  const offeredFare = r.offeredFare ?? r.fare;
  const effectiveFare = isBargain ? offeredFare : r.fare;
  const rideExpired = (Date.now() - new Date(r.createdAt).getTime()) / 1000 >= acceptTimeoutSec;

  const riderEarningPct = config.finance.riderEarningPct ?? PRICING_DEFAULTS.defaultRiderEarningPct;
  const earnings = effectiveFare != null ? Number(effectiveFare) * (riderEarningPct / 100) : null;

  const svcName = SVC_NAMES[r.type ?? ""] ?? r.type?.replace(/_/g, " ") ?? "Ride";
  const rideDistKm = r.distance != null ? parseFloat(String(r.distance)) : null;
  const etaMin =
    rideDistKm != null && rideDistKm > 0 ? Math.max(1, Math.round((rideDistKm / 30) * 60)) : null;

  /* Map link — prefer drop coords, fall back to pickup, then address */
  const mapsUrl = buildMapsDeepLink(
    r.dropLat != null ? parseFloat(String(r.dropLat)) : null,
    r.dropLng != null ? parseFloat(String(r.dropLng)) : null,
    r.dropAddress ?? r.pickupAddress ?? null
  );

  const getMinFare = () => {
    const vt = r.vehicleType as string | undefined;
    if (vt === "car") return config.rides.carMinFare ?? PRICING_DEFAULTS.carMinFare;
    if (vt === "rickshaw") return config.rides.rickshawMinFare ?? PRICING_DEFAULTS.rickshawMinFare;
    if (vt === "daba") return config.rides.dabaMinFare ?? PRICING_DEFAULTS.dabaMinFare;
    return config.rides.bikeMinFare ?? PRICING_DEFAULTS.bikeMinFare;
  };

  const getMaxFare = () => {
    const maxMult = config.rides.counterMaxMultiplier ?? PRICING_DEFAULTS.counterMaxMultiplier;
    return Number(r.offeredFare ?? r.fare ?? 0) * maxMult;
  };

  const validateAndSubmitCounter = () => {
    if (localBidPending || counterPending) return;
    const v = Number(counterInput || 0);
    const minFare = getMinFare();
    const maxFare = getMaxFare();
    if (!v || v < minFare) {
      setCounterError(`Minimum fare is ${formatCurrency(minFare, currency)}`);
      return;
    }
    if (v > maxFare) {
      setCounterError(`Cannot exceed ${formatCurrency(maxFare, currency)}`);
      return;
    }
    setCounterError("");
    setLocalBidPending(true);
    onCounter(r.id, v);
    setCounterInput("");
    setShowCounterForm(false);
  };

  const pickupLat = r.pickupLat != null ? parseFloat(String(r.pickupLat)) : null;
  const pickupLng = r.pickupLng != null ? parseFloat(String(r.pickupLng)) : null;
  const dropLat = r.dropLat != null ? parseFloat(String(r.dropLat)) : null;
  const dropLng = r.dropLng != null ? parseFloat(String(r.dropLng)) : null;
  const hasValidPickupCoords =
    pickupLat != null &&
    Number.isFinite(pickupLat) &&
    pickupLng != null &&
    Number.isFinite(pickupLng);

  return (
    <div
      className={`animate-[slideUp_0.3s_ease-out] p-4 ${
        isDispatched
          ? "border-l-4 border-blue-500 bg-gradient-to-r from-blue-50/50 to-white"
          : isBargain
            ? "border-l-4 border-orange-400 bg-gradient-to-r from-orange-50/50 to-white"
            : "hover:bg-gray-50/50"
      } transition-colors`}
    >
      <div className="flex items-start gap-3">
        <AcceptCountdown
          createdAt={r.createdAt}
          serverTime={serverTime}
          onExpired={() => onDismiss(r.id)}
          timeoutSec={acceptTimeoutSec}
        />
        <div
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border shadow-sm ${
            isDispatched
              ? "border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50"
              : isBargain
                ? "border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50"
                : "border-green-100 bg-gradient-to-br from-green-50 to-emerald-50"
          }`}
        >
          {isBargain ? (
            <MessageSquare size={20} className="text-orange-500" />
          ) : (
            <RideTypeIcon type={r.type ?? ""} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-extrabold tracking-tight text-gray-900">
              {svcName} Ride
            </p>
            {isDispatched && (
              <span className="flex animate-pulse items-center gap-1 rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                <Zap size={8} /> DISPATCHED
              </span>
            )}
            {isBargain && (
              <span className="flex animate-pulse items-center gap-1 rounded-full border border-orange-200 bg-gradient-to-r from-orange-100 to-amber-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                <MessageSquare size={8} /> BARGAIN
              </span>
            )}
            {isBargain && r.myBid && (
              <span className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                <CheckCircle size={8} /> Bid Sent
              </span>
            )}
            {r.isParcel && (
              <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                📦 Parcel
              </span>
            )}
            {r.isPoolRide && (
              <span className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                👥 Pool
              </span>
            )}
            <RequestAge createdAt={r.createdAt} />
          </div>
          {(r.riderDistanceKm != null || r.riderEtaMin != null) && (
            <div className="mt-1 mb-1 flex items-center gap-2">
              {r.riderDistanceKm != null && (
                <span className="flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                  <Navigation size={9} />{" "}
                  {r.riderDistanceKm < 1
                    ? `${Math.round(r.riderDistanceKm * 1000)}m`
                    : `${r.riderDistanceKm} km`}{" "}
                  away
                </span>
              )}
              {r.riderEtaMin != null && (
                <span className="flex items-center gap-1 rounded-full border border-purple-100 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-600">
                  <Clock size={9} /> {r.riderEtaMin} min ETA
                </span>
              )}
            </div>
          )}
          <div className="mt-1 space-y-1">
            <p className="flex items-center gap-1.5 truncate text-xs text-gray-600">
              <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-green-500 shadow-sm shadow-green-500/30" />
              {r.pickupAddress || "Pickup location"}
            </p>
            <p className="flex items-center gap-1.5 truncate text-xs text-gray-400">
              <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-red-500 shadow-sm shadow-red-500/30" />
              {r.dropAddress || "Drop-off location"}
            </p>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            {earnings != null && earnings > 0 ? (
              <div
                className={`rounded-xl border px-3 py-1.5 ${isBargain ? "border-orange-100 bg-orange-50" : "border-green-100 bg-green-50"}`}
              >
                <p
                  className={`text-base leading-tight font-extrabold ${isBargain ? "text-orange-600" : "text-green-600"}`}
                >
                  +{formatCurrency(earnings, currency)}
                </p>
                <p className="text-[9px] font-semibold text-gray-400">{T("yourEarnings")}</p>
              </div>
            ) : null}
            {isBargain && offeredFare != null && (
              <div>
                <p className="text-sm font-bold text-orange-700">
                  {formatCurrency(offeredFare, currency)}
                </p>
                <p className="text-[9px] font-medium text-gray-400">{T("customerOffer")}</p>
              </div>
            )}
            {rideDistKm != null && rideDistKm > 0 && (
              <div>
                <p className="text-sm font-bold text-gray-700">{rideDistKm.toFixed(1)} km</p>
                <p className="text-[9px] font-medium text-gray-400">{T("distance")}</p>
              </div>
            )}
            {etaMin != null && (
              <div>
                <p className="text-sm font-bold text-blue-600">{etaMin} min</p>
                <p className="text-[9px] font-medium text-gray-400">ETA</p>
              </div>
            )}
            {r.fare != null && (
              <div>
                <p className="text-sm font-bold text-gray-300 line-through">
                  {formatCurrency(r.fare, currency)}
                </p>
                <p className="text-[9px] font-medium text-gray-400">{T("platformFare")}</p>
              </div>
            )}
          </div>
          {r.bargainNote && (
            <div className="mt-2 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs text-orange-700 italic">
                <MessageSquare size={11} className="flex-shrink-0" /> "{r.bargainNote}"
              </p>
            </div>
          )}
        </div>
      </div>

      {hasValidPickupCoords && (
        <MiniMap pickupLat={pickupLat} pickupLng={pickupLng} dropLat={dropLat} dropLng={dropLng} />
      )}

      {!isBargain && (
        <div className="mt-3 flex gap-2">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open pickup location in maps"
            className="flex min-h-[44px] items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100"
          >
            <MapPin size={14} />
          </a>
          {isDispatched ? (
            <button
              onClick={() => onIgnore(r.id)}
              disabled={ignorePending || acceptPending || anyAcceptPending}
              className="flex min-h-[44px] items-center gap-1 rounded-xl border border-amber-300 px-3 py-2.5 text-sm font-bold text-amber-600 transition-colors hover:bg-amber-50 disabled:opacity-60"
              aria-label="Ignore dispatched ride"
            >
              <SkipForward size={14} /> Ignore
            </button>
          ) : (
            <button
              onClick={() => onDismiss(r.id)}
              className="flex min-h-[44px] items-center rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-bold text-gray-400 transition-colors hover:bg-gray-50"
              aria-label="Dismiss ride request"
            >
              <X size={16} />
            </button>
          )}
          <button
            onClick={() => onAccept(r.id)}
            disabled={
              rideExpired || acceptPending || anyAcceptPending || ignorePending || !!isRestricted
            }
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-900 py-2.5 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60"
            aria-label="Accept ride"
          >
            <CheckCircle size={15} />
            {acceptPending ? T("accepting") : T("acceptRide")}
          </button>
        </div>
      )}

      {isBargain && (
        <div className="mt-3 space-y-2">
          {localBidPending && !r.myBid ? (
            <div className="flex items-center gap-3 rounded-xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 p-3.5">
              <div className="h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
              <div className="flex-1">
                <p className="text-xs font-bold text-indigo-700">
                  Bid Submitted — Waiting for Response
                </p>
                <p className="mt-0.5 text-[10px] text-indigo-500">
                  Your counter offer is being sent to the customer…
                </p>
              </div>
              <span className="animate-pulse rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-1 text-[10px] font-bold text-indigo-600">
                PENDING
              </span>
            </div>
          ) : r.myBid ? (
            <div className="space-y-2.5 rounded-xl border-2 border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-1 text-xs font-bold text-orange-700">
                    <MessageSquare size={11} /> Your Bid Pending
                  </p>
                  <p className="text-lg font-extrabold text-orange-600">
                    {formatCurrency(r.myBid.fare, currency)}
                  </p>
                </div>
                <span className="animate-pulse rounded-full border border-orange-200 bg-orange-100 px-2.5 py-1 text-[10px] font-bold text-orange-600">
                  WAITING
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={counterInput}
                  onChange={(e) => {
                    setCounterInput(e.target.value);
                    if (counterError) setCounterError("");
                  }}
                  placeholder="Update bid..."
                  className={`h-10 flex-1 rounded-xl border bg-white px-3 text-sm focus:ring-2 focus:outline-none ${counterError ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-orange-200 focus:border-orange-400 focus:ring-orange-100"}`}
                  aria-label="Update counter fare amount"
                />
                <button
                  onClick={validateAndSubmitCounter}
                  disabled={counterPending || rideExpired || !!isRestricted}
                  className="min-h-[44px] rounded-xl bg-orange-500 px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
                  aria-label="Update counter bid"
                >
                  Update
                </button>
                <button
                  onClick={() => onAccept(r.id)}
                  disabled={rideExpired || acceptPending || anyAcceptPending || !!isRestricted}
                  className="flex min-h-[44px] items-center gap-1 rounded-xl bg-gray-900 px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-gray-800 disabled:opacity-60"
                  aria-label="Accept ride at current fare"
                >
                  <CheckCircle size={13} /> Accept
                </button>
              </div>
              {counterError && <p className="text-xs font-semibold text-red-500">{counterError}</p>}
            </div>
          ) : showCounterForm ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={counterInput}
                  onChange={(e) => {
                    setCounterInput(e.target.value);
                    if (counterError) setCounterError("");
                  }}
                  placeholder="Your counter fare..."
                  className={`h-11 flex-1 rounded-xl border bg-gray-50 px-4 text-sm focus:ring-2 focus:outline-none ${counterError ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-orange-400 focus:ring-orange-100"}`}
                  aria-label="Enter counter fare amount"
                />
                <button
                  onClick={validateAndSubmitCounter}
                  disabled={counterPending || rideExpired || !!isRestricted}
                  className="min-h-[44px] rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
                  aria-label="Submit counter offer"
                >
                  {counterPending ? "..." : "Submit"}
                </button>
                <button
                  onClick={() => {
                    setShowCounterForm(false);
                    setCounterError("");
                  }}
                  className="flex min-h-[44px] items-center rounded-xl bg-gray-100 px-3 py-2.5 text-gray-400 transition-colors hover:bg-gray-200"
                  aria-label="Cancel counter offer"
                >
                  <X size={15} />
                </button>
              </div>
              {counterError && (
                <p className="px-1 text-xs font-semibold text-red-500">{counterError}</p>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open location in maps"
                className="flex min-h-[44px] items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100"
              >
                <MapPin size={14} />
              </a>
              <button
                onClick={() => onRejectOffer(r.id)}
                disabled={rejectOfferPending}
                className="flex min-h-[44px] items-center rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-bold text-gray-400 transition-colors hover:bg-gray-200 disabled:opacity-50"
                aria-label="Reject ride offer"
              >
                <X size={16} />
              </button>
              <button
                onClick={() => setShowCounterForm(true)}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-100 to-amber-100 py-2.5 text-sm font-extrabold text-orange-700 transition-all hover:from-orange-200 hover:to-amber-200 active:scale-[0.98]"
                aria-label="Make counter offer"
              >
                <MessageSquare size={14} /> Counter Offer
              </button>
              <button
                onClick={() => onAccept(r.id)}
                disabled={rideExpired || acceptPending || anyAcceptPending || !!isRestricted}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-900 py-2.5 text-sm font-extrabold text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-60"
                aria-label="Accept ride"
              >
                <CheckCircle size={14} />
                Accept
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
