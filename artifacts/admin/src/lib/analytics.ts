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

/**
 * Events that arrive before initAnalytics is called (e.g. early web-vitals
 * reports for FCP / TTFB that fire during the initial page load) are held
 * here and flushed in FIFO order once the analytics backend initialises.
 */
const _queue: Array<{ name: string; params?: Record<string, unknown> }> = [];

export function initAnalytics(platform: string, trackingId: string, debug: boolean): void {
  if (!trackingId || _ready) return;
  _platform = platform;
  _ready = true;

  if (platform === "ga4" || platform === "google_analytics") {
    _initGa4(trackingId, debug);
  } else if (platform === "mixpanel") {
    _initMixpanel(trackingId, debug);
  }

  // Replay any events that were buffered before init.
  const queued = _queue.splice(0);
  for (const ev of queued) {
    _dispatch(ev.name, ev.params);
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

function _dispatch(name: string, params?: Record<string, unknown>): void {
  if (_platform === "ga4" || _platform === "google_analytics") {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params);
    }
  } else if (_platform === "mixpanel") {
    window.mixpanel?.track(name, params);
  }
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!_ready) {
    // Buffer the event — it will be replayed once initAnalytics completes.
    _queue.push({ name, params });
    return;
  }
  _dispatch(name, params);
}

export function trackPageView(path: string): void {
  trackEvent("page_view", { page_path: path });
}

export function identifyUser(id: string): void {
  if (!_ready) return;
  if (_platform === "mixpanel") {
    window.mixpanel?.identify(id);
  } else if (_platform === "ga4" || _platform === "google_analytics") {
    if (typeof window.gtag === "function") {
      window.gtag("config", undefined, { user_id: id });
    }
  }
}

export function resetUser(): void {
  if (!_ready) return;
  if (_platform === "mixpanel") {
    window.mixpanel?.reset();
  }
}
