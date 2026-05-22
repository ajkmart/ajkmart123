import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

interface QueuedStatusUpdate {
  id: string;
  orderId: string;
  status: string;
  queuedAt: number;
}

interface QueuedProductAction {
  id: string;
  action: "create" | "update";
  productId?: string;
  payload: Record<string, unknown>;
  queuedAt: number;
  retries: number;
}

export interface ProductQueueError {
  id: string;
  action: "create" | "update";
  productId?: string;
  payload: Record<string, unknown>;
  message: string;
}

const QUEUE_KEY = "@ajkmart_vendor_queue";

const PRODUCT_QUEUE_KEY = "ajkmart_vendor_product_queue";
const PRODUCT_FAILURES_KEY = "ajkmart_vendor_product_failures";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 800;
const ENTRY_SIZE_WARN_BYTES = 50 * 1024;

function loadQueue(): QueuedStatusUpdate[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedStatusUpdate[]) : [];
  } catch (err) {
    console.warn("[artifacts/vendor-app/src/hooks/useOfflineQueue.ts]", err);
    return [];
  } // eslint-disable-line no-console
}

function saveQueue(q: QueuedStatusUpdate[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch (err) {
    console.warn("[artifacts/vendor-app/src/hooks/useOfflineQueue.ts]", err);
  } // eslint-disable-line no-console
}

function loadProductQueue(): QueuedProductAction[] {
  try {
    const raw = localStorage.getItem(PRODUCT_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedProductAction[]) : [];
  } catch (err) {
    console.warn("[artifacts/vendor-app/src/hooks/useOfflineQueue.ts]", err);
    return [];
  } // eslint-disable-line no-console
}

/**
 * Persist the product queue. Returns an error message string if the save
 * failed (QuotaExceededError or other), or null on success.
 */
function saveProductQueue(q: QueuedProductAction[]): string | null {
  try {
    localStorage.setItem(PRODUCT_QUEUE_KEY, JSON.stringify(q));
    return null;
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      return "Storage is full — this product change could not be saved offline. Free up space or sync existing changes first.";
    }
    return "Could not save product change offline — storage error.";
  }
}

function loadProductFailures(): ProductQueueError[] {
  try {
    const raw = localStorage.getItem(PRODUCT_FAILURES_KEY);
    return raw ? (JSON.parse(raw) as ProductQueueError[]) : [];
  } catch (err) {
    console.warn("[artifacts/vendor-app/src/hooks/useOfflineQueue.ts]", err);
    return [];
  } // eslint-disable-line no-console
}

function saveProductFailures(f: ProductQueueError[]): void {
  try {
    localStorage.setItem(PRODUCT_FAILURES_KEY, JSON.stringify(f));
  } catch (err) {
    console.warn("[artifacts/vendor-app/src/hooks/useOfflineQueue.ts]", err);
  } // eslint-disable-line no-console
}

/**
 * Strip embedded base64 image data from a product payload before queueing.
 * Any field whose value is a data: URI is omitted entirely so it is not
 * replayed as an empty string (which would wipe the existing image server-side).
 * Plain https:// URLs are kept as-is.
 * Returns the sanitized payload and a boolean indicating whether any fields
 * were stripped.
 */
function sanitizePayloadForStorage(payload: Record<string, unknown>): {
  sanitized: Record<string, unknown>;
  hadBase64: boolean;
} {
  const sanitized: Record<string, unknown> = {};
  let hadBase64 = false;
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" && value.startsWith("data:")) {
      hadBase64 = true;
    } else {
      sanitized[key] = value;
    }
  }
  return { sanitized, hadBase64 };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState("");
  const [pendingProductCount, setPendingProductCount] = useState<number>(
    () => loadProductQueue().length
  );
  const [productQueueErrors, setProductQueueErrors] = useState<ProductQueueError[]>(() =>
    loadProductFailures()
  );
  const qc = useQueryClient();
  const flushingRef = useRef(false);
  const flushingProductsRef = useRef(false);

  const showSyncToast = (msg: string) => {
    setSyncToast(msg);
    setTimeout(() => setSyncToast(""), 3000);
  };

  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return;
    const queue = loadQueue();
    if (queue.length === 0) return;
    flushingRef.current = true;
    setIsSyncing(true);
    const total = queue.length;
    setSyncToast(`Syncing 0 / ${total}…`);
    const failed: QueuedStatusUpdate[] = [];
    let synced = 0;
    for (const item of queue) {
      try {
        await api.updateOrder(item.orderId, item.status);
        synced++;
        setSyncToast(`Syncing ${synced} / ${total}…`);
      } catch (err) {
        console.warn("[artifacts/vendor-app/src/hooks/useOfflineQueue.ts]", err);
      } // eslint-disable-line no-console
    }
    saveQueue(failed);
    await qc.invalidateQueries({ queryKey: ["vendor-orders"] });
    await qc.invalidateQueries({ queryKey: ["vendor-stats"] });
    setIsSyncing(false);
    flushingRef.current = false;
    if (failed.length === 0) {
      showSyncToast(`✅ Synced ${total} update${total > 1 ? "s" : ""}`);
    } else {
      showSyncToast(`⚠️ ${failed.length} update${failed.length > 1 ? "s" : ""} failed to sync`);
    }
  }, [qc]);

  const flushProductQueue = useCallback(async () => {
    if (flushingProductsRef.current) return;
    const queue = loadProductQueue();
    if (queue.length === 0) return;
    flushingProductsRef.current = true;

    const newFailures: ProductQueueError[] = [];

    for (const item of queue) {
      let success = false;
      let lastError = "";
      let attempts = item.retries;

      while (attempts < MAX_RETRIES) {
        try {
          if (item.action === "create") {
            await api.createProduct(item.payload as Parameters<typeof api.createProduct>[0]);
          } else if (item.action === "update" && item.productId) {
            await api.updateProduct(
              item.productId,
              item.payload as Parameters<typeof api.updateProduct>[1]
            );
          }
          success = true;
          break;
        } catch (e) {
          lastError = e instanceof Error ? e.message : "Unknown error";
          attempts++;
          if (attempts < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
        }
      }

      if (!success) {
        newFailures.push({
          id: item.id,
          action: item.action,
          productId: item.productId,
          payload: item.payload,
          message: lastError || "Failed after maximum retries",
        });
      }
    }

    saveProductQueue([]);
    setPendingProductCount(0);

    const existingFailures = loadProductFailures();
    const existingIds = new Set(existingFailures.map((f) => f.id));
    const mergedFailures = [
      ...existingFailures,
      ...newFailures.filter((f) => !existingIds.has(f.id)),
    ];
    saveProductFailures(mergedFailures);
    setProductQueueErrors(mergedFailures);

    flushingProductsRef.current = false;

    if (newFailures.length === 0 && queue.length > 0) {
      await qc.invalidateQueries({ queryKey: ["vendor-products"] });
      await qc.invalidateQueries({ queryKey: ["vendor-products-all"] });
    }
  }, [qc]);

  useEffect(() => {
    if (navigator.onLine) {
      void flushQueue();
      void flushProductQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void flushQueue();
      void flushProductQueue();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flushQueue, flushProductQueue]);

  const enqueueStatusUpdate = useCallback(
    (orderId: string, status: string): boolean => {
      if (isOnline) return false;
      const queue = loadQueue();
      const existing = queue.findIndex((q) => q.orderId === orderId);
      const item: QueuedStatusUpdate = {
        id: `${orderId}_${Date.now()}`,
        orderId,
        status,
        queuedAt: Date.now(),
      };
      if (existing >= 0) {
        queue[existing] = item;
      } else {
        queue.push(item);
      }
      saveQueue(queue);
      return true;
    },
    [isOnline]
  );

  /**
   * Enqueue a product create/update for offline replay.
   *
   * Returns null on success, an error string on failure (storage full, etc.),
   * or a "warn:…" string when the item was saved but the vendor should be
   * notified (e.g. image stripped, entry oversized). The caller surfaces all.
   */
  const enqueueProductAction = useCallback(
    (
      action: "create" | "update",
      payload: Record<string, unknown>,
      productId?: string
    ): string | undefined => {
      if (isOnline) return undefined;

      const { sanitized: sanitizedPayload, hadBase64 } = sanitizePayloadForStorage(payload);

      const item: QueuedProductAction = {
        id: `product_${action}_${Date.now()}`,
        action,
        productId,
        payload: sanitizedPayload,
        queuedAt: Date.now(),
        retries: 0,
      };

      const serialized = JSON.stringify(item);
      const byteSize = new TextEncoder().encode(serialized).length;

      const queue = loadProductQueue();
      queue.push(item);
      const saveError = saveProductQueue(queue);

      if (saveError) {
        return saveError;
      }

      setPendingProductCount(queue.length);

      if (hadBase64) {
        return "warn:📥 Saved offline (image stripped — re-upload the photo when back online)";
      }

      if (byteSize > ENTRY_SIZE_WARN_BYTES) {
        return `warn:📥 Saved offline — this change is large (${Math.round(byteSize / 1024)} KB). Sync soon to avoid storage issues.`;
      }

      return undefined;
    },
    [isOnline]
  );

  const retryProductQueueItem = useCallback(
    async (itemId: string) => {
      const failures = loadProductFailures();
      const failure = failures.find((f) => f.id === itemId);
      if (!failure) return;

      let success = false;
      let lastError = "";
      let attempts = 0;

      while (attempts < MAX_RETRIES) {
        try {
          if (failure.action === "create") {
            await api.createProduct(failure.payload as Parameters<typeof api.createProduct>[0]);
          } else if (failure.action === "update" && failure.productId) {
            await api.updateProduct(
              failure.productId,
              failure.payload as Parameters<typeof api.updateProduct>[1]
            );
          }
          success = true;
          break;
        } catch (e) {
          lastError = e instanceof Error ? e.message : "Unknown error";
          attempts++;
          if (attempts < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
        }
      }

      if (success) {
        const updatedFailures = loadProductFailures().filter((f) => f.id !== itemId);
        saveProductFailures(updatedFailures);
        setProductQueueErrors(updatedFailures);
        await qc.invalidateQueries({ queryKey: ["vendor-products"] });
        await qc.invalidateQueries({ queryKey: ["vendor-products-all"] });
      } else {
        const updatedFailures = loadProductFailures().map((f) =>
          f.id === itemId ? { ...f, message: lastError || "Failed after maximum retries" } : f
        );
        saveProductFailures(updatedFailures);
        setProductQueueErrors(updatedFailures);
      }
    },
    [qc]
  );

  const dismissProductQueueError = useCallback((itemId: string) => {
    const failures = loadProductFailures().filter((f) => f.id !== itemId);
    saveProductFailures(failures);
    setProductQueueErrors(failures);
  }, []);

  return {
    isOnline,
    isSyncing,
    syncToast,
    enqueueStatusUpdate,
    flushQueue,
    pendingProductCount,
    productQueueErrors,
    enqueueProductAction,
    flushProductQueue,
    retryProductQueueItem,
    dismissProductQueueError,
  };
}
