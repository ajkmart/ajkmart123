import type { TranslationKey } from "@workspace/i18n";
import { CheckCircle, MapPin, Navigation, X, XCircle } from "lucide-react";
import { memo } from "react";
import type { Order } from "../../lib/api";
import type { PlatformConfig } from "../../lib/useConfig";
import { AcceptCountdown } from "./AcceptCountdown";
import { OrderTypeIcon } from "./Icons";
import { MiniMap } from "./MiniMap";
import { RequestAge } from "./RequestAge";
import { ACCEPT_TIMEOUT_SEC, buildMapsDeepLink, formatCurrency, PRICING_DEFAULTS } from "./helpers";

interface OrderRequestCardProps {
  order: Order;
  earnings: number;
  currency: string;
  config?: PlatformConfig;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onDismiss: (id: string) => void;
  acceptPending: boolean;
  rejectPending: boolean;
  anyAcceptPending: boolean;
  /** ISO timestamp from the server response envelope for clock-offset correction */
  serverTime?: string | null;
  T: (key: TranslationKey) => string;
}

export const OrderRequestCard = memo(function OrderRequestCard({
  order: o,
  earnings,
  currency,
  config,
  onAccept,
  onReject,
  onDismiss,
  acceptPending,
  rejectPending,
  anyAcceptPending,
  serverTime,
  T,
}: OrderRequestCardProps) {
  const acceptTimeoutSec =
    config?.rides?.acceptTimeoutSec ?? config?.dispatch?.broadcastTimeoutSec ?? ACCEPT_TIMEOUT_SEC;

  const isExpired = (Date.now() - new Date(o.createdAt).getTime()) / 1000 >= acceptTimeoutSec;

  const orderType = o.type ?? "delivery";
  const orderTotal =
    typeof o.total === "number"
      ? o.total
      : typeof o.total === "string"
        ? parseFloat(o.total)
        : null;
  const itemCount = o.itemCount ?? o.item_count ?? null;
  const distanceKm = o.distanceKm ?? o.distance_km ?? null;
  const deliveryAddress = o.deliveryAddress ?? o.delivery_address ?? null;
  const vendorStoreName = o.vendorStoreName ?? o.vendor_store_name ?? null;
  const configDeliveryFee = (() => {
    if (!config?.deliveryFee) return PRICING_DEFAULTS.defaultDeliveryFee;
    if (orderType === "food") return config.deliveryFee.food ?? PRICING_DEFAULTS.defaultDeliveryFee;
    if (orderType === "pharmacy")
      return config.deliveryFee.pharmacy ?? PRICING_DEFAULTS.defaultDeliveryFee;
    if (orderType === "parcel")
      return config.deliveryFee.parcel ?? PRICING_DEFAULTS.defaultDeliveryFee;
    return config.deliveryFee.mart ?? PRICING_DEFAULTS.defaultDeliveryFee;
  })();
  const deliveryFee =
    typeof earnings === "number" && Number.isFinite(earnings) ? earnings : configDeliveryFee;

  /* Coordinates — parse safely */
  const vendorLat = o.vendorLat != null ? parseFloat(String(o.vendorLat)) : null;
  const vendorLng = o.vendorLng != null ? parseFloat(String(o.vendorLng)) : null;
  const deliveryLat = o.deliveryLat != null ? parseFloat(String(o.deliveryLat)) : null;
  const deliveryLng = o.deliveryLng != null ? parseFloat(String(o.deliveryLng)) : null;
  const hasValidVendorCoords =
    vendorLat != null &&
    Number.isFinite(vendorLat) &&
    vendorLng != null &&
    Number.isFinite(vendorLng);

  return (
    <div className="animate-[slideUp_0.3s_ease-out] border-b border-gray-50 p-4 last:border-0">
      <div className="flex items-start gap-3">
        <AcceptCountdown
          createdAt={o.createdAt}
          serverTime={serverTime}
          onExpired={() => onDismiss(o.id)}
          timeoutSec={acceptTimeoutSec}
        />
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm">
          <OrderTypeIcon type={orderType} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-extrabold tracking-tight text-gray-900 capitalize">
              {orderType} Delivery
            </p>
            <RequestAge createdAt={o.createdAt} />
          </div>
          {vendorStoreName ? (
            <p className="flex items-center gap-1 truncate text-xs font-semibold text-blue-600">
              <MapPin size={10} /> {vendorStoreName}
            </p>
          ) : null}
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-400">
            <Navigation size={10} className="text-gray-300" /> {deliveryAddress || "Destination"}
          </p>
        </div>
        {deliveryFee > 0 ? (
          <div className="flex-shrink-0 rounded-2xl bg-green-500 px-3 py-1.5 text-right text-white shadow-sm shadow-green-200">
            <p className="text-base leading-tight font-extrabold">
              +{formatCurrency(deliveryFee, currency)}
            </p>
            <p className="text-[9px] font-semibold text-green-100">{T("yourEarnings")}</p>
          </div>
        ) : (
          <div className="flex-shrink-0 rounded-2xl bg-gray-100 px-3 py-1.5 text-right text-gray-400">
            <p className="text-sm leading-tight font-bold">—</p>
            <p className="text-[9px] font-semibold">{T("yourEarnings")}</p>
          </div>
        )}
      </div>

      {(orderTotal != null || itemCount != null || distanceKm != null) && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {orderTotal != null && Number.isFinite(orderTotal) && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-2.5 py-1">
              <p className="text-xs font-bold text-gray-700">
                {formatCurrency(orderTotal, currency)}
              </p>
              <p className="text-[9px] text-gray-400">{T("orderTotal")}</p>
            </div>
          )}
          {itemCount != null && Number(itemCount) > 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-2.5 py-1">
              <p className="text-xs font-bold text-gray-700">{Number(itemCount)} items</p>
              <p className="text-[9px] text-gray-400">{T("toCollect")}</p>
            </div>
          )}
          {distanceKm != null && parseFloat(String(distanceKm)) > 0 && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-2.5 py-1">
              <p className="text-xs font-bold text-blue-700">
                {parseFloat(String(distanceKm)).toFixed(1)} km
              </p>
              <p className="text-[9px] text-blue-400">{T("distance")}</p>
            </div>
          )}
        </div>
      )}

      {hasValidVendorCoords && (
        <MiniMap
          pickupLat={vendorLat}
          pickupLng={vendorLng}
          dropLat={deliveryLat}
          dropLng={deliveryLng}
        />
      )}

      <div className="mt-3 flex gap-2">
        {deliveryAddress && (
          <a
            href={buildMapsDeepLink(deliveryLat, deliveryLng, deliveryAddress)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open delivery address in maps"
            className="flex min-h-[44px] items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100"
          >
            <MapPin size={14} />
          </a>
        )}
        <button
          onClick={() => onReject(o.id)}
          disabled={rejectPending}
          className="flex min-h-[44px] items-center gap-1 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-bold text-red-400 transition-colors hover:bg-red-50 disabled:opacity-60"
          aria-label="Reject order"
        >
          <XCircle size={14} /> Reject
        </button>
        <button
          onClick={() => onDismiss(o.id)}
          className="flex min-h-[44px] items-center rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-bold text-gray-400 transition-colors hover:bg-gray-50"
          aria-label="Dismiss order request"
        >
          <X size={16} />
        </button>
        <button
          onClick={() => onAccept(o.id)}
          disabled={isExpired || acceptPending || anyAcceptPending}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-900 py-2.5 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60"
          aria-label="Accept order"
        >
          <CheckCircle size={15} />
          {acceptPending ? T("accepting") : T("acceptOrder")}
        </button>
      </div>
    </div>
  );
});
