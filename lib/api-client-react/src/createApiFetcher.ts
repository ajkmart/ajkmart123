/**
 * Shared API Fetcher Factory
 *
 * Creates a per-app fetch function that centralises:
 *   - Bearer token injection (from getToken callback)
 *   - Configurable AbortController timeout — ALWAYS applied even when the
 *     caller passes its own signal (the two are merged via AbortSignal.any)
 *   - 401 → refresh → retry with a mutex (one concurrent refresh per instance)
 *   - Pluggable refresh via URL endpoint or custom async function
 *   - Extra headers per request and per refresh (CSRF, X-App, etc.)
 */

export type RefreshResult = "refreshed" | "transient" | "auth_failed";

/** Thrown when the factory's own timeout fires (not an external abort). */
export class FetchTimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "FetchTimeoutError";
  }
}

/** Thrown by the CoreFetch function when a 401-triggered refresh fails. */
export class RefreshError extends Error {
  readonly isTransient: boolean;
  constructor(isTransient: boolean) {
    super(isTransient ? "Refresh failed: network error" : "Refresh failed: session invalid");
    this.name = "RefreshError";
    this.isTransient = isTransient;
  }
}

export interface CreateApiFetcherConfig {
  /** Prepended to every path. Use "" for absolute-path fetchers. */
  baseUrl: string;

  /** Returns the current access token synchronously. */
  getToken: () => string | null;

  /**
   * Called after a successful URL-based refresh to store the new access token.
   * Not required when refreshFn is provided (the function handles storage itself).
   */
  setToken?: (token: string) => void;

  /** Returns the current refresh token for URL-based refresh body. */
  getRefreshToken?: () => string | null;

  /**
   * Called after a successful URL-based refresh to store the new refresh token
   * returned by the server.
   */
  setRefreshToken?: (token: string) => void;

  /**
   * Called when a 401 refresh fails, before RefreshError is thrown.
   * @param isTransient - true = network/5xx (keep tokens, surface recoverable error);
   *                      false = auth denied (clear tokens, log user out).
   */
  onRefreshFailed: (isTransient: boolean) => void;

  /**
   * Full URL to POST for a URL-based token refresh.
   * Mutually exclusive with refreshFn; one must be provided.
   */
  refreshEndpoint?: string;

  /**
   * Custom async refresh handler. Resolves to the new access token string, or
   * throws on any failure (treated as auth_failed — no transient distinction).
   * Mutually exclusive with refreshEndpoint; one must be provided.
   */
  refreshFn?: () => Promise<string>;

  /**
   * Returns extra headers merged into every regular request.
   * Called on each request so values (e.g. CSRF token) are always fresh.
   */
  extraHeaders?: () => Record<string, string>;

  /**
   * Returns extra headers added only to the internal URL-based refresh POST
   * (e.g. { "X-App": "vendor" }). Ignored when refreshFn is used.
   */
  extraRefreshHeaders?: () => Record<string, string>;

  /**
   * Default request timeout in ms, or a getter for dynamic updates (e.g.
   * from platform config). The timeout is ALWAYS applied — if the caller
   * also supplies an AbortSignal via opts.signal, the two are merged.
   * Set to 0 to disable factory timeout for all calls on this instance.
   * Default: 15 000 ms.
   */
  timeoutMs?: number | (() => number);

  /** credentials mode for all requests. Default: "include". */
  credentialsMode?: RequestCredentials;
}

/** Extended RequestInit with an optional per-call timeout override. */
export type CoreFetchOpts = RequestInit & {
  /**
   * Per-call timeout in ms, overriding the instance-level timeoutMs for this
   * specific request. Set to 0 to disable factory timeout for this call only.
   * Useful for long-running uploads that should not be cancelled by the
   * default request timeout.
   */
  _timeoutMs?: number;
};

/**
 * Function returned by createApiFetcher.
 * Returns a raw Response; callers handle status codes, body parsing, and errors.
 * Throws FetchTimeoutError when the factory's timeout fires.
 * Throws RefreshError when a 401-triggered refresh fails.
 */
export type CoreFetch = (path: string, opts?: CoreFetchOpts) => Promise<Response>;

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Builds a [signal, factoryCtrl, cleanup] triple.
 *
 * - If ms <= 0: no factory timeout; return external signal (or a never-firing
 *   one). factoryCtrl is null.
 * - If ms > 0: create a factory AbortController that fires after ms ms.
 *   If external is also provided, merge both so whichever fires first aborts
 *   the fetch. factoryCtrl is the factory's own controller so the caller can
 *   check whether the factory's timer fired specifically.
 *
 * Merge strategy (both supported environments):
 *   • AbortSignal.any (modern browsers / Node 20+): creates a minimal merged
 *     signal; the originals are unaffected.
 *   • Polyfill: external abort propagates into factoryCtrl via event listener;
 *     the merged "signal" IS factoryCtrl.signal.
 */
function withTimeout(
  ms: number,
  external?: AbortSignal
): [AbortSignal, AbortController | null, () => void] {
  if (ms <= 0) {
    if (external) return [external, null, () => {}];
    const ctrl = new AbortController();
    return [ctrl.signal, null, () => {}];
  }

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(new FetchTimeoutError()), ms);
  const clearTid = () => clearTimeout(tid);
  ctrl.signal.addEventListener("abort", clearTid, { once: true });

  if (!external) {
    return [ctrl.signal, ctrl, clearTid];
  }

  // Merge factory timeout + external signal
  if (typeof (AbortSignal as any).any === "function") {
    // Best path: AbortSignal.any creates a lightweight merged signal.
    // factoryCtrl.signal is only aborted by our setTimeout, so checking
    // factoryCtrl.signal.reason instanceof FetchTimeoutError unambiguously
    // identifies our own timeout vs an external abort.
    const merged: AbortSignal = (AbortSignal as any).any([ctrl.signal, external]);
    return [merged, ctrl, clearTid];
  }

  // Polyfill: propagate external abort into ctrl so fetch gets one signal.
  if (external.aborted) {
    clearTimeout(tid);
    ctrl.abort(external.reason);
  } else {
    external.addEventListener(
      "abort",
      () => {
        clearTimeout(tid);
        ctrl.abort(external.reason);
      },
      { once: true }
    );
  }
  // factoryCtrl.signal.reason is FetchTimeoutError only when OUR timer fired.
  return [ctrl.signal, ctrl, clearTid];
}

/** Checks whether a factory AbortController's timer was what triggered abort. */
function isFactoryTimeout(ctrl: AbortController | null): boolean {
  return ctrl != null && ctrl.signal.reason instanceof FetchTimeoutError;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a fetch function with centralised auth handling for a single app.
 *
 * Returns a tuple: [coreFetch, triggerRefresh].
 * - coreFetch(path, opts) — drop-in for fetch(); adds auth, timeout, auto-refresh.
 * - triggerRefresh() — exposes the mutex-guarded refresh for external callers
 *   (e.g. the api.refreshToken method in vendor/rider apps).
 */
export function createApiFetcher(
  config: CreateApiFetcherConfig
): [CoreFetch, () => Promise<RefreshResult>] {
  const {
    baseUrl,
    getToken,
    setToken,
    getRefreshToken,
    setRefreshToken,
    onRefreshFailed,
    refreshEndpoint,
    refreshFn,
    extraHeaders,
    extraRefreshHeaders,
    timeoutMs: timeoutMsConfig = 15_000,
    credentialsMode = "include",
  } = config;

  if (!refreshEndpoint && !refreshFn) {
    throw new Error("createApiFetcher: provide either refreshEndpoint or refreshFn");
  }

  const getTimeoutMs: () => number =
    typeof timeoutMsConfig === "function" ? timeoutMsConfig : () => timeoutMsConfig;

  // ── Mutex: one concurrent refresh per factory instance ────────────────────
  let _refreshPromise: Promise<RefreshResult> | null = null;

  async function doRefresh(): Promise<RefreshResult> {
    if (refreshFn) {
      try {
        const newToken = await refreshFn();
        if (setToken) setToken(newToken);
        return "refreshed";
      } catch {
        return "auth_failed";
      }
    }

    const bodyToken = getRefreshToken?.() ?? null;
    // Apply the same instance timeout to the refresh request so a stalled
    // network does not leave the mutex locked indefinitely. Timeout maps to
    // "transient" (keep tokens, try again later) rather than "auth_failed".
    const refreshMs = getTimeoutMs();
    const refreshCtrl = new AbortController();
    const refreshTid = refreshMs > 0 ? setTimeout(() => refreshCtrl.abort(), refreshMs) : null;
    try {
      const res = await fetch(refreshEndpoint!, {
        method: "POST",
        credentials: credentialsMode,
        headers: {
          "Content-Type": "application/json",
          ...extraRefreshHeaders?.(),
        },
        body: JSON.stringify(bodyToken ? { refreshToken: bodyToken } : {}),
        signal: refreshMs > 0 ? refreshCtrl.signal : undefined,
      });
      if (refreshTid) clearTimeout(refreshTid);
      if (!res.ok) {
        return res.status >= 500 ? "transient" : "auth_failed";
      }
      const data = (await res.json()) as {
        token?: string;
        refreshToken?: string;
      };
      if (!data.token) return "auth_failed";
      if (setToken) setToken(data.token);
      if (data.refreshToken && setRefreshToken) setRefreshToken(data.refreshToken);
      return "refreshed";
    } catch {
      if (refreshTid) clearTimeout(refreshTid);
      return "transient"; // network error or timeout → keep tokens, retry later
    }
  }

  function attemptRefresh(): Promise<RefreshResult> {
    if (_refreshPromise) return _refreshPromise;
    _refreshPromise = doRefresh();
    return _refreshPromise.finally(() => {
      _refreshPromise = null;
    });
  }

  // ── Header builder ────────────────────────────────────────────────────────
  function buildHeaders(fetchOpts: RequestInit): Headers {
    const headers = new Headers(fetchOpts.headers as HeadersInit | undefined);
    const token = getToken();
    if (token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }
    for (const [key, value] of Object.entries(extraHeaders?.() ?? {})) {
      if (!headers.has(key)) headers.set(key, value);
    }
    return headers;
  }

  // ── Core fetch function ───────────────────────────────────────────────────
  async function coreFetch(path: string, opts: CoreFetchOpts = {}): Promise<Response> {
    const { _timeoutMs: callTimeout, ...fetchOpts } = opts;
    // Per-call _timeoutMs overrides the instance timeout (including 0 = disabled).
    const effectiveTimeout = callTimeout !== undefined ? callTimeout : getTimeoutMs();

    const external = fetchOpts.signal as AbortSignal | undefined;
    const [signal, factoryCtrl, cancelTimeout] = withTimeout(effectiveTimeout, external);
    const headers = buildHeaders(fetchOpts);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        ...fetchOpts,
        headers,
        signal,
        credentials: credentialsMode,
      });
    } catch (err) {
      cancelTimeout();
      if (isFactoryTimeout(factoryCtrl)) throw new FetchTimeoutError();
      throw err;
    }
    cancelTimeout();

    if (res.status !== 401) {
      return res;
    }

    // ── 401 → refresh (mutex) → retry once ───────────────────────────────
    const result = await attemptRefresh();

    if (result === "transient") {
      onRefreshFailed(true);
      throw new RefreshError(true);
    }

    if (result === "auth_failed") {
      onRefreshFailed(false);
      throw new RefreshError(false);
    }

    // Refreshed — retry once with the new token.
    // Retry uses the same effective timeout (respects _timeoutMs: 0 override).
    // No external signal on retry — it is fully factory-managed.
    const retryHeaders = buildHeaders(fetchOpts); // picks up new token via getToken()
    const [retrySignal, retryCtrl, cancelRetryTimeout] = withTimeout(effectiveTimeout);
    try {
      return await fetch(`${baseUrl}${path}`, {
        ...fetchOpts,
        headers: retryHeaders,
        signal: retrySignal,
        credentials: credentialsMode,
      });
    } catch (err) {
      if (isFactoryTimeout(retryCtrl)) throw new FetchTimeoutError();
      throw err;
    } finally {
      cancelRetryTimeout();
    }
  }

  return [coreFetch, attemptRefresh];
}
