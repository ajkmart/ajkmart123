import { statfsSync } from "fs";
import os from "os";
import { logger } from "../logger.js";

/* ══════════════════════════════════════════════════════════════════════════
   responseTime.ts
   In-memory rolling window of the last MAX_SAMPLES request durations (ms).
   Exposes getP95Ms() for health checks and alerting.
   ══════════════════════════════════════════════════════════════════════════ */

const MAX_SAMPLES = 1000;
const samples: number[] = [];

/** Record a completed request duration in milliseconds. */
export function recordResponseTime(ms: number): void {
  if (samples.length >= MAX_SAMPLES) {
    samples.shift();
  }
  samples.push(ms);
}

/**
 * Return the p95 response time across the rolling window, or null if
 * fewer than 10 samples have been collected (not yet meaningful).
 */
export function getP95Ms(): number | null {
  if (samples.length < 10) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return Math.round(sorted[Math.max(0, idx)]!);
}

/** Return current sample count (useful for diagnostics). */
export function getSampleCount(): number {
  return samples.length;
}

/**
 * Return the p50 (median) response time across the rolling window,
 * or null if fewer than 10 samples have been collected.
 */
export function getP50Ms(): number | null {
  if (samples.length < 10) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.5) - 1;
  return Math.round(sorted[Math.max(0, idx)]!);
}

/**
 * Return the p99 response time across the rolling window,
 * or null if fewer than 10 samples have been collected.
 */
export function getP99Ms(): number | null {
  if (samples.length < 10) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.99) - 1;
  return Math.round(sorted[Math.max(0, idx)]!);
}

/* ══════════════════════════════════════════════════════════════════════════
   System metrics — memory & disk
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Heap memory usage as a percentage of total heap.
 * Uses heapUsed / heapTotal so the number reflects GC pressure, not RSS.
 */
export function getMemoryPct(): number {
  const m = process.memoryUsage();
  return Math.round((m.heapUsed / m.heapTotal) * 100);
}

/**
 * RSS memory as a percentage of total OS memory.
 * Gives a better picture of actual system memory pressure.
 */
export function getRssMemoryPct(): number {
  const m = process.memoryUsage();
  const total = os.totalmem();
  if (total === 0) return 0;
  return Math.round((m.rss / total) * 100);
}

/**
 * Disk usage % for the partition containing the given path.
 * Defaults to "/" (the root / data volume).
 * Returns null if statfsSync is unavailable or fails.
 */
export function getDiskPct(mountPath = "/"): number | null {
  try {
    const s = statfsSync(mountPath);
    const used = s.blocks - s.bfree;
    if (s.blocks === 0) return null;
    return Math.round((used / s.blocks) * 100);
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

/** Return disk free bytes for diagnostics. */
export function getDiskFreeGb(mountPath = "/"): number | null {
  try {
    const s = statfsSync(mountPath);
    return Math.round(((s.bavail * s.bsize) / (1024 * 1024 * 1024)) * 10) / 10;
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
