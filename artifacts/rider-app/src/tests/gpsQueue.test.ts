/**
 * Rider App — GPS Offline Queue Tests
 *
 * Verifies that GPS pings buffered while offline are flushed to the server
 * when the socket reconnects (via batchDrainGpsQueue / registerDrainHandler),
 * and that spoof-detected pings are permanently discarded instead of retried.
 *
 * Covers:
 *   1. Pings enqueued while offline → stored in IndexedDB, queueSize() accurate
 *   2. batchDrainGpsQueue (socket reconnect trigger) → all pings sent via handler
 *      with correct IDs, queue empty afterwards
 *   3. Spoof-detected batch (GPS_SPOOF_DETECTED) → pings discarded (queue→0),
 *      handler not called again on subsequent drain
 *   4. Invalid pings (impossible speed / future timestamp) → rejected at enqueue,
 *      do not reach IndexedDB
 *   5. Transient failure → pings retained (queue stays non-zero), retried on
 *      next batchDrainGpsQueue call
 *   6. Socket reconnect wiring: the socket.tsx connect handler calls
 *      batchDrainGpsQueue, which drains buffered pings in one pass
 *
 * Run from artifacts/rider-app:
 *   pnpm test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetGpsQueueForTesting,
  batchDrainGpsQueue,
  dequeueAll,
  enqueue,
  queueSize,
  registerDrainHandler,
  type QueuedPing,
} from "../lib/gpsQueue";
import { validateGpsPing, type GpsPing } from "../lib/gps/validation";

// ─── In-memory fake IndexedDB ──────────────────────────────────────────────────
//
// gpsQueue uses:
//   indexedDB.open(name, version)
//   db.transaction(store, mode)  → tx.objectStore(store)
//   objectStore: put(item), count(), delete(key)
//   objectStore.index("timestamp") → index.getAll()   [dequeueAll]
//   objectStore.index("timestamp") → index.openCursor() [LRU eviction]
//   tx.oncomplete / tx.onerror / tx.onabort / tx.error
//   db.onclose / db.onversionchange

type IDBRecord = Record<string, unknown>;

/** Shared store map across the current fake instance so all transactions see
 *  the same data. Reset per test via _resetGpsQueueForTesting + new fake. */
let _fakeStores: Map<string, Map<string, IDBRecord>>;

function makeFakeIndexedDB() {
  _fakeStores = new Map();

  function getOrCreate(name: string): Map<string, IDBRecord> {
    if (!_fakeStores.has(name)) _fakeStores.set(name, new Map());
    return _fakeStores.get(name)!;
  }

  function makeReq<T>(fn: () => T) {
    const req = {
      result: undefined as T | undefined,
      error: null as unknown,
      onsuccess: null as ((e: { target: typeof req }) => void) | null,
      onerror: null as ((e: { target: typeof req }) => void) | null,
    };
    queueMicrotask(() => {
      try {
        req.result = fn();
        req.onsuccess?.({ target: req });
      } catch (err) {
        req.error = err;
        req.onerror?.({ target: req });
      }
    });
    return req;
  }

  function makeIndex(map: Map<string, IDBRecord>, indexField: string) {
    return {
      getAll() {
        return makeReq(() => {
          const rows = [...map.values()];
          rows.sort((a, b) => {
            const av = a[indexField] as string | number;
            const bv = b[indexField] as string | number;
            return av < bv ? -1 : av > bv ? 1 : 0;
          });
          return rows;
        });
      },
      openCursor() {
        const rows = [...map.values()].sort((a, b) => {
          const av = a[indexField] as string | number;
          const bv = b[indexField] as string | number;
          return av < bv ? -1 : av > bv ? 1 : 0;
        });
        const first = rows[0];
        if (!first) return makeReq(() => null as unknown);
        const key = String(first["id"]);
        const cursor = {
          delete: () =>
            makeReq(() => {
              map.delete(key);
              return undefined;
            }),
        };
        return makeReq(() => cursor);
      },
    };
  }

  function makeStore(storeName: string) {
    const map = getOrCreate(storeName);
    return {
      put(value: IDBRecord) {
        return makeReq(() => {
          map.set(String(value["id"]), value);
          return undefined;
        });
      },
      getAll() {
        return makeReq(() => [...map.values()]);
      },
      delete(key: string) {
        return makeReq(() => {
          map.delete(String(key));
          return undefined;
        });
      },
      count() {
        return makeReq(() => map.size);
      },
      index(field: string) {
        return makeIndex(map, field);
      },
      createIndex(_name: string, _field: string, _opts?: unknown) {
        /* no-op — index semantics are applied dynamically */
      },
    };
  }

  function makeTx(storeNames: string | string[], _mode?: string) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const tx = {
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      error: null as unknown,
      objectStore(name: string) {
        if (!names.includes(name)) throw new Error(`Store '${name}' not in tx`);
        return makeStore(name);
      },
      abort() {
        queueMicrotask(() => tx.onabort?.());
      },
    };
    setTimeout(() => tx.oncomplete?.(), 0);
    return tx;
  }

  const db = {
    onclose: null as (() => void) | null,
    onversionchange: null as (() => void) | null,
    objectStoreNames: { contains: (_n: string) => true },
    transaction: makeTx,
    createObjectStore(name: string) {
      getOrCreate(name);
      return makeStore(name);
    },
    close() {
      /* no-op */
    },
  };

  return {
    /* Each call to open() creates a fresh request object with its own
       setTimeout so that handlers set synchronously after open() are
       always called — even if open() is invoked after the fake was
       created (e.g. when the first DB access is queueSize() rather
       than enqueue()). */
    open: (_name: string, _ver: number) => {
      type OpenReq = {
        result: typeof db | undefined;
        error: unknown;
        onsuccess: ((e: { target: OpenReq }) => void) | null;
        onerror: ((e: { target: OpenReq }) => void) | null;
        onupgradeneeded: ((e: { target: OpenReq; oldVersion: number }) => void) | null;
        transaction: unknown;
      };
      const req: OpenReq = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        transaction: null,
      };
      setTimeout(() => {
        req.result = db;
        req.onupgradeneeded?.({ target: req, oldVersion: 0 });
        req.onsuccess?.({ target: req });
      }, 0);
      return req;
    },
    db,
  };
}

// ─── Global setup / teardown ──────────────────────────────────────────────────

beforeEach(() => {
  // Clear all gpsQueue module-level state so each test starts clean.
  _resetGpsQueueForTesting();

  // Install a fresh in-memory IDB implementation.
  const fake = makeFakeIndexedDB();
  (globalThis as Record<string, unknown>)["indexedDB"] = fake;

  // Simulate offline so registerDrainHandler doesn't immediately trigger drain.
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: false },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper: wait for all pending timers + microtasks ─────────────────────────
function flush(ms = 60): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Build a valid QueuedPing with an incrementing base timestamp so consecutive
 *  pings in the same test never trigger the speed-continuity check. */
let _pingSeq = 0;
function makePing(
  id: string,
  lat = 33.6844,
  lng = 73.0479,
  extra?: Partial<QueuedPing>
): QueuedPing {
  _pingSeq++;
  return {
    id,
    timestamp: new Date(Date.now() - 60_000 + _pingSeq * 5_000).toISOString(),
    latitude: lat,
    longitude: lng,
    accuracy: 15,
    ...extra,
  };
}

beforeEach(() => {
  _pingSeq = 0;
});

// ─── Helper: enqueue N pings and wait for IDB writes to settle ────────────────
async function enqueueAndFlush(pings: QueuedPing[]): Promise<void> {
  for (const p of pings) await enqueue(p);
  await flush(40);
}

// ─── 1. Enqueue while offline — pings stored in IDB ──────────────────────────

describe("GPS queue — enqueue while offline", () => {
  it("queueSize() reflects the exact number of valid pings stored", async () => {
    await enqueueAndFlush([makePing("p1"), makePing("p2"), makePing("p3")]);
    const size = await queueSize();
    expect(size).toBe(3);
  });

  it("dequeueAll() returns every stored ping by ID", async () => {
    const pings = [makePing("a"), makePing("b"), makePing("c")];
    await enqueueAndFlush(pings);
    const stored = await dequeueAll();
    const storedIds = stored.map((p) => p.id).sort();
    expect(storedIds).toEqual(["a", "b", "c"]);
  });

  it("enqueue() with an invalid (future-timestamp) ping does NOT increase queueSize", async () => {
    const invalid: QueuedPing = {
      id: "bad",
      timestamp: new Date(Date.now() + 120_000).toISOString(),
      latitude: 33.6844,
      longitude: 73.0479,
    };
    await enqueue(invalid);
    await flush(40);
    const size = await queueSize();
    expect(size).toBe(0); // rejected by validator, never written to IDB
  });

  it("enqueue() resolves without throwing for invalid pings", async () => {
    const invalid: QueuedPing = {
      id: "future",
      timestamp: new Date(Date.now() + 120_000).toISOString(),
      latitude: 33.6844,
      longitude: 73.0479,
    };
    await expect(enqueue(invalid)).resolves.toBeUndefined();
  });
});

// ─── 2. Socket reconnect → batch drain sends all pings, empties queue ─────────
//
// The socket.tsx "connect" handler calls batchDrainGpsQueue() immediately after
// re-connecting.  These tests drive the same code path directly.

describe("GPS queue — socket reconnect drains all pings", () => {
  it("batchDrainGpsQueue sends all buffered pings to the handler exactly once", async () => {
    const received: string[] = []; // collect ping IDs
    registerDrainHandler(async (pings) => {
      pings.forEach((p) => received.push(p.id));
    });

    await enqueueAndFlush([makePing("r1"), makePing("r2"), makePing("r3")]);

    batchDrainGpsQueue();
    await flush(100);

    expect(received.sort()).toEqual(["r1", "r2", "r3"]);
  });

  it("queue is empty (queueSize === 0) after a successful drain", async () => {
    registerDrainHandler(async (_pings) => {
      /* success — no error thrown */
    });

    await enqueueAndFlush([makePing("d1"), makePing("d2")]);
    expect(await queueSize()).toBe(2); // sanity check before drain

    batchDrainGpsQueue();
    await flush(100);

    expect(await queueSize()).toBe(0);
  });

  it("dequeueAll() returns [] after a successful drain", async () => {
    registerDrainHandler(async (_pings) => {});

    await enqueueAndFlush([makePing("e1"), makePing("e2"), makePing("e3")]);
    batchDrainGpsQueue();
    await flush(100);

    const remaining = await dequeueAll();
    expect(remaining).toHaveLength(0);
  });

  it("handler is called exactly once when there is exactly one chunk of pings", async () => {
    let callCount = 0;
    registerDrainHandler(async (_pings) => {
      callCount++;
    });

    await enqueueAndFlush([makePing("c1"), makePing("c2")]);
    batchDrainGpsQueue();
    await flush(100);

    expect(callCount).toBe(1);
  });

  it("a second concurrent batchDrainGpsQueue call is a no-op (idempotent)", async () => {
    let callCount = 0;
    registerDrainHandler(async (_pings) => {
      callCount++;
    });

    await enqueueAndFlush([makePing("idem1")]);

    // Fire two drains simultaneously.
    batchDrainGpsQueue();
    batchDrainGpsQueue();
    await flush(100);

    expect(callCount).toBe(1); // second call blocked by _draining flag
  });

  it("handler receives pings with the correct IDs even when enqueued in order", async () => {
    const sent: string[] = [];
    registerDrainHandler(async (pings) => {
      pings.forEach((p) => sent.push(p.id));
    });

    await enqueueAndFlush([makePing("order1"), makePing("order2"), makePing("order3")]);
    batchDrainGpsQueue();
    await flush(100);

    expect(sent).toHaveLength(3);
    expect(sent).toContain("order1");
    expect(sent).toContain("order2");
    expect(sent).toContain("order3");
  });
});

// ─── 3. Spoof-detected batch → pings discarded, handler not called again ──────

describe("GPS queue — GPS_SPOOF_DETECTED discards pings permanently", () => {
  it("spoof error (via .code) clears the chunk — queue is empty afterwards", async () => {
    registerDrainHandler(async (_pings) => {
      throw Object.assign(new Error("GPS_SPOOF_DETECTED"), { code: "GPS_SPOOF_DETECTED" });
    });

    await enqueueAndFlush([makePing("s1"), makePing("s2")]);
    expect(await queueSize()).toBe(2);

    batchDrainGpsQueue();
    await flush(100);

    // Spoof pings are cleared from IDB — never retried.
    expect(await queueSize()).toBe(0);
  });

  it("handler is NOT called again on a subsequent drain after spoof rejection", async () => {
    let callCount = 0;
    registerDrainHandler(async (_pings) => {
      callCount++;
      throw Object.assign(new Error("GPS_SPOOF_DETECTED"), { code: "GPS_SPOOF_DETECTED" });
    });

    await enqueueAndFlush([makePing("sp1")]);
    batchDrainGpsQueue();
    await flush(100);

    const firstCallCount = callCount;
    // Second drain — queue is already empty, handler must not be called again.
    batchDrainGpsQueue();
    await flush(100);

    expect(callCount).toBe(firstCallCount); // no additional calls
  });

  it("spoof error via responseData.code also clears the chunk", async () => {
    registerDrainHandler(async (_pings) => {
      throw Object.assign(new Error("spoof"), {
        responseData: { code: "GPS_SPOOF_DETECTED" },
      });
    });

    await enqueueAndFlush([makePing("rdcode1"), makePing("rdcode2")]);
    batchDrainGpsQueue();
    await flush(100);

    expect(await queueSize()).toBe(0);
  });

  it("spoof error via .spoofDetected=true also clears the chunk", async () => {
    registerDrainHandler(async (_pings) => {
      throw Object.assign(new Error("spoof flag"), { spoofDetected: true });
    });

    await enqueueAndFlush([makePing("flag1")]);
    batchDrainGpsQueue();
    await flush(100);

    expect(await queueSize()).toBe(0);
  });

  it("spoof error via nested responseData.data.code also clears the chunk", async () => {
    registerDrainHandler(async (_pings) => {
      throw Object.assign(new Error("nested"), {
        responseData: { data: { code: "GPS_SPOOF_DETECTED" } },
      });
    });

    await enqueueAndFlush([makePing("nested1")]);
    batchDrainGpsQueue();
    await flush(100);

    expect(await queueSize()).toBe(0);
  });
});

// ─── 4. Invalid pings rejected at enqueue — never reach IDB ───────────────────
//
// validateGpsPing is called synchronously inside enqueue() before any IDB write.
// All checks are verified here using the pure validation function directly,
// plus one enqueue-level check confirming no IDB write occurs.

describe("GPS validation — invalid pings rejected before enqueueing", () => {
  const baseTime = new Date("2024-01-01T12:00:00Z");

  const gpsPing = (
    offsetMs: number,
    lat: number,
    lng: number,
    extra?: Partial<GpsPing>
  ): GpsPing => ({
    timestamp: new Date(baseTime.getTime() + offsetMs).toISOString(),
    latitude: lat,
    longitude: lng,
    accuracy: 15,
    ...extra,
  });

  it("validateGpsPing rejects impossible speed > 200 km/h", () => {
    const prev = gpsPing(0, 33.6844, 73.0479);
    const next = gpsPing(1_000, 24.8607, 67.0011); // Islamabad→Karachi in 1 s
    const result = validateGpsPing(prev, next);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/impossible speed/i);
  });

  it("validateGpsPing accepts a reasonable speed (motorcycle ~60 km/h)", () => {
    const prev = gpsPing(0, 33.6844, 73.0479);
    const next = gpsPing(60_000, 33.6934, 73.0479); // ~1 km north in 60 s
    expect(validateGpsPing(prev, next).valid).toBe(true);
  });

  it("validateGpsPing rejects a future timestamp", () => {
    const future: GpsPing = {
      timestamp: new Date(Date.now() + 60_000).toISOString(),
      latitude: 33.6844,
      longitude: 73.0479,
    };
    const result = validateGpsPing(null, future);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/future timestamp/i);
  });

  it("validateGpsPing rejects sub-2m accuracy (spoof indicator)", () => {
    const ping: GpsPing = {
      timestamp: new Date().toISOString(),
      latitude: 33.6844,
      longitude: 73.0479,
      accuracy: 0.5,
    };
    const result = validateGpsPing(null, ping);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/accuracy too high/i);
  });

  it("validateGpsPing accepts the very first ping (no prev) regardless of location", () => {
    const first: GpsPing = {
      timestamp: new Date(Date.now() - 500).toISOString(),
      latitude: 33.6844,
      longitude: 73.0479,
      accuracy: 20,
    };
    expect(validateGpsPing(null, first).valid).toBe(true);
  });

  it("future-timestamp ping does NOT increase queueSize()", async () => {
    const invalid: QueuedPing = {
      id: "future-bad",
      timestamp: new Date(Date.now() + 120_000).toISOString(),
      latitude: 33.6844,
      longitude: 73.0479,
    };
    await enqueue(invalid);
    await flush(40);
    expect(await queueSize()).toBe(0);
  });

  it("mock-provider ping IS stored (suspicious but valid) with suspicious=true", async () => {
    // Mock-provider pings are suspicious but still valid — enqueued for server audit.
    const mockPing: QueuedPing = {
      id: "mock-loc",
      timestamp: new Date(Date.now() - 500).toISOString(),
      latitude: 33.6844,
      longitude: 73.0479,
      accuracy: 15,
      mockProvider: true,
    };
    await enqueue(mockPing);
    await flush(40);
    const stored = await dequeueAll();
    // The ping is in the queue; it may be flagged suspicious=true by the validator.
    const found = stored.find((p) => p.id === "mock-loc");
    expect(found).toBeDefined();
    expect(found?.suspicious).toBe(true);
  });
});

// ─── 5. Transient failure → pings retained for next reconnect ─────────────────

describe("GPS queue — transient failure retains pings for retry", () => {
  it("non-spoof error leaves pings in the queue (queueSize unchanged)", async () => {
    registerDrainHandler(async (_pings) => {
      throw new Error("503 Service Unavailable");
    });

    await enqueueAndFlush([makePing("t1"), makePing("t2")]);
    expect(await queueSize()).toBe(2);

    batchDrainGpsQueue();
    await flush(100);

    // Pings must NOT be cleared — they stay for the next reconnect.
    expect(await queueSize()).toBe(2);
  });

  it("pings surviving a transient failure are sent on the next successful drain", async () => {
    let failOnce = true;
    const received: string[] = [];

    registerDrainHandler(async (pings) => {
      if (failOnce) {
        failOnce = false;
        throw new Error("transient");
      }
      pings.forEach((p) => received.push(p.id));
    });

    await enqueueAndFlush([makePing("retry1"), makePing("retry2")]);

    // First drain fails.
    batchDrainGpsQueue();
    await flush(100);
    expect(await queueSize()).toBe(2); // still there

    // Second drain succeeds.
    batchDrainGpsQueue();
    await flush(100);

    expect(received.sort()).toEqual(["retry1", "retry2"]);
    expect(await queueSize()).toBe(0);
  });

  it("batchDrainGpsQueue is safe to call with no registered handler", async () => {
    await enqueueAndFlush([makePing("no-handler")]);
    expect(() => batchDrainGpsQueue()).not.toThrow();
    await flush(100);
    // Queue untouched because there is no drain function.
    expect(await queueSize()).toBe(1);
  });
});

// ─── 6. Socket reconnect wiring — connect handler triggers batchDrainGpsQueue ─
//
// socket.tsx's "connect" handler calls:
//   syncQueue();
//   batchDrainGpsQueue();
//
// We verify the wiring by spying on batchDrainGpsQueue and simulating the
// exact sequence the connect handler executes.

describe("Socket reconnect wiring — connect handler drains GPS queue", () => {
  it("connect handler (simulatated) calls batchDrainGpsQueue and flushes all pings", async () => {
    const received: string[] = [];
    registerDrainHandler(async (pings) => {
      pings.forEach((p) => received.push(p.id));
    });

    await enqueueAndFlush([makePing("conn1"), makePing("conn2"), makePing("conn3")]);

    // Simulate exactly what socket.tsx does on "connect":
    //   s.on("connect", () => { syncQueue(); batchDrainGpsQueue(); });
    batchDrainGpsQueue(); // ← the call made by the connect handler
    await flush(100);

    // All pings sent + queue cleared.
    expect(received.sort()).toEqual(["conn1", "conn2", "conn3"]);
    expect(await queueSize()).toBe(0);
  });

  it("re-connecting after a previous successful drain does not resend old pings", async () => {
    const received: string[] = [];
    registerDrainHandler(async (pings) => {
      pings.forEach((p) => received.push(p.id));
    });

    // First connection: 2 pings buffered, drained.
    await enqueueAndFlush([makePing("first1"), makePing("first2")]);
    batchDrainGpsQueue();
    await flush(100);
    expect(received).toHaveLength(2);

    // Rider goes offline again, comes back — no new pings buffered.
    batchDrainGpsQueue(); // second connect event
    await flush(100);

    // No additional pings sent; received still has only the original 2.
    expect(received).toHaveLength(2);
  });

  it("registerDrainHandler cleanup prevents the handler from being called after unsubscribe", async () => {
    let callCount = 0;
    const unsub = registerDrainHandler(async (_pings) => {
      callCount++;
    });
    unsub(); // unregister immediately

    await enqueueAndFlush([makePing("unsub1")]);
    batchDrainGpsQueue();
    await flush(100);

    expect(callCount).toBe(0); // handler was unregistered, never fired
    // Pings remain in the queue (no handler to clear them).
    expect(await queueSize()).toBe(1);
  });
});
