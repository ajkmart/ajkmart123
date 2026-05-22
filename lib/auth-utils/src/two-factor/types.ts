export interface TwoFactorSetupProps {
  qrCodeDataUrl: string;
  secret: string;
  backupCodes: string[];
  onVerify: (code: string) => void | Promise<void>;
  verifyLoading?: boolean;
  verifyError?: string | null;
  appName?: string;
}

export interface TwoFactorVerifyProps {
  onVerify: (code: string) => void | Promise<void>;
  onBackupCode?: (code: string) => void | Promise<void>;
  verifyLoading?: boolean;
  verifyError?: string | null;
  showTrustDevice?: boolean;
  onTrustDeviceChange?: (trusted: boolean) => void;
  trustDevice?: boolean;
}
