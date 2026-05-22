import { useCallback } from "react";

export function GpsMiniMap({
  cLat,
  cLng,
  dLat,
  dLng,
}: {
  cLat: number;
  cLng: number;
  dLat: number | null;
  dLng: number | null;
}) {
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      import("leaflet")
        .then((L) => {
          if (el.querySelector(".leaflet-container")) return;
          const map = L.map(el, {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
          });
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(
            map
          );
          const customerIcon = L.divIcon({
            className: "",
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            html: `<div style="width:14px;height:14px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
          });
          L.marker([cLat, cLng], { icon: customerIcon }).addTo(map).bindPopup("Placed from");
          if (dLat != null && dLng != null && Number.isFinite(dLat) && Number.isFinite(dLng)) {
            const deliveryIcon = L.divIcon({
              className: "",
              iconSize: [14, 14],
              iconAnchor: [7, 7],
              html: `<div style="width:14px;height:14px;background:#f59e0b;border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
            });
            L.marker([dLat, dLng], { icon: deliveryIcon }).addTo(map).bindPopup("Delivery address");
            L.polyline(
              [
                [cLat, cLng],
                [dLat, dLng],
              ],
              { color: "#94a3b8", weight: 2, dashArray: "5,5" }
            ).addTo(map);
            map.fitBounds(
              [
                [cLat, cLng],
                [dLat, dLng],
              ],
              { padding: [30, 30] }
            );
          } else {
            map.setView([cLat, cLng], 14);
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.debug("[GpsMiniMap] Leaflet load failed:", err);
        });
    },
    [cLat, cLng, dLat, dLng]
  );
  return (
    <div
      ref={ref}
      className="flex w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50"
      style={{ height: 150 }}
      aria-label="GPS location map"
    />
  );
}
