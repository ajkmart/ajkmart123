import { apiFetch } from "./api";

export function logRideEvent(
  rideId: string,
  event: string,
  showToast?: (msg: string, isError?: boolean) => void
): void {
  const doLog = (lat?: number, lng?: number) => {
    apiFetch(`/riders/rides/${rideId}/event-log`, {
      method: "POST",
      body: JSON.stringify({ event, lat, lng }),
    }).catch((err: Error) => {
      if (showToast) showToast(`GPS event log failed: ${err.message}`, true);
    });
  };
  if (navigator?.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => doLog(pos.coords.latitude, pos.coords.longitude),
      () => doLog(),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 15_000 }
    );
  } else {
    doLog();
  }
}
