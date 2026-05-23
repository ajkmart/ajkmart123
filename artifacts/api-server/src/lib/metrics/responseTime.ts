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

/* ── Disk stats cache ────────────────────────────────────────────────────
   getDiskPct() and getDiskFreeGb() both called statfsSync("/") separately,
   doubling the syscall cost on every health probe. getDiskStats() calls
   statfsSync once per TTL window and memoises both values together.        */

interface DiskStats {
  pct: number | null;
  freeGb: number | null;
}

const DISK_TTL_MS = 10_000; // 10 second TTL — filesystem stats are stable
let _diskCache: DiskStats = { pct: null, freeGb: null };
let _diskCachedAt = 0;

/**
 * Returns disk used-% and free-GB for the root partition.
 * Calls statfsSync exactly once per 10-second window. Subsequent calls
 * within the window return the cached value without a syscall.
 */
export function getDiskStats(mountPath = "/"): DiskStats {
  const now = Date.now();
  if (now - _diskCachedAt < DISK_TTL_MS) return _diskCache;

  try {
    const s = statfsSync(mountPath);
    const used = s.blocks - s.bfree;
    const pct = s.blocks === 0 ? null : Math.round((used / s.blocks) * 100);
    const freeGb = Math.round(((s.bavail * s.bsize) / 1_073_741_824) * 10) / 10;
    _diskCache = { pct, freeGb };
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      "[metrics] statfsSync failed — returning null disk stats"
    );
    _diskCache = { pct: null, freeGb: null };
  }

  _diskCachedAt = now;
  return _diskCache;
}

/**
 * Disk usage % for the partition containing the given path.
 * @deprecated Use getDiskStats() to avoid a double statfsSync call.
 */
export function getDiskPct(mountPath = "/"): number | null {
  return getDiskStats(mountPath).pct;
}

/**
 * Disk free GB for the partition containing the given path.
 * @deprecated Use getDiskStats() to avoid a double statfsSync call.
 */
export function getDiskFreeGb(mountPath = "/"): number | null {
  return getDiskStats(mountPath).freeGb;
}
