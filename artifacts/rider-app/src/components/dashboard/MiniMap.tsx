import { Component, lazy, memo, Suspense, type ReactNode } from "react";

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

function MiniMapError() {
  return (
    <div className="relative mt-3 flex h-28 w-full items-center justify-center overflow-hidden rounded-2xl border border-red-100 bg-red-50 shadow-inner">
      <p className="text-xs font-medium text-red-400">Map unavailable</p>
    </div>
  );
}

/* M-20: Error boundary prevents a Leaflet rendering crash (e.g. invalid coords,
   missing tiles, or DOM mutation errors) from unmounting the entire request card. */
interface EBState {
  hasError: boolean;
}
class MiniMapErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false };

  static getDerivedStateFromError(): EBState {
    return { hasError: true };
  }

  override componentDidCatch(err: unknown) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[MiniMap] Leaflet error caught by boundary:", err);
    }
  }

  override render() {
    if (this.state.hasError) return <MiniMapError />;
    return this.props.children;
  }
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
    <MiniMapErrorBoundary>
      <Suspense fallback={<MiniMapSkeleton />}>
        <MiniMapImpl
          pickupLat={pickupLat}
          pickupLng={pickupLng}
          dropLat={dropLat}
          dropLng={dropLng}
        />
      </Suspense>
    </MiniMapErrorBoundary>
  );
});
