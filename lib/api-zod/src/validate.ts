import { createLogger } from "@workspace/logger";
import { type ZodError, type ZodIssue, type ZodType } from "zod";
const log = createLogger("[api-zod]");

/**
 * Thrown in strict mode (development) when a backend response does not match
 * its registered Zod schema. Carries the Zod issues, the URL context, and the
 * raw received value so you can inspect exactly what the server sent.
 */
export class ApiValidationError extends Error {
  readonly name = "ApiValidationError";
  readonly issues: ZodIssue[];
  readonly context: string;
  readonly received: unknown;

  constructor(context: string, issues: ZodIssue[], received: unknown) {
    const summary = issues
      .slice(0, 3)
      .map((i) => `${i.path.length ? i.path.join(".") : "<root>"}: ${i.message}`)
      .join("; ");
    const extra = issues.length > 3 ? ` (+${issues.length - 3} more)` : "";
    super(`[ApiValidation] ${context} — ${summary}${extra}`);
    this.issues = issues;
    this.context = context;
    this.received = received;
  }
}

export interface ValidationOptions {
  /**
   * When true, throw ApiValidationError on mismatch.
   * When false, log.warn and pass through raw data.
   * Default: auto-detected from NODE_ENV (true in development, false in production).
   */
  strict?: boolean;

  /**
   * Called on every validation failure regardless of strict mode.
   * Use this to forward mismatches to Sentry / an analytics sink.
   */
  onFailure?: (error: ApiValidationError, path: string) => void;
}

function isDevEnv(): boolean {
  try {
    const g = globalThis as Record<string, unknown>;
    const proc = g["process"] as { env?: Record<string, string> } | undefined;
    return proc?.env?.["NODE_ENV"] !== "production";
  } catch (_e) {
    return false;
  }
}

/**
 * Validate a raw API response against a Zod schema.
 *
 * - In strict mode (dev by default): throws `ApiValidationError`.
 * - In non-strict mode (prod by default): `log.warn` and returns raw data cast to T.
 *
 * `options.onFailure` is always called so mismatches reach your error reporter regardless
 * of the strict setting.
 */
export function validateApiResponse<T>(
  schema: ZodType<T>,
  data: unknown,
  context: string,
  options?: ValidationOptions
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const err = new ApiValidationError(context, result.error.issues, data);
  const strict = options?.strict ?? isDevEnv();

  if (options?.onFailure) {
    try {
      options.onFailure(err, context);
    } catch (_e) {
      // never let the reporter crash the request
    }
  }

  if (strict) throw err;

  log.warn(err.message);
  return data as T;
}

/**
 * Safe variant — never throws.
 * Returns `{ success: true, data }` on success or `{ success: false, error, received }` on failure.
 */
export function safeValidateApiResponse<T>(
  schema: ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: ZodError; received: unknown } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error, received: data };
}

/** One entry in a schema registry: a URL path pattern and the Zod schema to validate with. */
export interface SchemaEntry {
  /**
   * Matched against the cleaned URL path (query string stripped).
   * - string  → path.includes(pattern)
   * - RegExp  → pattern.test(path)
   */
  pattern: string | RegExp;
  schema: ZodType;
}

/**
 * Build a `validate(path, data)` function from a URL-pattern → Zod schema registry.
 *
 * Call the returned function after every successful fetch. If no pattern matches the
 * path, validation is silently skipped so unregistered endpoints never fail.
 */
export function createSchemaRegistry(
  entries: SchemaEntry[],
  options?: ValidationOptions
): (path: string, data: unknown) => void {
  return function validateRegisteredResponse(path: string, data: unknown): void {
    const cleanPath = path.split("?")[0] ?? path;
    for (const { pattern, schema } of entries) {
      const matched =
        typeof pattern === "string" ? cleanPath.includes(pattern) : pattern.test(cleanPath);
      if (matched) {
        validateApiResponse(schema, data, cleanPath, options);
        return;
      }
    }
  };
}
