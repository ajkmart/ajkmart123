/**
 * Idempotency middleware for financial mutation endpoints.
 *
 * Usage:
 *   router.post("/initiate", customerAuth, idempotency("payment"), async (req, res) => { ... })
 *
 * The client must send `X-Idempotency-Key: <uuid>` in the request headers.
 * If the header is absent the middleware is a no-op (passthrough).
 *
 * Key lifecycle:
 *   1. INSERT in-flight marker (responseData = '{}') — atomic, uses ON CONFLICT DO NOTHING.
 *   2. If INSERT returned 0 rows (conflict) → SELECT the existing row:
 *        responseData = '{}'   → another request is processing → 409 Conflict
 *        responseData = <JSON> → prior success → replay stored response
 *   3. On success the handler calls `res.idempotencyResolve(statusCode, body)`
 *      to persist the response and release the lock.
 *   4. On failure (error thrown / non-2xx) the handler calls
 *      `res.idempotencyDelete()` to remove the in-flight marker so the
 *      client can retry with the same key.
 *
 * Scope:
 *   Keys are namespaced as `<prefix>:<rawKey>` to prevent cross-route replay.
 *   TTL is IDEMPOTENCY_TTL_MS (30 min) — stale keys are automatically recycled.
 */

import { db } from "@workspace/db";
import { idempotencyKeysTable } from "@workspace/db/schema";
import { and, eq, gte } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { IDEMPOTENCY_TTL_MS } from "../lib/cleanupIdempotencyKeys.js";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";

declare module "express" {
  interface Response {
    /** Store the successful response body so the next identical request replays it. */
    idempotencyResolve?: (statusCode: number, body: unknown) => Promise<void>;
    /** Remove the in-flight marker so the client may retry after a failure. */
    idempotencyDelete?: () => Promise<void>;
  }
}

/**
 * Returns an Express middleware that enforces idempotency for the given prefix.
 * The calling route must have `customerAuth` applied BEFORE this middleware so
 * `req.customerId` is populated.
 */
export function idempotency(prefix: string) {
  return async function idempotencyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const rawKey =
      typeof req.headers["x-idempotency-key"] === "string"
        ? req.headers["x-idempotency-key"].trim()
        : typeof req.body?.idempotencyKey === "string"
          ? req.body.idempotencyKey.trim()
          : null;

    /* No key supplied — passthrough; the route is not idempotency-protected. */
    if (!rawKey) {
      next();
      return;
    }

    const userId = (req as Request & { customerId?: string }).customerId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const idemKey = `${prefix}:${rawKey}`;
    const ttlCutoff = new Date(Date.now() - IDEMPOTENCY_TTL_MS);

    try {
      /* ── Step 1: atomic INSERT — if it succeeds we exclusively own the key ── */
      const inserted = await db
        .insert(idempotencyKeysTable)
        .values({ id: generateId(), userId, idempotencyKey: idemKey, responseData: "{}" })
        .onConflictDoNothing()
        .returning({ id: idempotencyKeysTable.id });

      if (inserted.length === 0) {
        /* ── Step 2: conflict — check existing row state ── */
        const [existing] = await db
          .select()
          .from(idempotencyKeysTable)
          .where(
            and(
              eq(idempotencyKeysTable.userId, userId),
              eq(idempotencyKeysTable.idempotencyKey, idemKey)
            )
          )
          .limit(1);

        if (!existing) {
          /* Row was deleted (cleanup sweep) between our INSERT and SELECT.
             Re-try once — this closes the narrow race window. */
          const retry = await db
            .insert(idempotencyKeysTable)
            .values({ id: generateId(), userId, idempotencyKey: idemKey, responseData: "{}" })
            .onConflictDoNothing()
            .returning({ id: idempotencyKeysTable.id });

          if (retry.length === 0) {
            res.status(409).json({
              success: false,
              error: "Request already in progress. Please wait and retry.",
            });
            return;
          }
          /* Fall through — we now own the key. */
        } else if (existing.createdAt < ttlCutoff) {
          /* Stale row — delete by PK and re-acquire. */
          await db
            .delete(idempotencyKeysTable)
            .where(
              and(eq(idempotencyKeysTable.id, existing.id), eq(idempotencyKeysTable.userId, userId))
            );

          const reinserted = await db
            .insert(idempotencyKeysTable)
            .values({ id: generateId(), userId, idempotencyKey: idemKey, responseData: "{}" })
            .onConflictDoNothing()
            .returning({ id: idempotencyKeysTable.id });

          if (reinserted.length === 0) {
            /* Another concurrent request beat us after we deleted the stale key. */
            const [fresh] = await db
              .select()
              .from(idempotencyKeysTable)
              .where(
                and(
                  eq(idempotencyKeysTable.userId, userId),
                  eq(idempotencyKeysTable.idempotencyKey, idemKey),
                  gte(idempotencyKeysTable.createdAt, ttlCutoff)
                )
              )
              .limit(1);

            if (!fresh || fresh.responseData === "{}") {
              res.status(409).json({
                success: false,
                error: "Request already in progress. Please wait and retry.",
              });
              return;
            }
            const parsed = safeParseJson(fresh.responseData);
            if (parsed) {
              const { _sc, ...body } = parsed as { _sc?: number; [k: string]: unknown };
              res.status(_sc ?? 200).json(body);
              return;
            }
            res.status(409).json({
              success: false,
              error: "Request already in progress. Please wait and retry.",
            });
            return;
          }
          /* Fall through — we now own the reinserted key. */
        } else if (existing.responseData === "{}") {
          /* Key is within TTL and still in-flight. */
          res
            .status(409)
            .json({ success: false, error: "Request already in progress. Please wait and retry." });
          return;
        } else {
          /* Key is within TTL and has a completed response — replay it. */
          const parsed = safeParseJson(existing.responseData);
          if (parsed) {
            const { _sc, ...body } = parsed as { _sc?: number; [k: string]: unknown };
            logger.info({ userId, idemKey }, "[idempotency] replaying cached response");
            res.status(_sc ?? 200).json(body);
            return;
          }
          /* Corrupt responseData — treat as in-flight. */
          res
            .status(409)
            .json({ success: false, error: "Request already in progress. Please wait and retry." });
          return;
        }
      }

      /* ── We own the key — attach helpers to res and proceed ── */
      res.idempotencyResolve = async (statusCode: number, body: unknown) => {
        const payload = JSON.stringify({ _sc: statusCode, ...(body as object) });
        await db
          .update(idempotencyKeysTable)
          .set({ responseData: payload })
          .where(
            and(
              eq(idempotencyKeysTable.userId, userId),
              eq(idempotencyKeysTable.idempotencyKey, idemKey)
            )
          )
          .catch((e: Error) =>
            logger.warn(
              { userId, idemKey, err: e.message },
              "[idempotency] response persist failed"
            )
          );
      };

      res.idempotencyDelete = async () => {
        await db
          .delete(idempotencyKeysTable)
          .where(
            and(
              eq(idempotencyKeysTable.userId, userId),
              eq(idempotencyKeysTable.idempotencyKey, idemKey)
            )
          )
          .catch((e: Error) =>
            logger.warn({ userId, idemKey, err: e.message }, "[idempotency] key delete failed")
          );
      };

      next();
    } catch (err) {
      logger.error({ err, userId, idemKey }, "[idempotency] middleware error — passing through");
      next();
    }
  };
}

function safeParseJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
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
