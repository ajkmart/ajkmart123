/**
 * request-context.ts — Per-request AsyncLocalStorage context.
 *
 * Stores a small context object for the lifetime of each HTTP request so any
 * code that runs during that request (route handlers, services, logger calls)
 * can access the request ID, authenticated user, and other fields without
 * threading them through every function signature.
 *
 * Usage:
 *   // In app.ts — mount AFTER pinoHttp, BEFORE routes
 *   app.use(requestContextMiddleware);
 *
 *   // In a route / service after auth middleware has run:
 *   setRequestUser(req.customerId, "customer");
 *
 *   // Anywhere in the call stack:
 *   const log = getLogger();  // picks up requestId, userId, role, ip
 *   log.info("doing something");
 */

import { AsyncLocalStorage } from "async_hooks";
import type { NextFunction, Request, Response } from "express";

export interface RequestContext {
  requestId: string;
  userId?: string;
  role?: string;
  ip: string;
  path: string;
  method: string;
  startMs: number;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

function extractClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"] as string | undefined;
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * Express middleware that creates the AsyncLocalStorage context for the
 * current request. Reads the request ID from the `x-request-id` header
 * (set by pinoHttp's genReqId before this middleware runs) so both systems
 * share the same ID — no second UUID is generated.
 *
 * Mount AFTER pinoHttp (so genReqId has already fired) and BEFORE all routes.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  // pino-http attaches the generated ID to req as a non-standard property;
  // fall back to the response header it set, then generate a fresh one.
  const pinoId = (req as Request & { id?: string }).id;
  const headerId = res.getHeader("x-request-id") as string | undefined;
  const requestId = pinoId ?? headerId ?? crypto.randomUUID();

  // Ensure the header is set on the response regardless of pino-http order.
  res.setHeader("X-Request-ID", requestId);

  const ctx: RequestContext = {
    requestId,
    ip: extractClientIp(req),
    path: req.path,
    method: req.method,
    startMs: Date.now(),
  };

  requestContext.run(ctx, () => next());
}

/**
 * Set the authenticated user on the current request context.
 * Call this from auth middleware after the JWT / session is verified so all
 * subsequent log lines automatically include userId and role.
 */
export function setRequestUser(userId: string, role: string): void {
  const ctx = requestContext.getStore();
  if (ctx) {
    ctx.userId = userId;
    ctx.role = role;
  }
}
