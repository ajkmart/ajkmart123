/**
 * useAppStatus — ajkmart (customer)
 *
 * Fetches platform-wide maintenance status. Customer app has no
 * pending/rejected user states — overlays are handled at app root
 * (SuspendedScreen, MaintenanceScreen).
 */
import { usePlatformConfig } from "@/context/PlatformConfigContext";

export interface AppStatus {
  maintenance: boolean;
  maintenanceMsg?: string;
  supportPhone?: string;
  supportEmail?: string;
  isLoading: boolean;
}

export function useAppStatus(): AppStatus {
  const { config } = usePlatformConfig();

  return {
    maintenance: config?.appStatus === "maintenance",
    maintenanceMsg: config?.content?.maintenanceMsg,
    supportPhone: config?.platform?.supportPhone,
    supportEmail: config?.platform?.supportEmail,
    isLoading: false,
  };
}
