/**
 * Shared response shape for `/system/test-integration/:type` and
 * `/api/payments/test-connection/:type` endpoints. All admin integration
 * tests should normalise their backend reply through `parseIntegrationTestResponse`
 * so that UI status display does not depend on `as any` casts.
 */

export interface IntegrationTestResponse {
  ok: boolean;
  message: string;
}

interface RawTestResponse {
  ok?: unknown;
  success?: unknown;
  message?: unknown;
  error?: unknown;
  data?: { ok?: unknown; success?: unknown; message?: unknown; error?: unknown } | null;
}

function pickString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function pickBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

/**
 * Normalises an arbitrary backend payload into a strict
 * `IntegrationTestResponse`. Falls back to `defaultMessage` if the payload
 * does not include any usable text.
 *
 * The backend is treated as failing only when it explicitly returns
 * `ok: false` / `success: false` or includes a non-empty `error` field.
 */
export function parseIntegrationTestResponse(
  raw: unknown,
  defaultMessage: string
): IntegrationTestResponse {
  if (raw == null || typeof raw !== "object") {
    return { ok: true, message: defaultMessage };
  }
  const r = raw as RawTestResponse;
  const inner = r.data && typeof r.data === "object" ? r.data : null;

  const explicitOk =
    pickBool(r.ok) ??
    pickBool(r.success) ??
    (inner ? (pickBool(inner.ok) ?? pickBool(inner.success)) : null);
  const errorText = pickString(r.error) ?? (inner ? pickString(inner.error) : null);
  const message =
    pickString(r.message) ??
    (inner ? pickString(inner.message) : null) ??
    errorText ??
    defaultMessage;

  let ok: boolean;
  if (explicitOk != null) {
    ok = explicitOk;
  } else if (errorText) {
    ok = false;
  } else {
    ok = true;
  }

  return { ok, message };
}
