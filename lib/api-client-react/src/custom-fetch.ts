export type CustomFetchOptions = RequestInit & {
  responseType?: "json" | "text" | "blob" | "auto";
};

export type ErrorType<T = unknown> = ApiError<T>;

export type BodyType<T> = T;

export type AuthTokenGetter = () => Promise<string | null> | string | null;

const NO_BODY_STATUS = new Set([204, 205, 304]);
const DEFAULT_JSON_ACCEPT = "application/json, application/problem+json";

// ---------------------------------------------------------------------------
// Module-level configuration
// ---------------------------------------------------------------------------

let _baseUrl: string | null = null;
let _authTokenGetter: AuthTokenGetter | null = null;
let _onUnauthorized: ((statusCode?: number, errorMsg?: string) => void) | null = null;
let _refreshTokenGetter: (() => Promise<string | null> | string | null) | null = null;
let _onTokenRefreshed: ((newToken: string, newRefreshToken: string) => void) | null = null;
let _onApiError: ((url: string, status: number, message: string) => void) | null = null;

/**
 * Set a base URL that is prepended to every relative request URL
 * (i.e. paths that start with `/`).
 *
 * Useful for Expo bundles that need to call a remote API server.
 * Pass `null` to clear the base URL.
 */
export function setBaseUrl(url: string | null): void {
  _baseUrl = url ? url.replace(/\/+$/, "") : null;
}

/**
 * Register a getter that supplies a bearer auth token.  Before every fetch
 * the getter is invoked; when it returns a non-null string, an
 * `Authorization: Bearer <token>` header is attached to the request.
 *
 * Useful for Expo bundles making token-gated API calls.
 * Pass `null` to clear the getter.
 */
export function setAuthTokenGetter(getter: AuthTokenGetter | null): void {
  _authTokenGetter = getter;
}

/**
 * Register a callback to invoke whenever a 401 response is received and
 * the token refresh attempt also fails. Typically used to trigger logout.
 */
export function setOnUnauthorized(
  handler: ((statusCode?: number, errorMsg?: string) => void) | null
): void {
  _onUnauthorized = handler;
}

/**
 * Register a getter that supplies the current refresh token.
 * Used to silently refresh the access token on 401 responses.
 */
export function setRefreshTokenGetter(
  getter: (() => Promise<string | null> | string | null) | null
): void {
  _refreshTokenGetter = getter;
}

/**
 * Register a callback invoked with the new access and refresh tokens
 * when a silent token refresh succeeds.
 */
export function setOnTokenRefreshed(
  callback: ((newToken: string, newRefreshToken: string) => void) | null
): void {
  _onTokenRefreshed = callback;
}

export function setOnApiError(
  handler: ((url: string, status: number, message: string) => void) | null
): void {
  _onApiError = handler;
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function resolveMethod(input: RequestInfo | URL, explicitMethod?: string): string {
  if (explicitMethod) return explicitMethod.toUpperCase();
  if (isRequest(input)) return input.method.toUpperCase();
  return "GET";
}

// Use loose check for URL — some runtimes (e.g. React Native) polyfill URL
// differently, so `instanceof URL` can fail.
function isUrl(input: RequestInfo | URL): input is URL {
  return typeof URL !== "undefined" && input instanceof URL;
}

function applyBaseUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!_baseUrl) return input;
  let url = resolveUrl(input);
  if (!url.startsWith("/")) return input;

  if (_baseUrl.endsWith("/api") && url.startsWith("/api/")) {
    url = url.slice(4);
  }

  const absolute = `${_baseUrl}${url}`;
  if (typeof input === "string") return absolute;
  if (isUrl(input)) return new URL(absolute);
  return new Request(absolute, input as Request);
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (isUrl(input)) return input.toString();
  return input.url;
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

function getMediaType(headers: Headers): string | null {
  const value = headers.get("content-type");
  return value ? value.split(";", 1)[0]!.trim().toLowerCase() : null;
}

function isJsonMediaType(mediaType: string | null): boolean {
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

function isTextMediaType(mediaType: string | null): boolean {
  return Boolean(
    mediaType &&
    (mediaType.startsWith("text/") ||
      mediaType === "application/xml" ||
      mediaType === "text/xml" ||
      mediaType.endsWith("+xml") ||
      mediaType === "application/x-www-form-urlencoded")
  );
}

// Use strict equality: in browsers, `response.body` is `null` when the
// response genuinely has no content.  In React Native, `response.body` is
// always `undefined` because the ReadableStream API is not implemented —
// even when the response carries a full payload readable via `.text()` or
// `.json()`.  Loose equality (`== null`) matches both `null` and `undefined`,
// which causes every React Native response to be treated as empty.
function hasNoBody(response: Response, method: string): boolean {
  if (method === "HEAD") return true;
  if (NO_BODY_STATUS.has(response.status)) return true;
  if (response.headers.get("content-length") === "0") return true;
  if (response.body == null) return true;
  return false;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function getStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string") return undefined;

  const trimmed = candidate.trim();
  return trimmed === "" ? undefined : trimmed;
}

function truncate(text: string, maxLength = 300): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildErrorMessage(response: Response, data: unknown): string {
  const prefix = `HTTP ${response.status} ${response.statusText}`;

  if (typeof data === "string") {
    const text = data.trim();
    return text ? `${prefix}: ${truncate(text)}` : prefix;
  }

  const title = getStringField(data, "title");
  const detail = getStringField(data, "detail");
  const message =
    getStringField(data, "message") ??
    getStringField(data, "error_description") ??
    getStringField(data, "error");

  if (title && detail) return `${prefix}: ${title} — ${detail}`;
  if (detail) return `${prefix}: ${detail}`;
  if (message) return `${prefix}: ${message}`;
  if (title) return `${prefix}: ${title}`;

  return prefix;
}

export class ApiError<T = unknown> extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly statusText: string;
  readonly data: T | null;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;

  constructor(response: Response, data: T | null, requestInfo: { method: string; url: string }) {
    super(buildErrorMessage(response, data));
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.data = data;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
  }
}

export class ResponseParseError extends Error {
  readonly name = "ResponseParseError";
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;
  readonly rawBody: string;
  readonly cause: unknown;

  constructor(
    response: Response,
    rawBody: string,
    cause: unknown,
    requestInfo: { method: string; url: string }
  ) {
    super(
      `Failed to parse response from ${requestInfo.method} ${response.url || requestInfo.url} ` +
        `(${response.status} ${response.statusText}) as JSON`
    );
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
    this.rawBody = rawBody;
    this.cause = cause;
  }
}

async function parseJsonBody(
  response: Response,
  requestInfo: { method: string; url: string }
): Promise<unknown> {
  const raw = await response.text();
  const normalized = stripBom(raw);

  if (normalized.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch (cause) {
    throw new ResponseParseError(response, raw, cause, requestInfo);
  }
}

async function parseErrorBody(response: Response, method: string): Promise<unknown> {
  if (hasNoBody(response, method)) {
    return null;
  }

  const mediaType = getMediaType(response.headers);

  // Fall back to text when blob() is unavailable (e.g. some React Native builds).
  if (mediaType && !isJsonMediaType(mediaType) && !isTextMediaType(mediaType)) {
    return typeof response.blob === "function" ? response.blob() : response.text();
  }

  const raw = await response.text();
  const normalized = stripBom(raw);
  const trimmed = normalized.trim();

  if (trimmed === "") {
    return null;
  }

  if (isJsonMediaType(mediaType) || looksLikeJson(normalized)) {
    try {
      return JSON.parse(normalized);
    } catch {
      return raw;
    }
  }

  return raw;
}

function inferResponseType(response: Response): "json" | "text" | "blob" {
  const mediaType = getMediaType(response.headers);

  if (isJsonMediaType(mediaType)) return "json";
  if (isTextMediaType(mediaType) || mediaType == null) return "text";
  return "blob";
}

async function parseSuccessBody(
  response: Response,
  responseType: "json" | "text" | "blob" | "auto",
  requestInfo: { method: string; url: string }
): Promise<unknown> {
  if (hasNoBody(response, requestInfo.method)) {
    return null;
  }

  const effectiveType = responseType === "auto" ? inferResponseType(response) : responseType;

  switch (effectiveType) {
    case "json":
      return parseJsonBody(response, requestInfo);

    case "text": {
      const text = await response.text();
      return text === "" ? null : text;
    }

    case "blob":
      if (typeof response.blob !== "function") {
        throw new TypeError(
          "Blob responses are not supported in this runtime. " +
            'Use responseType "json" or "text" instead.'
        );
      }
      return response.blob();
  }
}

type TokenRefreshResult = { token: string; newRefreshToken: string };

let _refreshPromise: Promise<TokenRefreshResult | null> | null = null;

async function attemptTokenRefresh(baseUrl: string | null): Promise<TokenRefreshResult | null> {
  if (!_refreshTokenGetter) return null;
  const refreshToken = await _refreshTokenGetter();
  if (!refreshToken) return null;

  const refreshUrl = baseUrl
    ? baseUrl.endsWith("/api")
      ? `${baseUrl}/auth/refresh`
      : `${baseUrl}/api/auth/refresh`
    : "/api/auth/refresh";
  try {
    const res = await fetch(refreshUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string; refreshToken?: string };
    if (!data.token) return null;
    return { token: data.token, newRefreshToken: data.refreshToken ?? refreshToken };
  } catch {
    return null;
  }
}

let MAX_RETRIES = 3;
let RETRY_BASE_MS = 1000;
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "DELETE"]);

/**
 * Override the maximum number of retry attempts for idempotent requests.
 * Call this at app startup after loading platform config.
 */
export function setMaxRetryAttempts(n: number): void {
  if (Number.isFinite(n) && n >= 0) MAX_RETRIES = Math.min(Math.floor(n), 10);
}

/**
 * Override the exponential-backoff base delay in milliseconds.
 * Call this at app startup after loading platform config.
 */
export function setRetryBackoffBaseMs(ms: number): void {
  if (Number.isFinite(ms) && ms > 0) RETRY_BASE_MS = Math.min(ms, 30_000);
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const msg = String((error as any)?.message ?? "").toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("aborted") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function customFetch<T = unknown>(
  input: RequestInfo | URL,
  options: CustomFetchOptions = {},
  _isRetry = false
): Promise<T> {
  input = applyBaseUrl(input);
  const { responseType = "auto", headers: headersInit, ...init } = options;

  const method = resolveMethod(input, init.method);

  if (init.body != null && (method === "GET" || method === "HEAD")) {
    throw new TypeError(`customFetch: ${method} requests cannot have a body.`);
  }

  const headers = mergeHeaders(isRequest(input) ? input.headers : undefined, headersInit);

  if (typeof init.body === "string" && !headers.has("content-type") && looksLikeJson(init.body)) {
    headers.set("content-type", "application/json");
  }

  if (responseType === "json" && !headers.has("accept")) {
    headers.set("accept", DEFAULT_JSON_ACCEPT);
  }

  if (_authTokenGetter && !headers.has("authorization")) {
    const token = await _authTokenGetter();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  const requestInfo = { method, url: resolveUrl(input) };

  const canRetry = IDEMPOTENT_METHODS.has(method);
  const maxAttempts = canRetry ? MAX_RETRIES : 0;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(input, { ...init, method, headers });
    } catch (err) {
      lastError = err;
      if (canRetry && isNetworkError(err) && attempt < maxAttempts) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 500;
        await sleep(delay);
        continue;
      }
      throw err;
    }

    if (canRetry && response.status >= 500 && attempt < maxAttempts) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 500;
      await sleep(delay);
      continue;
    }

    if (response.status === 401 && !_isRetry) {
      if (!_refreshPromise) {
        _refreshPromise = attemptTokenRefresh(_baseUrl).finally(() => {
          _refreshPromise = null;
        });
      }
      const refreshResult = await _refreshPromise;
      if (refreshResult) {
        const { token: newToken, newRefreshToken } = refreshResult;
        setAuthTokenGetter(() => newToken);
        if (_onTokenRefreshed) _onTokenRefreshed(newToken, newRefreshToken);
        return customFetch<T>(input, options, true);
      }
      if (_onUnauthorized) _onUnauthorized(401);
      const errorData = await parseErrorBody(response, method);
      throw new ApiError(response, errorData, requestInfo);
    }

    if (!response.ok) {
      const errorData = await parseErrorBody(response, method);
      if (response.status === 403 && _onUnauthorized) {
        const errMsg =
          getStringField(errorData, "error") || getStringField(errorData, "message") || undefined;
        _onUnauthorized(403, errMsg);
      }
      if (_onApiError) {
        const errMsg =
          getStringField(errorData, "error") || getStringField(errorData, "message") || "API error";
        _onApiError(requestInfo.url, response.status, errMsg);
      }
      throw new ApiError(response, errorData, requestInfo);
    }

    const parsed = await parseSuccessBody(response, responseType, requestInfo);
    if (
      parsed != null &&
      typeof parsed === "object" &&
      "success" in parsed &&
      (parsed as Record<string, unknown>).success === true &&
      "data" in parsed
    ) {
      return (parsed as Record<string, unknown>).data as T;
    }
    return parsed as T;
  }

  throw lastError ?? new Error("Request failed after retries");
}
