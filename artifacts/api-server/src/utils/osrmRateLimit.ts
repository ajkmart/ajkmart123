import type { Response } from "express";
import { sendError } from "../lib/response.js";

/**
 * Handles a 429 (Too Many Requests) response from an upstream OSRM server
 * by passing the status and Retry-After header through to the client.
 *
 * Returns true if the 429 was handled (caller should return immediately).
 * Returns false for any other status so normal processing can continue.
 *
 * Security fix: OSRM rate-limit responses must be surfaced to the caller
 * with the correct status code and Retry-After hint rather than being
 * swallowed or replaced with a generic 5xx.
 */
export function handleOsrmRateLimit(
  upstreamStatus: number,
  getRetryAfterHeader: () => string | null,
  res: Response
): boolean {
  if (upstreamStatus !== 429) return false;

  const retryAfter = getRetryAfterHeader() ?? "60";
  res.setHeader("Retry-After", retryAfter);
  sendError(res, "Routing service rate limit reached, please retry later", 429);
  return true;
}
