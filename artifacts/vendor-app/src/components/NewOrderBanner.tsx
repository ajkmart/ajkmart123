import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { VendorNewOrderEvent } from "../lib/socket";

interface Props {
  order: VendorNewOrderEvent | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 12_000;

export function NewOrderBanner({ order, onDismiss }: Props) {
  const [, navigate] = useLocation();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!order) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  if (!order) return null;

  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const total = typeof order.total === "number" ? order.total.toFixed(0) : "—";
  const orderType = order.type ?? "mart";

  function handleView() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(() => {
      onDismiss();
      navigate("/orders");
    }, 200);
  }

  function handleDismiss() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(onDismiss, 300);
  }

  return (
    <div
      className={`fixed inset-x-0 top-0 z-[9999] transition-transform duration-300 ${visible ? "translate-y-0" : "-translate-y-full"}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="m-2 mx-auto max-w-lg">
        <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl">
          <div className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2">
            <span className="text-lg text-white">🛍️</span>
            <span className="text-sm font-extrabold tracking-wide text-white uppercase">
              New Order Arrived!
            </span>
            <span className="ml-auto text-xs font-medium text-blue-100 capitalize">
              {orderType}
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-gray-800">
                {itemCount > 0 ? `${itemCount} item${itemCount > 1 ? "s" : ""}` : "Order placed"}
                {" · "}
                <span className="text-blue-600">Rs {total}</span>
              </p>
              {order.paymentMethod && (
                <p className="mt-0.5 text-xs text-gray-400 capitalize">
                  Payment: {String(order.paymentMethod).replace(/_/g, " ")}
                </p>
              )}
            </div>
            <button
              onClick={handleView}
              className="h-9 shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition-all hover:bg-blue-700 active:scale-95"
            >
              View
            </button>
            <button
              onClick={handleDismiss}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-lg leading-none text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <div className="h-1 bg-blue-100">
            <div
              className="h-full origin-left bg-blue-500"
              style={{ animation: `shrink ${AUTO_DISMISS_MS}ms linear forwards` }}
            />
          </div>
        </div>
      </div>
      <style>{`
        @keyframes shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }
      `}</style>
    </div>
  );
}
