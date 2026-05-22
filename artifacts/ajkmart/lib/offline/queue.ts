import AsyncStorage from "@react-native-async-storage/async-storage";
import { createLogger } from "@/utils/logger";

const log = createLogger("[offline/queue]");
const QUEUE_KEY = "@ajkmart_offline_queue";
const DEAD_LETTER_KEY = "@ajkmart_offline_dead_letter";
const MAX_REPLAY_ATTEMPTS = 3;

export type OfflineQueueAction = "otp_send" | "otp_verify" | "register_step";

export interface QueuedRequest {
  id: string;
  action: OfflineQueueAction;
  payload: Record<string, unknown>;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH";
  enqueuedAt: number;
  attempts: number;
}

export interface DeadLetterEntry extends QueuedRequest {
  failedAt: number;
  lastError: string;
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function readQueue(): Promise<QueuedRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedRequest[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedRequest[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function appendDeadLetter(entry: DeadLetterEntry): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY);
    const list: DeadLetterEntry[] = raw ? (JSON.parse(raw) as DeadLetterEntry[]) : [];
    list.push(entry);
    if (list.length > 50) list.splice(0, list.length - 50);
    await AsyncStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(list));
  } catch (err) {
    log.warn("[offline/queue] dead-letter write failed (non-fatal):", err);
  }
}

/**
 * Enqueue a request to be replayed when connectivity is restored.
 * Safe to call while offline.
 */
export async function enqueueRequest(
  action: OfflineQueueAction,
  endpoint: string,
  method: "POST" | "PUT" | "PATCH",
  payload: Record<string, unknown>,
): Promise<QueuedRequest> {
  const entry: QueuedRequest = {
    id: generateId(),
    action,
    endpoint,
    method,
    payload,
    enqueuedAt: Date.now(),
    attempts: 0,
  };
  const queue = await readQueue();
  queue.push(entry);
  await writeQueue(queue);
  return entry;
}

/**
 * Remove a specific entry from the queue by id.
 */
export async function dequeueRequest(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((e) => e.id !== id));
}

/**
 * Return the number of pending items in the queue.
 */
export async function queueLength(): Promise<number> {
  return (await readQueue()).length;
}

/**
 * Drain the queue by replaying each request against the API.
 * Items that succeed are removed. Items that fail are retried up to
 * MAX_REPLAY_ATTEMPTS before being moved to the dead-letter list.
 *
 * @param apiBase  The base URL for the API (e.g. `https://example.com/api`).
 * @param token    Optional Bearer token for authenticated requests.
 * @returns        `{ succeeded, failed, dead }` counts.
 */
export async function drainQueue(
  apiBase: string,
  token?: string | null,
): Promise<{ succeeded: number; failed: number; dead: number }> {
  const queue = await readQueue();
  if (queue.length === 0) return { succeeded: 0, failed: 0, dead: 0 };

  let succeeded = 0;
  let failed = 0;
  let dead = 0;
  const remaining: QueuedRequest[] = [];

  for (const entry of queue) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const resp = await fetch(`${apiBase}${entry.endpoint}`, {
        method: entry.method,
        headers,
        body: JSON.stringify(entry.payload),
        signal: AbortSignal.timeout(15_000),
      });

      if (resp.ok) {
        succeeded++;
        /* entry not pushed to remaining — it's consumed */
        continue;
      }

      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      const nextAttempts = entry.attempts + 1;
      if (nextAttempts >= MAX_REPLAY_ATTEMPTS) {
        dead++;
        await appendDeadLetter({
          ...entry,
          attempts: nextAttempts,
          failedAt: Date.now(),
          lastError: err instanceof Error ? err.message : String(err),
        });
      } else {
        failed++;
        remaining.push({ ...entry, attempts: nextAttempts });
      }
    }
  }

  await writeQueue(remaining);
  return { succeeded, failed, dead };
}

/**
 * Read all entries in the dead-letter list (items that exceeded max retries).
 */
export async function readDeadLetterQueue(): Promise<DeadLetterEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY);
    return raw ? (JSON.parse(raw) as DeadLetterEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Clear the dead-letter list.
 */
export async function clearDeadLetterQueue(): Promise<void> {
  await AsyncStorage.removeItem(DEAD_LETTER_KEY);
}
