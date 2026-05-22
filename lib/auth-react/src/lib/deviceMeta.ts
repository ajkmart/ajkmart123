/**
 * deviceMeta.ts — @workspace/auth-react (shared)
 *
 * Captures non-PII device context at call time.
 * Used for audit logging and suspicious-activity detection (e.g., login from a
 * new device type, timezone mismatch with registered phone region).
 *
 * All fields are best-effort; failures are swallowed so this never blocks auth flows.
 * Geolocation is only captured if the user has previously granted permission — we never
 * prompt for location just for auth context.
 */

export interface DeviceMeta {
  [key: string]: unknown;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  timezone: string;
  language: string;
  platform: string;
  lat?: number;
  lng?: number;
}

/**
 * Collect available device metadata synchronously, with an optional
 * async geolocation pass if the caller awaits the returned promise.
 *
 * @param includeLocation - Whether to attempt a cached geolocation lookup.
 *   Defaults to false. Set to true only when you already know the user has
 *   granted location permission (e.g., after a successful GPS request earlier
 *   in the flow). Never use this to trigger the browser permission prompt.
 */
export async function captureDeviceMeta(includeLocation = false): Promise<DeviceMeta> {
  const meta: DeviceMeta = {
    userAgent: navigator.userAgent,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform:
      (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      "unknown",
  };

  if (includeLocation && "geolocation" in navigator) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 3000,
          maximumAge: 60_000,
          enableHighAccuracy: false,
        })
      );
      meta.lat = pos.coords.latitude;
      meta.lng = pos.coords.longitude;
    } catch (_e) {
      /* Permission denied or timeout — silently omit location */
    }
  }

  return meta;
}
