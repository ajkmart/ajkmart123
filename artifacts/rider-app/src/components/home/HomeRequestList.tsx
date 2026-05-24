import { AlertTriangle, Bike, Eye } from "lucide-react";
import type { Order, Ride } from "../../lib/api";
import { OrderRequestCard, RideRequestCard } from "../dashboard";

function getDeliveryEarn(type: string, config: any): number {
  const df = config.deliveryFee;
  let fee: number;
  if (typeof df === "number") {
    fee = df;
  } else if (df && typeof df === "object") {
    const raw = (df as Record<string, unknown>)[type] ?? (df as Record<string, unknown>).mart ?? 0;
    fee = typeof raw === "number" ? raw : parseFloat(String(raw)) || 0;
  } else {
    fee = parseFloat(String(df)) || 0;
  }
  return fee * (config.finance.riderEarningPct / 100);
}

interface HomeRequestListProps {
  requestsLoading: boolean;
  requestsError: boolean;
  totalRequests: number;
  dismissed: Set<string>;
  onClearDismissed: () => void;
  orders: Order[];
  rides: Ride[];
  currency: string;
  config: any;
  onAcceptOrder: (id: string) => void;
  onRejectOrder: (id: string) => void;
  onAcceptRide: (id: string) => void;
  onCounterRide: (id: string, fare: number) => void;
  onRejectOffer: (id: string) => void;
  onIgnoreRide: (id: string) => void;
  onDismiss: (id: string) => void;
  acceptOrderPending: boolean;
  rejectOrderPending: boolean;
  acceptRidePending: boolean;
  acceptingRideId?: string | null;
  counterRidePending: boolean;
  rejectOfferPending: boolean;
  ignoreRidePending: boolean;
  requestsServerTime: string | null;
  userId: string;
  isRestricted: boolean;
  onRetry: () => void;
  T: (key: import("@workspace/i18n").TranslationKey) => string;
}

export function HomeRequestList({
  requestsLoading,
  requestsError,
  totalRequests,
  dismissed,
  onClearDismissed,
  orders,
  rides,
  currency,
  config,
  onAcceptOrder,
  onRejectOrder,
  onAcceptRide,
  onCounterRide,
  onRejectOffer,
  onIgnoreRide,
  onDismiss,
  acceptOrderPending,
  rejectOrderPending,
  acceptRidePending,
  acceptingRideId,
  counterRidePending,
  rejectOfferPending,
  ignoreRidePending,
  requestsServerTime,
  userId,
  isRestricted,
  onRetry,
  T,
}: HomeRequestListProps) {
  if (requestsLoading) {
    return (
      <div className="bg-white p-10 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
        <p className="text-xs font-medium text-gray-400">Loading requests…</p>
      </div>
    );
  }
  if (requestsError) {
    return (
      <div className="bg-white p-8 text-center">
        <AlertTriangle size={28} className="mx-auto mb-3 text-red-300" />
        <p className="text-sm font-bold text-gray-600">Could not load requests</p>
        <p className="mt-1 text-xs text-gray-400">Check your connection and try again.</p>
        <button onClick={onRetry} className="mt-3 text-xs font-bold text-indigo-600 underline">
          Retry
        </button>
      </div>
    );
  }
  if (totalRequests === 0) {
    return (
      <div className="bg-white p-8 text-center sm:p-10">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-gray-50 sm:h-16 sm:w-16">
          <Bike size={28} className="text-gray-300" />
        </div>
        <p className="text-sm font-bold text-gray-600 sm:text-base">{T("noRequestsNow")}</p>
        <p className="mt-1.5 text-xs text-gray-400">{T("autoRefreshes")}</p>
        {dismissed.size > 0 && (
          <button
            onClick={onClearDismissed}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-xs font-bold text-gray-900 transition-colors hover:bg-gray-200"
            aria-label={`Show ${dismissed.size} hidden requests`}
          >
            <Eye size={12} /> Show {dismissed.size} hidden request{dismissed.size > 1 ? "s" : ""}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="divide-y divide-gray-100 bg-white">
      {orders.map((o) => (
        <OrderRequestCard
          key={o.id}
          order={o}
          earnings={getDeliveryEarn(o.type ?? "", config)}
          currency={currency}
          config={config}
          onAccept={onAcceptOrder}
          onReject={onRejectOrder}
          onDismiss={onDismiss}
          acceptPending={acceptOrderPending}
          rejectPending={rejectOrderPending}
          anyAcceptPending={acceptRidePending}
          serverTime={requestsServerTime}
          isRestricted={isRestricted}
          T={T}
        />
      ))}
      {rides.map((r) => (
        <RideRequestCard
          key={r.id}
          ride={r}
          userId={userId}
          isRestricted={isRestricted}
          config={config}
          currency={currency}
          onAccept={onAcceptRide}
          onCounter={onCounterRide}
          onRejectOffer={onRejectOffer}
          onIgnore={onIgnoreRide}
          onDismiss={onDismiss}
          acceptPending={acceptingRideId === r.id || acceptRidePending}
          counterPending={counterRidePending}
          rejectOfferPending={rejectOfferPending}
          ignorePending={ignoreRidePending}
          anyAcceptPending={acceptOrderPending || (acceptRidePending && acceptingRideId !== r.id)}
          serverTime={requestsServerTime}
          T={T}
        />
      ))}
    </div>
  );
}
