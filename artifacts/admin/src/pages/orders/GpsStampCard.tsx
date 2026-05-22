import { AlertTriangle, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { GpsMiniMap } from "./GpsMiniMap";

export function GpsStampCard({ order }: { order: any }) {
  const cLat = Number(order.customerLat);
  const cLng = Number(order.customerLng);

  const dLat =
    order.deliveryLat != null && order.deliveryLat !== undefined ? Number(order.deliveryLat) : null;
  const dLng =
    order.deliveryLng != null && order.deliveryLng !== undefined ? Number(order.deliveryLng) : null;
  const hasDual = dLat != null && dLng != null && Number.isFinite(dLat) && Number.isFinite(dLng);
  const isMismatch = !!order.gpsMismatch;
  const [placeName, setPlaceName] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) return;
    let cancelled = false;
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${cLat}&lon=${cLng}&format=json&zoom=16&addressdetails=1`,
      {
        headers: { "Accept-Language": "en" },
      }
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.display_name) {
          const parts = data.display_name
            .split(",")
            .slice(0, 3)
            .map((s: string) => s.trim());
          setPlaceName(parts.join(", "));
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.debug("[GpsStampCard] Nominatim reverse geocode failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [cLat, cLng]);

  if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) return null;

  return (
    <section
      className={`overflow-hidden rounded-xl border ${isMismatch ? "border-amber-300" : "border-emerald-200"}`}
      aria-label="GPS location details"
    >
      {isMismatch && (
        <div
          className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="text-[11px] font-bold text-amber-800">GPS Mismatch Warning</p>
            <p className="text-[10px] text-amber-700">
              Customer device GPS is far from the selected delivery address
            </p>
          </div>
        </div>
      )}
      <div className={`space-y-2 p-3 ${isMismatch ? "bg-amber-50/50" : "bg-emerald-50"}`}>
        <p
          className={`flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase ${isMismatch ? "text-amber-700" : "text-emerald-700"}`}
        >
          <MapPin className="h-3 w-3" aria-hidden="true" /> Customer GPS Location
          {!isMismatch && (
            <span className="ml-1 rounded-full bg-emerald-200 px-1.5 py-0.5 text-[9px] text-emerald-800">
              Match OK
            </span>
          )}
        </p>
        {placeName && <p className="text-xs font-medium text-gray-800">{placeName}</p>}
        <p className="font-mono text-[10px] text-gray-500">
          Placed from: {cLat.toFixed(5)}, {cLng.toFixed(5)}
        </p>
        {hasDual && (
          <p className="font-mono text-[10px] text-gray-500">
            Delivery to: {dLat!.toFixed(5)}, {dLng!.toFixed(5)}
          </p>
        )}
        {order.gpsAccuracy != null && order.gpsAccuracy !== undefined && (
          <p className="text-muted-foreground text-[10px]">
            GPS Accuracy: +/-{Math.round(Number(order.gpsAccuracy))}m
          </p>
        )}
        <GpsMiniMap cLat={cLat} cLng={cLng} dLat={dLat} dLng={dLng} />
        {hasDual && (
          <div className="flex gap-3 text-[9px]">
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500"
                aria-hidden="true"
              />{" "}
              Placed from
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500"
                aria-hidden="true"
              />{" "}
              Delivery address
            </span>
          </div>
        )}
        <div className="flex items-start gap-1.5 pt-1">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-gray-500" aria-hidden="true" />
          <p className="text-[10px] text-gray-600">
            <span className="font-semibold">Delivery Address:</span> {order.deliveryAddress || "—"}
          </p>
        </div>
      </div>
    </section>
  );
}
