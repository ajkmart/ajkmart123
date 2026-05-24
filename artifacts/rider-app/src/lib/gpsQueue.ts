/* GPS offline queue backed by IndexedDB.
   Stores GPS pings that could not be sent due to network unavailability.
   On reconnect, the queue is drained by sending a batch request to the server.

   Also provides a dismissed-request store with a 90-second TTL so that
   request cards the rider hides are still hidden when the tab is reopened
   mid-trip, but automatically re-surface after the request has expired. */

import { validateGpsPing, type GpsPing } from "./gps/validation";

/* Lightweight warn logger that mirrors the project-wide console.warn pattern */
function _warnGps(msg: string, ...args: unknown[]): void {
  console.warn("[gpsQueue]", msg, ...args); // eslint-disable-line no-console
}

/* Last valid ping seen — used by the validator to compute speed between pings.
   Persisted to localStorage so velocity checks survive app restarts (M-07). */
const _LAST_PING_KEY = "_ajkm_lastValidGpsPing";
let _lastValidPing: GpsPing | null = (() => {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(_LAST_PING_KEY);
      if (stored) return JSON.parse(stored) as GpsPing;
    }
  } catch {
    /* Private browsing or storage unavailable — start fresh */
  }
  return null;
})();

/* Exponential-backoff state for batch drain failures.
   On each consecutive non-spoof failure the wait doubles (2 s → 4 s → 8 s → 30 s cap).
   A successful drain or a spoof rejection (permanent) resets the counter. */
let _drainRetryCount = 0;
const DRAIN_BACKOFF_BASE_MS = 2_000;
const DRAIN_BACKOFF_MAX_MS = 30_000;
let _drainBackoffTimer: ReturnType<typeof setTimeout> | null = null;

export interface QueuedPing {
  id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  batteryLevel?: number;
  action?: string | null;
  mockProvider?: boolean;
  suspicious?: boolean;
  suspicionReason?: string;
}

interface DismissedEntry {
  id: string;
  expiresAt: number;
}

const DB_NAME = "ajkmart_gps_queue";
const STORE = "pings";
const DISMISSED = "dismissed";
const DB_VER = 2;

let DISMISSED_TTL_MS = 90_000;

/* ── Configurable limits ───────────────────────────────────────────────────
   Updated at startup from the platform config. Defaults preserve existing
   behaviour when the platform config cannot be fetched. */
let _maxQueueSize = 500;

export function setGpsQueueMax(max: number): void {
  if (Number.isFinite(max) && max > 0) _maxQueueSize = Math.min(Math.floor(max), 10_000);
}

export function setDismissedRequestTtlSec(sec: number): void {
  if (Number.isFinite(sec) && sec > 0) DISMISSED_TTL_MS = Math.min(sec, 86_400) * 1000;
}

/* G3/PF6: Memoize a single IDBDatabase across all callers. Per-call open()
   is wasteful (hundreds of structured-clone handshakes per ride) and serializes
   drain passes behind upgrade transactions. We hold one connection open for
   the lifetime of the tab; if the connection is forcibly closed (versionchange,
   eviction), we reset the cached promise so the next call reopens cleanly.
   IMPORTANT: callers must NOT close this DB after each transaction. */
let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = (event.target as IDBOpenDBRequest).transaction;
      if (tx) {
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB upgrade aborted"));
      }
      try {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
        if (!db.objectStoreNames.contains(DISMISSED)) {
          const ds = db.createObjectStore(DISMISSED, { keyPath: "id" });
          ds.createIndex("expiresAt", "expiresAt", { unique: false });
        }
      } catch (e) {
        if (tx) tx.abort();
        reject(e);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        _dbPromise = null;
      };
      db.onversionchange = () => {
        try {
          db.close();
        } catch (err) {
          console.warn("[artifacts/rider-app/src/lib/gpsQueue.ts]", err);
        }
        _dbPromise = null;
      }; // eslint-disable-line no-console
      resolve(db);
    };
    req.onerror = () => {
      _dbPromise = null;
      reject(req.error);
    };
  }).catch((err) => {
    _dbPromise = null;
    throw err;
  });
  return _dbPromise;
}

export async function enqueue(ping: QueuedPing): Promise<void> {
  const result = validateGpsPing(_lastValidPing, {
    timestamp: ping.timestamp,
    latitude: ping.latitude,
    longitude: ping.longitude,
    accuracy: ping.accuracy,
    speed: ping.speed,
    heading: ping.heading,
    isMockProvider: ping.mockProvider,
  });
  if (!result.valid) {
    /* Log the drop so on-device diagnostics (DevTools / Sentry) can surface
       spoofing or sensor anomalies without hitting the server. */
    _warnGps("ping rejected — not enqueued", {
      reason: result.reason,
      lat: ping.latitude,
      lng: ping.longitude,
      mock: ping.mockProvider,
    });
    return;
  }

  /* Propagate suspicious metadata so the batch payload carries the flag
     and the backend can audit or alert on it. */
  if (result.suspicious) {
    ping = { ...ping, suspicious: true, suspicionReason: result.suspicionReason };
  }

  _lastValidPing = {
    timestamp: ping.timestamp,
    latitude: ping.latitude,
    longitude: ping.longitude,
    accuracy: ping.accuracy,
    speed: ping.speed,
    heading: ping.heading,
    isMockProvider: ping.mockProvider,
  };
  /* M-07: Persist the last valid ping so speed/velocity checks survive
     app restarts and page reloads (cold-start false-positive prevention). */
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(_LAST_PING_KEY, JSON.stringify(_lastValidPing));
    }
  } catch {
    /* Private browsing or storage quota exhausted — non-critical */
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const countReq = store.count();
      /* G3/PF6: Cached connection — do NOT call db.close() in tx callbacks. */
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      countReq.onsuccess = () => {
        if (countReq.result >= _maxQueueSize) {
          const idx = store.index("timestamp");
          const cursorReq = idx.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              /* G2: Wait for delete to complete before put — sequencing
                 these in the same onsuccess broke older Firefox builds. */
              const delReq = cursor.delete();
              delReq.onsuccess = () => {
                store.put(ping);
              };
              delReq.onerror = () => tx.abort();
            } else {
              tx.abort();
            }
          };
          cursorReq.onerror = () => tx.abort();
        } else {
          store.put(ping);
        }
      };
      countReq.onerror = () => tx.abort();
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/gpsQueue.ts]", err);
  } // eslint-disable-line no-console
}

export async function dequeueAll(): Promise<QueuedPing[]> {
  try {
    const db = await openDB();
    return await new Promise<QueuedPing[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const index = store.index("timestamp");
      const req = index.getAll();
      req.onsuccess = () => resolve((req.result ?? []) as QueuedPing[]);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/gpsQueue.ts]", err);
    return [];
  } // eslint-disable-line no-console
}

export async function clearQueue(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      ids.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/gpsQueue.ts]", err);
  } // eslint-disable-line no-console
}

export async function queueSize(): Promise<number> {
  try {
    const db = await openDB();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/gpsQueue.ts]", err);
    return 0;
  } // eslint-disable-line no-console
}

/* ── Dismissed-request store ──────────────────────────────────────────────────
   Persists dismissed request IDs across tab close with a 90-second TTL.
   On read, expired entries are purged automatically so the store stays small. */

export async function addDismissed(id: string): Promise<void> {
  try {
    const db = await openDB();
    const entry: DismissedEntry = { id, expiresAt: Date.now() + DISMISSED_TTL_MS };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DISMISSED, "readwrite");
      tx.objectStore(DISMISSED).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/gpsQueue.ts]", err);
  } // eslint-disable-line no-console
}

export async function removeDismissed(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DISMISSED, "readwrite");
      tx.objectStore(DISMISSED).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/gpsQueue.ts]", err);
  } // eslint-disable-line no-console
}

export async function loadDismissed(): Promise<Set<string>> {
  try {
    const db = await openDB();
    const now = Date.now();
    const entries = await new Promise<DismissedEntry[]>((resolve, reject) => {
      const tx = db.transaction(DISMISSED, "readonly");
      const req = tx.objectStore(DISMISSED).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as DismissedEntry[]);
      req.onerror = () => reject(req.error);
    });
    const valid = entries.filter((e) => e.expiresAt > now);
    const expired = entries.filter((e) => e.expiresAt <= now);
    if (expired.length) {
      void purgeExpiredDismissed(expired.map((e) => e.id));
    }
    return new Set(valid.map((e) => e.id));
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/gpsQueue.ts]", err);
    return new Set();
  } // eslint-disable-line no-console
}

/** Purge expired entries from the dismissed store (fire-and-forget) */
async function purgeExpiredDismissed(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DISMISSED, "readwrite");
      const store = tx.objectStore(DISMISSED);
      ids.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/gpsQueue.ts]", err);
  } // eslint-disable-line no-console
}

/**
 * Sweep the dismissed store for expired entries and return the current valid set.
 * Call this on tab re-focus (visibilitychange) so stale dismissals don't hide
 * newly-arrived requests after the TTL has elapsed.
 */
export async function sweepAndLoadDismissed(): Promise<Set<string>> {
  return loadDismissed();
}

export async function clearAllDismissed(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DISMISSED, "readwrite");
      tx.objectStore(DISMISSED).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/gpsQueue.ts]", err);
  } // eslint-disable-line no-console
}

/* ── Drain handler ────────────────────────────────────────────────────────────
   The drain function calls the registered batch-upload callback.
   If the server responds with GPS_SPOOF_DETECTED (HTTP 422), those pings
   are dropped from the queue permanently — never re-queued.
   Any other error leaves the pings in the queue to retry on the next
   online event. */

let _drainFn: ((pings: QueuedPing[]) => Promise<void>) | null = null;
let _draining = false;

export function registerDrainHandler(fn: (pings: QueuedPing[]) => Promise<void>): () => void {
  _drainFn = fn;
  if (typeof navigator !== "undefined" && navigator.onLine) {
    void drainQueue();
  }
  return () => {
    if (_drainFn === fn) _drainFn = null;
  };
}

async function drainQueue(): Promise<void> {
  if (_draining || !_drainFn) return;
  _draining = true;
  try {
    const pings = await dequeueAll();
    if (pings.length === 0) return;
    const CHUNK = 100;
    for (let i = 0; i < pings.length; i += CHUNK) {
      const chunk = pings.slice(i, i + CHUNK);
      try {
        await _drainFn(chunk);
        await clearQueue(chunk.map((p) => p.id));
        _drainRetryCount = 0; // reset backoff on each successful chunk
      } catch (rawErr: unknown) {
        const err = rawErr as Record<string, unknown>;
        const responseData = err.responseData as Record<string, unknown> | undefined;
        const responseDataNested = responseData?.data as Record<string, unknown> | undefined;
        const isSpoofRejection =
          err.code === "GPS_SPOOF_DETECTED" ||
          responseData?.code === "GPS_SPOOF_DETECTED" ||
          responseDataNested?.code === "GPS_SPOOF_DETECTED" ||
          err.spoofDetected === true;
        if (isSpoofRejection) {
          _warnGps("batch rejected as spoof — discarding chunk", chunk.length, "pings");
          await clearQueue(chunk.map((p) => p.id));
          _drainRetryCount = 0; // reset backoff on permanent rejection
          continue;
        }
        /* G1: For non-spoof transient failures (network/5xx), keep the rest of
           the queue in IDB for the next online event but do NOT abandon the
           remaining chunks of this drain pass — they are independent batches
           and may succeed where the failed one didn't.
           Apply exponential backoff before the next drain attempt so we don't
           hammer a struggling server. */
        _drainRetryCount += 1;
        const backoffMs = Math.min(
          DRAIN_BACKOFF_BASE_MS * 2 ** (_drainRetryCount - 1),
          DRAIN_BACKOFF_MAX_MS
        );
        _warnGps(`batch drain failed (attempt ${_drainRetryCount}) — retry in ${backoffMs}ms`);
        if (_drainBackoffTimer != null) clearTimeout(_drainBackoffTimer);
        _drainBackoffTimer = setTimeout(() => {
          _drainBackoffTimer = null;
          void drainQueue();
        }, backoffMs);
        /* M-08: Break instead of continue — remaining chunks stay in IDB and
           will be retried on the next backoff cycle. Hammering a struggling
           server with all remaining chunks in the same pass amplifies load. */
        break;
      }
    }
  } catch (err) {
    _warnGps("drainQueue outer catch", err);
  } finally {
    _draining = false;
    /* NOTE: _drainRetryCount is intentionally NOT reset here.
       It is only reset inside the chunk-level try block (on success) or on a
       spoof rejection (permanent). This ensures the backoff delay truly
       doubles across consecutive failed drain passes:
         pass 1 fails → count=1 → retry in 2 s
         pass 2 fails → count=2 → retry in 4 s
         pass 3 fails → count=3 → retry in 8 s … cap 30 s */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => drainQueue());
}

/** Trigger an immediate drain of all buffered GPS pings (e.g. on socket reconnect).
 *  Safe to call multiple times — a concurrent drain is a no-op. */
export function batchDrainGpsQueue(): void {
  void drainQueue();
}

/**
 * Reset all module-level state.  ONLY for use in unit tests — never call
 * this in production code.  Clears the cached IDB connection, the drain
 * handler registration, the in-flight drain lock, the last-valid-ping
 * sentinel used for speed-check continuity, and the backoff counter.
 */
export function _resetGpsQueueForTesting(): void {
  if (_dbPromise !== null) {
    /* Trigger the onclose path so the IDBDatabase object (if already
       resolved) fires its own onclose callback — which sets _dbPromise=null
       again harmlessly.  We force-null first so any concurrent open() call
       that races this reset starts fresh. */
    _dbPromise = null;
  }
  _drainFn = null;
  _draining = false;
  _lastValidPing = null;
  _drainRetryCount = 0;
  if (_drainBackoffTimer !== null) {
    clearTimeout(_drainBackoffTimer);
    _drainBackoffTimer = null;
  }
}
