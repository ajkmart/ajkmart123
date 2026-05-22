import {
  Camera,
  CheckCircle,
  ChevronRight,
  MapPin,
  MapPinned,
  Package,
  Phone,
  RefreshCw,
  ShoppingCart,
  Truck,
  User,
  X,
} from "lucide-react";
import { type ChangeEvent, type RefObject } from "react";
import { SafeImage } from "../../components/ui/SafeImage";
import {
  CallButton,
  ChatButton,
  formatCurrency,
  MapErrorBoundary,
  NavButton,
  ORDER_STEP_ICONS,
  RideRouteMap,
  TurnByTurnPanel,
  type OrderItem,
} from "./ActiveHelpers";

function orderTypeGradient(type?: string | null): string {
  const t = (type || "").toLowerCase();
  if (t === "food") return "from-orange-500 via-red-500 to-pink-600";
  if (t === "pharmacy") return "from-teal-500 via-green-500 to-emerald-600";
  if (t === "grocery") return "from-lime-500 via-green-500 to-emerald-500";
  if (t === "mart") return "from-blue-500 via-indigo-500 to-violet-600";
  return "from-gray-700 via-gray-800 to-gray-900";
}

export function OrderTypeIcon({ type }: { type?: string | null }) {
  const t = (type || "").toLowerCase();
  if (t === "food") return <span className="text-xl">🍔</span>;
  if (t === "pharmacy") return <span className="text-xl">💊</span>;
  if (t === "grocery") return <span className="text-xl">🛒</span>;
  if (t === "mart") return <ShoppingCart size={20} className="text-white" />;
  return <Package size={20} className="text-white" />;
}

export interface ActiveOrderPanelProps {
  order: Record<string, unknown>;
  orderStep: number;
  ORDER_LABELS: string[];
  riderPos: { lat: number; lng: number } | null;
  currency: string;
  deliveryFeeConfig: unknown;
  riderEarningPct: number;
  updateOrderMut: {
    mutate: (args: { id: string; status: string; photoUrl?: string }) => void;
    isPending: boolean;
  };
  proofPhoto: string | null;
  proofFile: File | null;
  proofFileName: string;
  proofUploading: boolean;
  proofStagedForRetry?: boolean;
  setProofPhoto: (v: string | null) => void;
  setProofFile: (v: File | null) => void;
  setProofFileName: (v: string) => void;
  setShowNoPhotoWarning: (v: boolean) => void;
  photoInputRef: RefObject<HTMLInputElement | null>;
  handlePhotoCapture: (e: ChangeEvent<HTMLInputElement>) => void;
  handleMarkDelivered: (id: string, forceNoPhoto?: boolean) => void;
  setCancelTarget: (v: "order" | "ride") => void;
  setShowCancelConfirm: (v: boolean) => void;
  pressedBtn: string | null;
  setPressedBtn: (v: string | null) => void;
  T: (key: import("@workspace/i18n").TranslationKey) => string;
}

export function ActiveOrderPanel({
  order,
  orderStep,
  ORDER_LABELS,
  riderPos,
  currency,
  deliveryFeeConfig,
  riderEarningPct,
  updateOrderMut,
  proofPhoto,
  proofFile: _proofFile,
  proofFileName: _pFN,
  proofUploading,
  proofStagedForRetry = false,
  setProofPhoto,
  setProofFile,
  setProofFileName,
  setShowNoPhotoWarning,
  photoInputRef,
  handlePhotoCapture,
  handleMarkDelivered,
  setCancelTarget,
  setShowCancelConfirm,
  pressedBtn,
  setPressedBtn,
  T,
}: ActiveOrderPanelProps) {
  const id = order.id as string;
  const type = order.type as string | undefined;
  const status = order.status as string;

  const riderEarning = (() => {
    const df = deliveryFeeConfig;
    let fee: number;
    if (typeof df === "number") {
      fee = df;
    } else if (df && typeof df === "object") {
      const raw =
        (df as Record<string, unknown>)[type ?? ""] ?? (df as Record<string, unknown>).mart ?? 0;
      fee = typeof raw === "number" ? raw : parseFloat(String(raw)) || 0;
    } else {
      fee = parseFloat(String(df)) || 0;
    }
    return fee * (riderEarningPct / 100);
  })();

  return (
    <>
      {/* Order header card */}
      <div className="animate-[slideUp_0.4s_ease-out] overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-lg shadow-gray-200/50">
        <div
          className={`bg-gradient-to-r ${orderTypeGradient(type)} relative flex items-center gap-3 overflow-hidden px-4 py-4`}
        >
          <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-white/5" />
          <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/20 shadow-inner backdrop-blur-md">
            <OrderTypeIcon type={type} />
          </div>
          <div className="relative min-w-0 flex-1">
            <p className="text-lg font-black text-white capitalize">{type} Order</p>
            <p className="mt-0.5 font-mono text-xs text-white/70">#{id.slice(-6).toUpperCase()}</p>
          </div>
          <div className="relative text-right">
            <p className="text-xl font-black tracking-tight text-white">
              {formatCurrency(order.total as string | number, currency)}
            </p>
            <div className="mt-1 rounded-lg border border-white/10 bg-white/15 px-2.5 py-1 backdrop-blur-sm">
              <p className="text-[10px] font-bold text-white">
                You earn {formatCurrency(riderEarning, currency)}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 pt-5 pb-4">
          <div className="relative flex items-center justify-between">
            {ORDER_LABELS.map((label, i) => (
              <div key={i} className="z-10 flex flex-col items-center gap-2" style={{ flex: 1 }}>
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl border-2 transition-all duration-500 ${
                    i < orderStep
                      ? "border-green-500 bg-green-500 text-white shadow-lg shadow-green-200"
                      : i === orderStep
                        ? "border-gray-900 bg-gray-900 text-white shadow-lg ring-4 shadow-gray-300 ring-gray-200"
                        : "border-gray-200 bg-white text-gray-300"
                  }`}
                >
                  {i < orderStep ? <CheckCircle size={16} /> : ORDER_STEP_ICONS[i]}
                </div>
                <p
                  className={`max-w-[70px] text-center text-[10px] leading-tight font-bold ${
                    i <= orderStep ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  {label}
                </p>
              </div>
            ))}
          </div>
          <div className="relative mx-10 -mt-8 mb-6 h-1 rounded-full bg-gray-100">
            <div
              className="absolute top-0 left-0 h-full rounded-full bg-gray-900 transition-all duration-700 ease-out"
              style={{ width: `${orderStep === 0 ? 0 : orderStep === 1 ? 50 : 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Step 1 — Go to Store */}
      {status !== "picked_up" && status !== "out_for_delivery" && status !== "delivered" && (
        <div className="animate-[slideUp_0.5s_ease-out] overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-lg shadow-gray-200/50">
          <div className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
              <ShoppingCart size={14} className="text-white" />
            </div>
            <p className="text-sm font-black tracking-wide text-white uppercase">
              Step 1 — Go to Store
            </p>
          </div>
          <div className="space-y-3 p-4">
            <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 shadow-md shadow-orange-200">
                  <ShoppingCart size={18} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold tracking-wider text-orange-500 uppercase">
                    Vendor / Store
                  </p>
                  <p className="mt-0.5 text-base font-black text-gray-900">
                    {(order.vendorStoreName as string) || "Store"}
                  </p>
                  {!!order.vendorPhone && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                      <Phone size={10} /> {order.vendorPhone as string}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {Array.isArray(order.items) && (order.items as unknown[]).length > 0 && (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                  <Package size={11} /> Items to Collect ({(order.items as unknown[]).length})
                </p>
                <div className="space-y-2">
                  {(order.items as OrderItem[]).slice(0, 5).map((item, i) => (
                    <div
                      key={i}
                      className="flex justify-between rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-sm"
                    >
                      <span className="font-medium text-gray-700">
                        {item.name} <span className="text-gray-400">×{item.quantity}</span>
                      </span>
                      <span className="font-bold text-gray-800">
                        {formatCurrency(item.price * item.quantity, currency)}
                      </span>
                    </div>
                  ))}
                  {(order.items as unknown[]).length > 5 && (
                    <p className="mt-1 text-center text-xs font-medium text-gray-400">
                      +{(order.items as unknown[]).length - 5} {T("moreItems")}
                    </p>
                  )}
                </div>
              </div>
            )}

            {!!order.vendorAddress && (
              <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-200">
                    <MapPin size={18} className="text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold tracking-wider text-blue-500 uppercase">
                      Store Location
                    </p>
                    <p className="mt-0.5 text-sm font-bold break-words text-gray-900">
                      {order.vendorAddress as string}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <NavButton
                label={T("goToStore")}
                lat={order.vendorLat as number}
                lng={order.vendorLng as number}
                address={(order.vendorAddress || order.vendorStoreName) as string}
                color="orange"
              />
              {!!order.vendorPhone && (
                <CallButton
                  phone={order.vendorPhone as string}
                  label="Call Store"
                  name={order.vendorStoreName as string}
                />
              )}
            </div>

            {riderPos && order.vendorLat != null && order.vendorLng != null && (
              <MapErrorBoundary>
                <TurnByTurnPanel
                  fromLat={riderPos.lat}
                  fromLng={riderPos.lng}
                  toLat={order.vendorLat as number}
                  toLng={order.vendorLng as number}
                  label="Store"
                  riderLat={riderPos.lat}
                  riderLng={riderPos.lng}
                />
              </MapErrorBoundary>
            )}

            {order.vendorLat != null && order.vendorLng != null && riderPos && (
              <MapErrorBoundary fallbackMsg="Route map unavailable">
                <RideRouteMap
                  pickupLat={riderPos.lat}
                  pickupLng={riderPos.lng}
                  pickupLabel="Your Position"
                  dropLat={order.vendorLat as number}
                  dropLng={order.vendorLng as number}
                  dropLabel={(order.vendorAddress || order.vendorStoreName) as string}
                  riderLat={riderPos.lat}
                  riderLng={riderPos.lng}
                />
              </MapErrorBoundary>
            )}

            <button
              onClick={() => {
                updateOrderMut.mutate({ id, status: "picked_up" });
              }}
              disabled={updateOrderMut.isPending}
              onTouchStart={() => setPressedBtn("pickup")}
              onTouchEnd={() => setPressedBtn(null)}
              className={`flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gray-900 py-4 text-base font-black text-white shadow-lg transition-transform disabled:opacity-60 ${pressedBtn === "pickup" ? "scale-[0.97]" : ""}`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                <Package size={18} />
              </div>
              {T("pickUpOrder")}
              <ChevronRight size={16} className="ml-1" />
            </button>

            <button
              onClick={() => {
                setCancelTarget("order");
                setShowCancelConfirm(true);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-red-200 bg-red-50/50 py-3 text-sm font-bold text-red-500 transition-colors active:bg-red-100"
            >
              <X size={14} /> {T("cantPickUp")}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Deliver */}
      {(status === "picked_up" || status === "out_for_delivery") && (
        <div className="animate-[slideUp_0.5s_ease-out] overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-lg shadow-gray-200/50">
          <div className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
              <Truck size={14} className="text-white" />
            </div>
            <p className="text-sm font-black tracking-wide text-white uppercase">
              Step 2 — Deliver
            </p>
          </div>
          <div className="space-y-3 p-4">
            {!!order.customerName && (
              <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 px-4 py-3.5">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-200">
                  <User size={22} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold tracking-wider text-blue-500 uppercase">
                    Customer
                  </p>
                  <p className="text-base font-black text-gray-900">
                    {order.customerName as string}
                  </p>
                  {!!order.customerPhone && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                      <Phone size={10} /> {order.customerPhone as string}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-pink-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-pink-600 shadow-md shadow-red-200">
                  <MapPinned size={18} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold tracking-wider text-red-500 uppercase">
                    Delivery Address
                  </p>
                  <p className="mt-0.5 text-sm font-bold break-words text-gray-900">
                    {(order.deliveryAddress as string) || "Address not provided"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <NavButton
                label={T("navigateLabel")}
                lat={order.deliveryLat as number}
                lng={order.deliveryLng as number}
                address={order.deliveryAddress as string}
                color="blue"
              />
              <CallButton
                name={order.customerName as string}
                phone={order.customerPhone as string}
              />
              <ChatButton name={order.customerName as string} />
            </div>

            {riderPos && order.deliveryLat != null && order.deliveryLng != null && (
              <MapErrorBoundary>
                <TurnByTurnPanel
                  fromLat={riderPos.lat}
                  fromLng={riderPos.lng}
                  toLat={order.deliveryLat as number}
                  toLng={order.deliveryLng as number}
                  label="Customer"
                  riderLat={riderPos.lat}
                  riderLng={riderPos.lng}
                />
              </MapErrorBoundary>
            )}

            {order.deliveryLat != null && order.deliveryLng != null && riderPos && (
              <MapErrorBoundary fallbackMsg="Route map unavailable">
                <RideRouteMap
                  pickupLat={riderPos.lat}
                  pickupLng={riderPos.lng}
                  pickupLabel="Your Position"
                  dropLat={order.deliveryLat as number}
                  dropLng={order.deliveryLng as number}
                  dropLabel={order.deliveryAddress as string}
                  riderLat={riderPos.lat}
                  riderLng={riderPos.lng}
                />
              </MapErrorBoundary>
            )}

            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-extrabold text-blue-700">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100">
                  <Camera className="h-3.5 w-3.5 text-blue-600" />
                </div>
                {T("proofOfDelivery")} ({T("recommended")})
              </p>
              {proofPhoto ? (
                <div className="space-y-2.5">
                  <div className="relative h-44 overflow-hidden rounded-2xl bg-gray-100 shadow-inner">
                    <SafeImage
                      src={proofPhoto}
                      alt="Delivery proof"
                      className="h-full w-full object-cover"
                      loading="eager"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    <div className="absolute top-3 right-3">
                      <span className="flex items-center gap-1 rounded-full bg-green-500 px-3 py-1 text-[10px] font-bold text-white shadow-lg">
                        <CheckCircle size={10} /> {T("photoReady")}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setProofPhoto(null);
                      setProofFileName("");
                      setProofFile(null);
                      setShowNoPhotoWarning(false);
                      if (photoInputRef.current) photoInputRef.current.value = "";
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-blue-200 bg-white py-2.5 text-xs font-bold text-blue-600 transition-colors active:bg-blue-50"
                  >
                    <Camera size={12} /> {T("retakePhoto")}
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoCapture}
                  />
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed border-blue-300 bg-white py-5 text-blue-500 transition-all hover:bg-blue-50 active:scale-[0.98]"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
                      <Camera className="h-6 w-6 text-blue-500" />
                    </div>
                    <span className="text-sm font-bold">{T("takePhoto")}</span>
                    <span className="text-[10px] text-blue-400">{T("opensCamera")}</span>
                  </button>
                </div>
              )}
            </div>

            {proofStagedForRetry && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-800">
                <span className="mt-0.5 shrink-0 text-amber-500">⚠</span>
                <p className="text-xs leading-snug font-semibold">
                  Photo upload failed — your photo is held locally. Tap{" "}
                  <strong>Mark Delivered</strong> to retry the upload.
                </p>
              </div>
            )}

            <button
              onClick={() => handleMarkDelivered(id)}
              disabled={updateOrderMut.isPending || proofUploading}
              onTouchStart={() => setPressedBtn("deliver")}
              onTouchEnd={() => setPressedBtn(null)}
              className={`flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 py-4 text-lg font-black text-white shadow-lg shadow-green-200 transition-transform disabled:opacity-60 ${pressedBtn === "deliver" ? "scale-[0.97]" : ""}`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                {proofUploading ? (
                  <RefreshCw size={18} className="animate-spin" />
                ) : (
                  <CheckCircle size={20} />
                )}
              </div>
              {proofUploading
                ? T("uploadingPhoto")
                : updateOrderMut.isPending
                  ? T("updating")
                  : proofPhoto
                    ? T("confirmDeliveryWithProof")
                    : T("markDelivered")}
            </button>

            <div>
              <div className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border-2 border-gray-100 bg-gray-50 py-3 text-sm font-bold text-gray-400">
                <ChevronRight size={14} className="rotate-180" /> {T("backToStoreStep")}
              </div>
              <p className="mt-1 text-center text-[10px] text-gray-400">
                Cannot go back — server already recorded pickup. Contact support if needed.
              </p>
            </div>

            <button
              onClick={() => {
                setCancelTarget("order");
                setShowCancelConfirm(true);
              }}
              disabled={updateOrderMut.isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-red-200 bg-red-50/50 py-3 text-sm font-bold text-red-500 transition-colors active:bg-red-100 disabled:opacity-60"
            >
              <X size={14} /> {T("cannotDeliverCancel")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
