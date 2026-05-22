/**
 * useAppStatus — admin
 *
 * Fetches platform-wide maintenance status via direct fetch (admin doesn't
 * have a usePlatformConfig hook). Admin only shows maintenance overlay.
 */
import { useEffect, useState } from "react";

export interface AppStatus {
  maintenance: boolean;
  maintenanceMsg?: string;
  supportPhone?: string;
  supportEmail?: string;
  isLoading: boolean;
}

export function useAppStatus(): AppStatus {
  const [status, setStatus] = useState<AppStatus>({
    maintenance: false,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => {
        if (cancelled || !raw) return;
        const d = ((raw as Record<string, unknown>)?.data ?? raw) as Record<string, unknown>;
        const platform = d?.platform as Record<string, unknown> | undefined;
        const content = d?.content as Record<string, unknown> | undefined;
        setStatus({
          maintenance: platform?.appStatus === "maintenance",
          maintenanceMsg: content?.maintenanceMsg as string | undefined,
          supportPhone: platform?.supportPhone as string | undefined,
          supportEmail: platform?.supportEmail as string | undefined,
          isLoading: false,
        });
      })
      .catch(() => {
        if (!cancelled) setStatus({ maintenance: false, isLoading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
