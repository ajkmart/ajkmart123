import { ArrowDown, Bike, Car, CheckCircle, MapPin, Shield, User, X } from "lucide-react";
import {
  CallButton,
  ChatButton,
  EstimatedArrivalBadge,
  formatCurrency,
  MapErrorBoundary,
  NavButton,
  RIDE_STEP_ICONS,
  RIDE_STEPS,
  RideRouteMap,
  SosButton,
  TurnByTurnPanel,
} from "./ActiveHelpers";

export interface ActiveRidePanelProps {
  ride: Record<string, unknown>;
  rideStep: number;
  RIDE_LABELS: string[];
  riderPos: { lat: number; lng: number } | null;
  currency: string;
  riderEarningPct: number;
  config: {
    rides?: { riderEarningPct?: number };
    finance: { riderEarningPct?: number };
    features?: { sos?: boolean };
  };
  updateRideMut: {
    mutate: (args: { id: string; status: string; lat?: number; lng?: number }) => void;
    isPending: boolean;
  };
  setShowOtpModal: (v: boolean) => void;
  setOtpInput: (v: string) => void;
  setCancelTarget: (v: "order" | "ride") => void;
  setShowCancelConfirm: (v: boolean) => void;
  pressedBtn: string | null;
  setPressedBtn: (v: string | null) => void;
  showToast: (msg: string, isError?: boolean) => void;
  T: (key: import("@workspace/i18n").TranslationKey) => string;
}

export function ActiveRidePanel({
  ride,
  rideStep,
  RIDE_LABELS,
  riderPos,
  currency,
  riderEarningPct,
  config,
  updateRideMut,
  setShowOtpModal,
  setOtpInput,
  setCancelTarget,
  setShowCancelConfirm,
  pressedBtn,
  setPressedBtn,
  showToast,
  T,
}: ActiveRidePanelProps) {
  const id = ride.id as string;
  const type = ride.type as string | undefined;
  const status = ride.status as string;
  const riderEarning = parseFloat(String(ride.fare ?? 0)) * (riderEarningPct / 100);

  return (
    <div className="animate-[slideUp_0.4s_ease-out] overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-lg shadow-gray-200/50">
      <div className="relative flex items-center gap-3 overflow-hidden bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-700 px-4 py-4">
        <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-white/5" />
        <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/20 shadow-inner backdrop-blur-md">
          {type === "bike" ? (
            <Bike size={22} className="text-white" />
          ) : (
            <Car size={22} className="text-white" />
          )}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-black text-white capitalize">{type} Ride</p>
            {(ride as { isPoolRide?: boolean }).isPoolRide && (
              <span className="flex items-center gap-1 rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                </svg>
                POOL
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-xs text-purple-200">
            #{id.slice(-6).toUpperCase()} · {String(ride.distance ?? "")}km
          </p>
        </div>
        <div className="relative text-right">
          <p className="text-xl font-black tracking-tight text-white">
            {formatCurrency(ride.fare as number, currency)}
          </p>
          <div className="mt-1 rounded-lg border border-white/10 bg-white/15 px-2.5 py-1 backdrop-blur-sm">
            <p className="text-[10px] font-bold text-white">
              You earn {formatCurrency(riderEarning, currency)}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {rideStep >= 0 && (
          <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-purple-50/30 p-5">
            <div className="relative mb-5 flex justify-between">
              {RIDE_LABELS.map((label, i) => (
                <div key={i} className="z-10 flex flex-col items-center gap-2" style={{ flex: 1 }}>
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl border-2 transition-all duration-500 ${
                      i < rideStep
                        ? "border-green-500 bg-green-500 text-white shadow-lg shadow-green-200"
                        : i === rideStep
                          ? "border-gray-900 bg-gray-900 text-white shadow-lg ring-4 shadow-gray-300 ring-gray-200"
                          : "border-gray-200 bg-white text-gray-300"
                    }`}
                  >
                    {i < rideStep ? <CheckCircle size={14} /> : RIDE_STEP_ICONS[i]}
                  </div>
                  <p
                    className={`max-w-[60px] text-center text-[9px] font-bold ${i <= rideStep ? "text-gray-900" : "text-gray-400"}`}
                  >
                    {label}
                  </p>
                </div>
              ))}
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className="absolute top-0 left-0 h-full rounded-full bg-gray-900 transition-all duration-700 ease-out"
                style={{
                  width: `${rideStep < 0 ? 0 : (rideStep / (RIDE_STEPS.length - 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="relative">
          <div className="rounded-2xl border border-green-100 bg-gradient-to-br from-green-50 to-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-md shadow-green-200">
                <MapPin size={18} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-wider text-green-600 uppercase">
                  Pickup
                </p>
                <p className="mt-0.5 text-sm font-bold text-gray-800">
                  {ride.pickupAddress as string}
                </p>
              </div>
            </div>
          </div>
          <div className="relative z-10 -my-1.5 flex justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-gray-200 bg-white shadow-sm">
              <ArrowDown size={14} className="text-gray-400" />
            </div>
          </div>
          <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-pink-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-pink-600 shadow-md shadow-red-200">
                <MapPin size={18} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-wider text-red-600 uppercase">
                  Drop-off
                </p>
                <p className="mt-0.5 text-sm font-bold text-gray-800">
                  {ride.dropAddress as string}
                </p>
              </div>
            </div>
          </div>
        </div>

        {!!ride.customerName && (
          <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 px-4 py-3.5">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-200">
              <User size={22} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold tracking-wider text-blue-500 uppercase">
                Passenger
              </p>
              <p className="text-base font-black text-gray-900">{ride.customerName as string}</p>
              {!!ride.customerPhone && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.36 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 17z" />
                  </svg>
                  {ride.customerPhone as string}
                </p>
              )}
            </div>
          </div>
        )}

        {status === "accepted" && (
          <EstimatedArrivalBadge
            riderPos={riderPos}
            pickupLat={ride.pickupLat as number}
            pickupLng={ride.pickupLng as number}
            vehicleType={type}
          />
        )}

        <div className="grid grid-cols-3 gap-2">
          {status === "accepted" ? (
            <NavButton
              label="Go to Pickup"
              lat={ride.pickupLat as number}
              lng={ride.pickupLng as number}
              address={ride.pickupAddress as string}
              color="orange"
            />
          ) : (
            <NavButton
              label="Go to Drop"
              lat={ride.dropLat as number}
              lng={ride.dropLng as number}
              address={ride.dropAddress as string}
              color="blue"
            />
          )}
          <CallButton name={ride.customerName as string} phone={ride.customerPhone as string} />
          <ChatButton name={ride.customerName as string} />
        </div>

        {riderPos && status === "accepted" && ride.pickupLat != null && ride.pickupLng != null && (
          <MapErrorBoundary>
            <TurnByTurnPanel
              fromLat={riderPos.lat}
              fromLng={riderPos.lng}
              toLat={ride.pickupLat as number}
              toLng={ride.pickupLng as number}
              label="Pickup"
              riderLat={riderPos.lat}
              riderLng={riderPos.lng}
            />
          </MapErrorBoundary>
        )}
        {riderPos &&
          (status === "arrived" || status === "in_transit") &&
          ride.dropLat != null &&
          ride.dropLng != null && (
            <MapErrorBoundary>
              <TurnByTurnPanel
                fromLat={riderPos.lat}
                fromLng={riderPos.lng}
                toLat={ride.dropLat as number}
                toLng={ride.dropLng as number}
                label="Drop-off"
                riderLat={riderPos.lat}
                riderLng={riderPos.lng}
              />
            </MapErrorBoundary>
          )}

        {ride.pickupLat != null &&
          ride.pickupLng != null &&
          ride.dropLat != null &&
          ride.dropLng != null && (
            <MapErrorBoundary fallbackMsg="Route map unavailable">
              <RideRouteMap
                pickupLat={ride.pickupLat as number}
                pickupLng={ride.pickupLng as number}
                pickupLabel={ride.pickupAddress as string}
                dropLat={ride.dropLat as number}
                dropLng={ride.dropLng as number}
                dropLabel={ride.dropAddress as string}
                riderLat={riderPos?.lat}
                riderLng={riderPos?.lng}
              />
            </MapErrorBoundary>
          )}

        {config.features?.sos !== false &&
          (status === "accepted" || status === "arrived" || status === "in_transit") && (
            <div className="flex justify-end">
              <SosButton
                rideId={id}
                riderPos={riderPos}
                T={T as (key: import("@workspace/i18n").TranslationKey) => string}
                showToast={showToast}
              />
            </div>
          )}

        <div className="flex gap-2 pt-1">
          {status === "accepted" && (
            <button
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    (pos) =>
                      updateRideMut.mutate({
                        id,
                        status: "arrived",
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                      }),
                    () => updateRideMut.mutate({ id, status: "arrived" }),
                    { enableHighAccuracy: true, timeout: 5000 }
                  );
                } else {
                  updateRideMut.mutate({ id, status: "arrived" });
                }
              }}
              disabled={updateRideMut.isPending}
              onTouchStart={() => setPressedBtn("arrived")}
              onTouchEnd={() => setPressedBtn(null)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gray-900 py-4 font-black text-white shadow-lg transition-transform disabled:opacity-60 ${pressedBtn === "arrived" ? "scale-[0.97]" : ""}`}
            >
              <MapPin size={16} /> {T("arrivedAtPickup")}
            </button>
          )}
          {["arrived", "accepted"].includes(status) &&
            !(ride as { otpVerified?: boolean }).otpVerified && (
              <button
                onClick={() => {
                  setOtpInput("");
                  setShowOtpModal(true);
                }}
                disabled={updateRideMut.isPending}
                onTouchStart={() => setPressedBtn("otp")}
                onTouchEnd={() => setPressedBtn(null)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-black text-white shadow-lg shadow-blue-200 transition-transform disabled:opacity-60 ${pressedBtn === "otp" ? "scale-[0.97]" : ""}`}
              >
                <Shield size={16} /> Verify OTP to Start
              </button>
            )}
          {status === "arrived" && (ride as { otpVerified?: boolean }).otpVerified && (
            <button
              onClick={() => updateRideMut.mutate({ id, status: "in_transit" })}
              disabled={updateRideMut.isPending}
              onTouchStart={() => setPressedBtn("start")}
              onTouchEnd={() => setPressedBtn(null)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gray-900 py-4 font-black text-white shadow-lg transition-transform disabled:opacity-60 ${pressedBtn === "start" ? "scale-[0.97]" : ""}`}
            >
              <Car size={16} /> {T("startRide")}
            </button>
          )}
          {status === "in_transit" && (
            <button
              onClick={() => updateRideMut.mutate({ id, status: "completed" })}
              disabled={updateRideMut.isPending}
              onTouchStart={() => setPressedBtn("complete")}
              onTouchEnd={() => setPressedBtn(null)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 py-4 font-black text-white shadow-lg shadow-green-200 transition-transform disabled:opacity-60 ${pressedBtn === "complete" ? "scale-[0.97]" : ""}`}
            >
              <CheckCircle size={16} /> {T("completeRide")}
            </button>
          )}
          {(status === "accepted" || status === "arrived" || status === "in_transit") && (
            <button
              onClick={() => {
                setCancelTarget("ride");
                setShowCancelConfirm(true);
              }}
              disabled={updateRideMut.isPending}
              className="rounded-2xl border-2 border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-600 transition-colors active:bg-red-100"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
