import { useEffect, useState } from "react";

export type ActionType =
  | "accept_order"
  | "accept_ride"
  | "update_order"
  | "update_ride"
  | "complete_trip"
  | "board_passenger";

export interface QueuedAction {
  id: string;
  type: ActionType;
  entityId: string;
  payload: Record<string, unknown>;
  retryCount: number;
  createdAt: number;
}

const DB_NAME = "ajkmart_action_queue";
const STORE = "actions";
/* DB version 2 adds the dead_letter object store.
   Version bump triggers onupgradeneeded where we create it if absent. */
const DB_VER = 2;

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      /* v1: main action queue */
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      /* v2: dead-letter store for permanently-failed actions */
      if (event.oldVersion < 2 && !db.objectStoreNames.contains(DL_STORE)) {
        db.createObjectStore(DL_STORE, { keyPath: "id" });
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
          console.warn("[artifacts/rider-app/src/lib/offline/queueManager.ts]", err);
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

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function enqueueAction(
  type: ActionType,
  entityId: string,
  payload: Record<string, unknown>
): Promise<string> {
  const action: QueuedAction = {
    id: generateId(),
    type,
    entityId,
    payload,
    retryCount: 0,
    createdAt: Date.now(),
  };
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(action);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    notifyListeners();
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/offline/queueManager.ts]", err);
  } // eslint-disable-line no-console
  return action.id;
}

async function getAll(): Promise<QueuedAction[]> {
  try {
    const db = await openDB();
    const all = await new Promise<QueuedAction[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as QueuedAction[]);
      req.onerror = () => reject(req.error);
    });
    /* Sort strictly FIFO by creation time so status transitions replay in the
       correct order (e.g. accepted → in_transit → completed, never reversed). */
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/offline/queueManager.ts]", err);
    return [];
  } // eslint-disable-line no-console
}

async function removeAction(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/offline/queueManager.ts]", err);
  } // eslint-disable-line no-console
}

async function bumpRetryCount(action: QueuedAction): Promise<void> {
  try {
    const db = await openDB();
    const updated: QueuedAction = { ...action, retryCount: action.retryCount + 1 };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(updated);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/offline/queueManager.ts]", err);
  } // eslint-disable-line no-console
}

/* ── PermanentQueueError ───────────────────────────────────────────────────────
   Throw this (or a subclass) from the executor to signal that an action has
   failed permanently and must be removed from the queue immediately — no more
   retries.  Use it for HTTP 4xx responses (except 429 rate-limit): the server
   has told us the request is invalid or forbidden and retrying will never help.

   For transient failures (network unreachable, 5xx, 429) simply throw any
   other error; the queue will bump the retry counter and stop the drain so the
   action is replayed on the next sync cycle.

   The `reason` field is stored in IndexedDB under the dead-letter entry so the
   UI can surface a human-readable failure message to the rider. */
export class PermanentQueueError extends Error {
  readonly permanent = true as const;
  constructor(
    public readonly reason: string,
    public readonly httpStatus?: number
  ) {
    super(reason);
    this.name = "PermanentQueueError";
  }
}

/* ── Dead-letter store ─────────────────────────────────────────────────────────
   Actions removed due to a permanent failure are moved to a dead-letter list
   in IndexedDB so they are visible to the rider (and for diagnostics) rather
   than silently evaporating. The UI reads this via useDeadLetterQueue(). */
export interface DeadLetterEntry {
  id: string;
  action: QueuedAction;
  reason: string;
  httpStatus?: number;
  failedAt: number;
}

const DL_STORE = "dead_letter";

/* L-06: Retention limits prevent unbounded IndexedDB growth. Entries older
   than DL_TTL_MS are expired; the store never holds more than DL_MAX_ENTRIES. */
const DL_MAX_ENTRIES = 50;
const DL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function pushDeadLetter(action: QueuedAction, err: PermanentQueueError): Promise<void> {
  try {
    const db = await openDB();
    /* Ensure the dead-letter store exists — it was added in DB version 2. If
       the store hasn't been created yet (old DB version) we skip silently. */
    if (!db.objectStoreNames.contains(DL_STORE)) return;
    const entry: DeadLetterEntry = {
      id: action.id,
      action,
      reason: err.reason,
      httpStatus: err.httpStatus,
      failedAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DL_STORE, "readwrite");
      const store = tx.objectStore(DL_STORE);
      /* Prune expired entries and enforce max-size before writing. */
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const all = (getAllReq.result ?? []) as DeadLetterEntry[];
        const cutoff = Date.now() - DL_TTL_MS;
        /* Delete expired */
        all.filter((e) => e.failedAt < cutoff).forEach((e) => store.delete(e.id));
        /* Evict oldest above the cap */
        const fresh = all
          .filter((e) => e.failedAt >= cutoff)
          .sort((a, b) => a.failedAt - b.failedAt);
        while (fresh.length >= DL_MAX_ENTRIES) {
          store.delete(fresh.shift()!.id);
        }
        store.put(entry);
      };
      getAllReq.onerror = () => reject(getAllReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/offline/queueManager.ts]", err);
  } // eslint-disable-line no-console
}

/** Clear all pending actions from the queue (e.g. on 401 — stale auth). */
export async function clearQueue(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    notifyListeners();
  } catch (err) {
    console.warn("[queueManager] clearQueue failed:", err); // eslint-disable-line no-console
  }
}

export async function getDeadLetterQueue(): Promise<DeadLetterEntry[]> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(DL_STORE)) return [];
    return await new Promise<DeadLetterEntry[]>((resolve, reject) => {
      const tx = db.transaction(DL_STORE, "readonly");
      const req = tx.objectStore(DL_STORE).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as DeadLetterEntry[]);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/offline/queueManager.ts]", err);
    return [];
  } // eslint-disable-line no-console
}

export async function clearDeadLetterEntry(id: string): Promise<void> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(DL_STORE)) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DL_STORE, "readwrite");
      tx.objectStore(DL_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/offline/queueManager.ts]", err);
  } // eslint-disable-line no-console
}

type ActionExecutor = (action: QueuedAction) => Promise<void>;

let _executor: ActionExecutor | null = null;
let _syncing = false;
let _lastSync: number | null = null;

/* MAX_RETRIES is a last-resort safety net for unexpected errors that the
   executor did not classify as PermanentQueueError. Under normal operation the
   executor should throw PermanentQueueError for any 4xx response so actions are
   removed on first failure, not after 5 attempts.
   Only truly unclassified errors (unexpected throw shapes, bugs in the executor)
   will exhaust this counter. */
const MAX_RETRIES = 5;

export function registerActionExecutor(fn: ActionExecutor): void {
  _executor = fn;
}

/** Returns the number of actions currently pending in the queue.
 *  Useful for surfacing a "N actions queued" badge in the UI. */
export async function getQueueSize(): Promise<number> {
  try {
    const db = await openDB();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result ?? 0);
      req.onerror = () => reject(tx.error);
    });
  } catch {
    return 0;
  }
}

type ActionSuccessCallback = (action: QueuedAction) => void;
const _successCallbacks = new Map<ActionType, Set<ActionSuccessCallback>>();

export function subscribeActionSuccess(type: ActionType, fn: ActionSuccessCallback): () => void {
  if (!_successCallbacks.has(type)) _successCallbacks.set(type, new Set());
  _successCallbacks.get(type)!.add(fn);
  return () => {
    _successCallbacks.get(type)?.delete(fn);
  };
}

function notifyActionSuccess(action: QueuedAction): void {
  _successCallbacks.get(action.type)?.forEach((fn) => {
    try {
      fn(action);
    } catch (err) {
      console.warn("[artifacts/rider-app/src/lib/offline/queueManager.ts]", err);
    }
  }); // eslint-disable-line no-console
}

export async function syncQueue(): Promise<void> {
  if (_syncing || !_executor) return;
  _syncing = true;
  notifyListeners();
  try {
    const actions = await getAll();
    if (actions.length === 0) return;
    /* Process strictly in createdAt order. Stop the drain when any action
       fails — a failed predecessor (e.g. accept_order) must not be skipped,
       because later actions (update_order, complete_trip) depend on it
       having succeeded server-side first. */
    for (const action of actions) {
      /* Last-resort guard: if an unclassified error has been retried too many
         times, move it to the dead-letter store so it doesn't block the queue
         forever. Under normal operation the executor throws PermanentQueueError
         for any 4xx so this branch is only hit by unexpected error shapes. */
      if (action.retryCount >= MAX_RETRIES) {
        await pushDeadLetter(
          action,
          new PermanentQueueError(
            `Exceeded max retries (${MAX_RETRIES}) without a permanent error classification`
          )
        );
        await removeAction(action.id).catch((err) => {
          console.warn("[queueManager] removeAction failed after dead-letter push:", err);
        }); // eslint-disable-line no-console
        continue;
      }
      try {
        await _executor(action);
        await removeAction(action.id);
        notifyActionSuccess(action);
      } catch (err) {
        if (err instanceof PermanentQueueError) {
          /* 401 Unauthorized — auth is gone; clear entire queue and abort sync
             to avoid replaying stale actions under an invalid session. */
          if (err.httpStatus === 401) {
            await clearQueue();
            throw new PermanentQueueError("Session expired — queue cleared", 401);
          }
          /* Other permanent server-side rejection (e.g. 4xx): move to dead-letter
             immediately and continue draining subsequent actions. */
          await pushDeadLetter(action, err);
          await removeAction(action.id).catch((removeErr) => {
            console.warn("[queueManager] removeAction failed after permanent error:", removeErr);
          }); // eslint-disable-line no-console
          continue;
        }
        /* Transient failure (network unreachable, 5xx, 429): bump retry count
           and halt the drain. The ordering invariant requires that later actions
           (e.g. update_ride) only run after the predecessor succeeds. */
        await bumpRetryCount(action).catch((err) => {
          console.warn("[queueManager] bumpRetryCount failed:", err);
        }); // eslint-disable-line no-console
        break;
      }
    }
    _lastSync = Date.now();
  } finally {
    _syncing = false;
    notifyListeners();
  }
}

type Listener = () => void;
const _listeners = new Set<Listener>();

function notifyListeners() {
  _listeners.forEach((fn) => fn());
}

export function subscribeQueueStatus(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export async function getQueuePendingCount(): Promise<number> {
  const actions = await getAll();
  return actions.length;
}

export function useQueueStatus() {
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState<number | null>(_lastSync);
  const [syncing, setSyncing] = useState(_syncing);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const count = await getQueuePendingCount();
      if (mounted) {
        setPendingCount(count);
        setLastSync(_lastSync);
        setSyncing(_syncing);
      }
    };
    void refresh();
    const unsub = subscribeQueueStatus(refresh);
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return { pendingCount, lastSync, syncing };
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    syncQueue().catch((err) => {
      console.warn("[artifacts/rider-app/src/lib/offline/queueManager.ts]", err);
    });
  }); // eslint-disable-line no-console
  /* Periodic retry every 30 seconds — covers Android WebViews that skip the
     `online` event, and any OS where the event fires unreliably after roaming. */
  setInterval(() => {
    if (navigator.onLine) {
      syncQueue().catch((err) => {
        console.warn("[artifacts/rider-app/src/lib/offline/queueManager.ts]", err);
      });
    } // eslint-disable-line no-console
  }, 30_000);
}
