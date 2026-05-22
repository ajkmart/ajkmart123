import { logger } from "../logger.js";
/**
 * Cursor-based pagination utility.
 *
 * Cursors are base64-encoded opaque strings so clients never depend on
 * internal ordering keys.  The value inside can be any sortable scalar
 * (timestamp ISO string, numeric ID, etc.).
 *
 * Usage:
 *   const page = buildCursorPage({
 *     data: rows,
 *     limit,
 *     getCursorValue: (row) => row.createdAt.toISOString(),
 *   });
 *   res.json(page); // { data, nextCursor, hasMore }
 *
 * To continue:
 *   const after = parseCursor(req.query.after);
 *   // apply WHERE createdAt < after in the DB query
 */

/** Encode a plain value into a URL-safe base64 cursor token. */
export function encodeCursor(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

/**
 * Decode a cursor token back to the original string.
 * Returns null if the cursor is missing, empty, or not valid base64url.
 */
export function decodeCursor(cursor: string | undefined | null): string | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
    return decoded || null;
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return null;
  }
}

export interface CursorPageResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface BuildCursorPageOptions<T> {
  /** The rows returned from the DB (fetched with limit+1 to detect hasMore). */
  data: T[];
  /** The page size (the original `limit` from the request — not limit+1). */
  limit: number;
  /** Extract the cursor value from a row (e.g. row.createdAt.toISOString()). */
  getCursorValue: (row: T) => string;
}

/**
 * Build a cursor-paginated response.
 *
 * Callers should fetch `limit + 1` rows from the DB.
 * `buildCursorPage` trims the extra row and uses it to determine `hasMore`.
 */
export function buildCursorPage<T>({
  data,
  limit,
  getCursorValue,
}: BuildCursorPageOptions<T>): CursorPageResult<T> {
  const hasMore = data.length > limit;
  const pageData = hasMore ? data.slice(0, limit) : data;
  const lastRow = pageData[pageData.length - 1];
  const nextCursor = hasMore && lastRow != null ? encodeCursor(getCursorValue(lastRow)) : null;

  return { data: pageData, nextCursor, hasMore };
}
