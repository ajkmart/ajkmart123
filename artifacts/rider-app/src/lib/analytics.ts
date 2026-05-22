declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
    mixpanel?: {
      init: (token: string, opts?: Record<string, unknown>) => void;
      track: (event: string, props?: Record<string, unknown>) => void;
      identify: (id: string) => void;
      reset: () => void;
    };
  }
}

let _platform = "";
let _ready = false;
/* S-Sec6: Persist the GA4 / Mixpanel tracking ID so identifyUser can pass it
   to gtag("config", id, …). Previously gtag was called with `undefined` which
   silently no-oped — the rider's GA4 user_id was never associated. */
let _trackingId = "";

export function initAnalytics(platform: string, trackingId: string, debug: boolean): void {
  if (!trackingId || _ready) return;
  _platform = platform;
  _trackingId = trackingId;
  _ready = true;

  if (platform === "ga4" || platform === "google_analytics") {
    _initGa4(trackingId, debug);
  } else if (platform === "mixpanel") {
    _initMixpanel(trackingId, debug);
  }
}

function _initGa4(id: string, debug: boolean): void {
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function (...args: unknown[]) {
    window.dataLayer.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", id, { debug_mode: debug, send_page_view: true });
}

function _initMixpanel(token: string, debug: boolean): void {
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js";
  script.onload = () => {
    window.mixpanel?.init(token, { debug });
  };
  document.head.appendChild(script);
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!_ready) return;
  if (_platform === "ga4" || _platform === "google_analytics") {
    if (typeof window.gtag === "function") window.gtag("event", name, params);
  } else if (_platform === "mixpanel") {
    window.mixpanel?.track(name, params);
  }
}

export function trackPageView(path: string): void {
  trackEvent("page_view", { page_path: path });
}

export function identifyUser(id: string): void {
  if (!_ready) return;
  if (_platform === "mixpanel") window.mixpanel?.identify(id);
  else if (typeof window.gtag === "function" && _trackingId) {
    /* S-Sec6: Pass the cached tracking ID instead of `undefined`. */
    window.gtag("config", _trackingId, { user_id: id });
  }
}

export function resetUser(): void {
  if (!_ready || _platform !== "mixpanel") return;
  window.mixpanel?.reset();
}
