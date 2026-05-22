import { createLogger } from "@/lib/logger";
import { useEffect, useRef } from "react";
const log = createLogger("[version-check]");

const STORAGE_KEY = "ajk_vendor_server_epoch";
const VERSION_KEY = "ajk_vendor_app_version";
const POLL_INTERVAL_MS = 30_000;

interface HealthData {
  serverEpoch?: number;
  appVersion?: string;
}

async function fetchHealth(): Promise<HealthData | null> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthData;
  } catch (err) {
    console.warn("[artifacts/vendor-app/src/hooks/useVersionCheck.ts]", err);
    return null;
  } // eslint-disable-line no-console
}

/** Parse the major segment of a semver string (e.g. "2.3.1" → 2). */
function parseMajor(version: string): number {
  const match = version.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function hardReload(): void {
  try {
    sessionStorage.clear();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(VERSION_KEY);
  } catch (err) {
    console.warn("[artifacts/vendor-app/src/hooks/useVersionCheck.ts]", err);
  } // eslint-disable-line no-console
  window.location.reload();
}

export function useVersionCheck() {
  const reloadScheduled = useRef(false);

  useEffect(() => {
    async function check() {
      if (reloadScheduled.current) return;

      const health = await fetchHealth();
      if (!health) return;

      const { serverEpoch: epoch, appVersion } = health;

      /* ── Semver-aware version comparison ───────────────────────────────
         Only a MAJOR version increment forces a reload.  Minor / patch
         changes are silently noted so transient deploys never cause
         reload loops during active sessions.                             */
      if (appVersion) {
        const storedVersion = localStorage.getItem(VERSION_KEY);
        if (storedVersion == null) {
          localStorage.setItem(VERSION_KEY, appVersion);
          log.debug(`initial appVersion stored: ${appVersion}`);
        } else if (storedVersion !== appVersion) {
          const storedMajor = parseMajor(storedVersion);
          const currentMajor = parseMajor(appVersion);
          log.debug(
            `version changed ${storedVersion} → ${appVersion} (major: ${storedMajor} → ${currentMajor})`
          );
          localStorage.setItem(VERSION_KEY, appVersion);
          if (currentMajor > storedMajor) {
            log.debug("major version bump — scheduling reload");
            reloadScheduled.current = true;
            clearInterval(timer);
            hardReload();
            return;
          }
        }
      }

      /* ── Epoch-based fallback (non-version deploys) ────────────────── */
      if (typeof epoch !== "number") return;
      const storedEpoch = localStorage.getItem(STORAGE_KEY);
      if (storedEpoch == null) {
        localStorage.setItem(STORAGE_KEY, String(epoch));
        return;
      }
      if (Number(storedEpoch) !== epoch) {
        log.debug(`serverEpoch changed (${storedEpoch} → ${epoch}) — scheduling reload`);
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
