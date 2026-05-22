/**
 * useAppStatus — vendor-app
 *
 * Fetches platform-wide status (maintenance) and can re-check the
 * current vendor's approval status via /vendor/me.
 */
import { useCallback } from "react";
import { api } from "../api";
import { usePlatformConfig } from "../useConfig";

export interface AppStatus {
  maintenance: boolean;
  maintenanceMsg?: string;
  supportPhone?: string;
  supportEmail?: string;
  isLoading: boolean;
}

export interface UserStatus {
  status: string;
  rejectionReason?: string | null;
}

export function useAppStatus(): AppStatus & { checkUserStatus: () => Promise<UserStatus> } {
  const { config, isLoading: loading } = usePlatformConfig();

  const checkUserStatus = useCallback(async (): Promise<UserStatus> => {
    try {
      const me = (await api.getMe()) as {
        approvalStatus?: string;
        rejectionReason?: string | null;
      };
      return { status: me.approvalStatus ?? "approved", rejectionReason: me.rejectionReason };
    } catch {
      return { status: "unknown" };
    }
  }, []);

  return {
    maintenance: config.platform.appStatus === "maintenance",
    maintenanceMsg: config.content.maintenanceMsg,
    supportPhone: config.platform.supportPhone,
    supportEmail: config.platform.supportEmail,
    isLoading: loading,
    checkUserStatus,
  };
}
