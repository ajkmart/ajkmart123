/**
 * sanitize.ts — Server-side XSS input sanitisation via DOMPurify + jsdom.
 *
 * Uses a single shared JSDOM window to initialise DOMPurify once at startup.
 * The window is never exposed to untrusted code — it is only used as a DOM
 * implementation for DOMPurify's HTML parser.
 *
 * Sanitisation rules:
 *  - ALL HTML tags stripped (ALLOWED_TAGS: [])
 *  - ALL HTML attributes stripped (ALLOWED_ATTR: [])
 *  - Net effect: plain-text values only — no embedded scripts, events, or markup.
 *
 * Applies recursively to every string value in req.body (including nested
 * objects and arrays) so a single middleware call covers all endpoints.
 *
 * Skipped for non-object bodies (e.g. raw binary uploads — those routes use
 * multer and never reach express.json()).
 */

import DOMPurify from "dompurify";
import type { NextFunction, Request, Response } from "express";
import { JSDOM } from "jsdom";

// jsdom's Window type doesn't fully satisfy DOMPurify's WindowLike interface
// at the TypeScript level; the cast is safe because jsdom implements every
// property DOMPurify actually uses at runtime.
const { window: jsdomWindow } = new JSDOM("");
const purify = DOMPurify(jsdomWindow as unknown as typeof globalThis);

/**
 * Recursively sanitise every string leaf in `value`.
 * Non-string primitives and null are returned unchanged.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return purify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeValue(v)])
    );
  }
  return value;
}

/**
 * Express middleware that sanitises `req.body` in-place before the request
 * reaches any route handler.
 *
 * Mount AFTER body parsers (express.json / express.urlencoded) and BEFORE
 * the API router so all downstream handlers receive clean input.
 */
export function sanitizeBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body) as typeof req.body;
  }
  next();
}
