import { lazy, memo, Suspense } from "react";

/* Leaflet and react-leaflet are loaded on-demand (not in the main bundle).
   The dynamic import boundary means the leaflet + leaflet/dist/leaflet.css
   chunks are only fetched when a request card with valid GPS coords is first
   rendered — keeping the initial page-load bundle free of the ~150 KB Leaflet
   library. The Suspense fallback matches the map container dimensions so there
   is no layout shift while the chunk downloads. */
const MiniMapImpl = lazy(() => import("./MiniMapImpl").then((m) => ({ default: m.MiniMapImpl })));

function MiniMapSkeleton() {
  return (
    <div className="relative mt-3 h-28 w-full animate-pulse overflow-hidden rounded-2xl border border-gray-100 bg-gray-100 shadow-inner" />
  );
}

export const MiniMap = memo(function MiniMap({
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
}: {
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropLat?: number | null;
  dropLng?: number | null;
}) {
  const hasPick = pickupLat != null && pickupLng != null;
  const hasDrop = dropLat != null && dropLng != null;

  if (!hasPick && !hasDrop) return null;

  return (
    <Suspense fallback={<MiniMapSkeleton />}>
      <MiniMapImpl
        pickupLat={pickupLat}
        pickupLng={pickupLng}
        dropLat={dropLat}
        dropLng={dropLng}
      />
    </Suspense>
  );
});
