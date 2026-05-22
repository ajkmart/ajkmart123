import { Router, type IRouter } from "express";
import { getDiskPct, getMemoryPct, getP95Ms, getSampleCount } from "../lib/metrics/responseTime.js";
import { sendSuccess } from "../lib/response.js";
import { adminAuth } from "./admin-shared.js";

const router: IRouter = Router();

/**
 * GET /api/metrics
 * Admin-only endpoint returning real-time system performance metrics.
 * Safe to poll frequently — all values are computed in-process (no DB query).
 *
 * Response shape:
 *   p95ResponseTimeMs  — p95 response time across the last 1000 requests, or null if < 10 samples
 *   memoryPct          — heap used / heap total as a percentage (GC pressure indicator)
 *   diskPct            — disk used / total for the root partition, or null if unavailable
 *   requestCount       — total samples in the rolling window (max 1000)
 *   timestamp          — ISO-8601 timestamp of this reading
 */
router.get("/", adminAuth, (_req, res) => {
  sendSuccess(res, {
    p95ResponseTimeMs: getP95Ms(),
    memoryPct: getMemoryPct(),
    diskPct: getDiskPct(),
    requestCount: getSampleCount(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
