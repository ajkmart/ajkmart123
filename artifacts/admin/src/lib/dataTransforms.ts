import type { ApiPaginated } from "./adminApiTypes";

/**
 * Safely normalises any backend response into an ApiPaginated<T> shape.
 * Handles cases where the backend omits `total` or wraps items under
 * different keys (e.g. `data`, `results`).
 */
export function normalizePaginated<T>(res: unknown): ApiPaginated<T> {
  if (res == null || res === undefined || typeof res !== "object") {
    return { items: [], total: 0 };
  }

  const r = res as Record<string, unknown>;

  const items: T[] = Array.isArray(r.items)
    ? (r.items as T[])
    : Array.isArray(r.data)
      ? (r.data as T[])
      : Array.isArray(r.results)
        ? (r.results as T[])
        : Array.isArray(res)
          ? (res as T[])
          : [];

  const total =
    typeof r.total === "number" ? r.total : typeof r.count === "number" ? r.count : items.length;

  return {
    items,
    total,
    page: typeof r.page === "number" ? r.page : undefined,
    pageSize:
      typeof r.pageSize === "number"
        ? r.pageSize
        : typeof r.limit === "number"
          ? r.limit
          : undefined,
    hasMore: typeof r.hasMore === "boolean" ? r.hasMore : undefined,
  };
}

/**
 * Converts a partial object (from an API response or DB row) into safe form
 * defaults by replacing null/undefined values with empty strings or 0 for
 * numbers, so controlled inputs never receive null.
 *
 * Pass a `schema` record to constrain which keys are included and what their
 * default type should be (use `""` for string, `0` for number, `false` for
 * boolean).
 */
export function toFormDefaults<T extends Record<string, unknown>>(
  obj: Partial<T>,
  schema?: Partial<Record<keyof T, string | number | boolean>>
): T {
  const base = schema ? { ...schema } : { ...obj };
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(base)) {
    const raw = (obj as Record<string, unknown>)[key];
    const schemaDefault = schema ? (schema as Record<string, unknown>)[key] : undefined;

    if (raw == null || raw === undefined) {
      if (typeof schemaDefault === "number") {
        result[key] = 0;
      } else if (typeof schemaDefault === "boolean") {
        result[key] = false;
      } else {
        result[key] = "";
      }
    } else {
      result[key] = raw;
    }
  }

  if (!schema) {
    for (const key of Object.keys(obj)) {
      if (!(key in result)) {
        const raw = (obj as Record<string, unknown>)[key];
        result[key] = raw == null || raw === undefined ? "" : raw;
      }
    }
  }

  return result as T;
}

/**
 * Returns only the fields that differ between `original` and `updated`.
 * Useful for PATCH calls — sends only changed fields instead of the whole
 * object, reducing payload size and avoiding accidental overwrites.
 *
 * Comparison is shallow (strict equality). For nested objects, include
 * the whole nested object when any field inside it changes.
 */
export function pickChanged<T extends Record<string, unknown>>(
  original: T,
  updated: T
): Partial<T> {
  const changed: Partial<T> = {};
  const allKeys = new Set([...Object.keys(original), ...Object.keys(updated)]) as Set<keyof T>;

  for (const key of allKeys) {
    if (original[key] !== updated[key]) {
      changed[key] = updated[key];
    }
  }

  return changed;
}
