import { createLogger } from "@/lib/logger";
import { useEffect, useRef } from "react";
const log = createLogger("[useVersionCheck]");

const STORAGE_KEY = "ajk_admin_server_epoch";
const POLL_INTERVAL_MS = 30_000;

async function fetchServerEpoch(): Promise<number | null> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.serverEpoch === "number" ? data.serverEpoch : null;
  } catch {
    return null;
  }
}

function hardReload(): void {
  try {
    sessionStorage.clear();
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    log.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "[useVersionCheck] localStorage unavailable — skipping persistence, reload continues"
    );
  }
  window.location.reload();
}

export function useVersionCheck() {
  const reloadScheduled = useRef(false);

  useEffect(() => {
    async function check() {
      if (reloadScheduled.current) return;

      const epoch = await fetchServerEpoch();
      if (epoch == null) return;

      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored == null) {
        localStorage.setItem(STORAGE_KEY, String(epoch));
        return;
      }

      if (Number(stored) !== epoch) {
        reloadScheduled.current = true;
        clearInterval(timer);
        localStorage.setItem(STORAGE_KEY, String(epoch));
        hardReload();
      }
    }

    void check();
    const timer = setInterval(check, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);
}
