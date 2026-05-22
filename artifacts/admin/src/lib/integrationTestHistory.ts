/**
 * integrationTestHistory — persistence layer for the
 * `parseIntegrationTestResponse` results surfaced on
 * `pages/settings-integrations.tsx`.
 *
 * Each test result is keyed under a single `localStorage` key (a JSON
 * map of `{ [id]: { ok, msg, at } }`) so a full reload only needs one
 * read/write. Reads are best-effort: corrupt storage simply returns
 * an empty map, never throws into the React tree.
 */

import { safeJsonParse, safeJsonStringify } from "@/lib/safeJson";
import { safeLocalGet, safeLocalSet } from "@/lib/safeStorage";

export const INTEGRATION_TEST_HISTORY_KEY = "admin.integrationTestHistory.v1";

export interface IntegrationTestHistoryEntry {
  ok: boolean;
  msg: string;
  /** ms-since-epoch timestamp the test was last executed. */
  at: number;
}

export type IntegrationTestHistory = Record<string, IntegrationTestHistoryEntry>;

function isHistoryEntry(v: unknown): v is IntegrationTestHistoryEntry {
  return (
    typeof v === "object" &&
    v != null &&
    typeof (v as { ok?: unknown }).ok === "boolean" &&
    typeof (v as { msg?: unknown }).msg === "string" &&
    typeof (v as { at?: unknown }).at === "number"
  );
}

/** Read the entire persisted history map. Returns `{}` on miss/corruption. */
export function loadIntegrationTestHistory(): IntegrationTestHistory {
  const raw = safeLocalGet(INTEGRATION_TEST_HISTORY_KEY);
  if (!raw) return {};
  const parsed = safeJsonParse<unknown>(raw, {});
  if (typeof parsed !== "object" || parsed == null) return {};
  const out: IntegrationTestHistory = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (isHistoryEntry(v)) out[k] = v;
  }
  return out;
}

/** Convenience getter — returns null if the id has no recorded result. */
export function getIntegrationTestResult(id: string): IntegrationTestHistoryEntry | null {
  const history = loadIntegrationTestHistory();
  return history[id] ?? null;
}

/** Persist a single result; merges into the existing map. */
export function recordIntegrationTestResult(
  id: string,
  result: { ok: boolean; msg: string }
): void {
  const history = loadIntegrationTestHistory();
  history[id] = { ok: result.ok, msg: result.msg, at: Date.now() };
  const json = safeJsonStringify(history);
  if (!json) return;
  safeLocalSet(INTEGRATION_TEST_HISTORY_KEY, json);
}

/** Wipe the entire stored history (used by tests / reset flows). */
export function clearIntegrationTestHistory(): void {
  safeLocalSet(INTEGRATION_TEST_HISTORY_KEY, "{}");
}
