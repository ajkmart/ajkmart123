import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

export interface AuthConfig {
  phoneEnabled: boolean;
  emailEnabled: boolean;
  googleEnabled: boolean;
  facebookEnabled: boolean;
  magicLinkEnabled: boolean;
  usernamePassword: boolean;
  totp: boolean;
  captchaEnabled: boolean;
  otpProvider: string | null;
  authMode: string;
  captchaSiteKey?: string;
  googleClientId?: string;
  facebookAppId?: string;
  otpBypassActive: boolean;
  otpBypassGlobal?: boolean;
  lockoutEnabled: boolean;
  lockoutMaxAttempts: number;
  lockoutDurationSec: number;
}

const DEFAULT_AUTH_CONFIG: AuthConfig = {
  phoneEnabled: true,
  emailEnabled: false,
  googleEnabled: false,
  facebookEnabled: false,
  magicLinkEnabled: false,
  usernamePassword: true,
  totp: false,
  captchaEnabled: false,
  otpProvider: null,
  authMode: "OTP",
  otpBypassActive: false,
  otpBypassGlobal: false,
  lockoutEnabled: false,
  lockoutMaxAttempts: 5,
  lockoutDurationSec: 300,
};

const SAFE_DEGRADED_CONFIG: AuthConfig = {
  ...DEFAULT_AUTH_CONFIG,
  usernamePassword: false,
  googleEnabled: false,
  facebookEnabled: false,
  magicLinkEnabled: false,
};

const AuthConfigContext = createContext<AuthConfig | null>(null);

async function fetchAuthConfig(): Promise<AuthConfig> {
  let res: Response;
  try {
    res = await fetch("/api/auth/config", { credentials: "include" });
  } catch {
    return SAFE_DEGRADED_CONFIG;
  }
  if (!res.ok) return SAFE_DEGRADED_CONFIG;
  const json = await res.json();
  const d = json?.data ?? json;
  return {
    /* Prefer camelCase rider-scoped fields from /api/auth/config.
       Fall back to legacy snake_case "on"/"off" string fields for servers
       that have not yet deployed the extended config endpoint. */
    phoneEnabled:
      d.phoneOtp ??
      d.phoneEnabled ??
      (d.auth_otp_enabled === "on" ? true : d.auth_otp_enabled === "off" ? false : true),
    emailEnabled: d.emailOtp ?? d.emailEnabled ?? (d.auth_email_enabled === "on" ? true : false),
    googleEnabled: d.google ?? d.googleEnabled ?? (d.auth_google_enabled === "on" ? true : false),
    facebookEnabled:
      d.facebook ?? d.facebookEnabled ?? (d.auth_facebook_enabled === "on" ? true : false),
    magicLinkEnabled: d.magicLink ?? d.magicLinkEnabled ?? false,
    usernamePassword: d.usernamePassword ?? true,
    totp: d.totp ?? false,
    captchaEnabled: d.captchaEnabled ?? false,
    otpProvider: d.otpProvider ?? null,
    captchaSiteKey: d.captchaSiteKey ?? undefined,
    googleClientId: d.googleClientId ?? undefined,
    facebookAppId: d.facebookAppId ?? undefined,
    authMode: d.auth_mode ?? d.authMode ?? "OTP",
    otpBypassActive: d.otpBypassActive ?? false,
    otpBypassGlobal: d.otpBypassGlobal ?? false,
    lockoutEnabled: d.lockoutEnabled ?? false,
    lockoutMaxAttempts: d.lockoutMaxAttempts ?? 5,
    lockoutDurationSec: d.lockoutDurationSec ?? 300,
  };
}

export function RiderAuthConfigProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery<AuthConfig>({
    queryKey: ["rider-auth-config"],
    queryFn: fetchAuthConfig,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return (
    <AuthConfigContext.Provider value={data ?? DEFAULT_AUTH_CONFIG}>
      {children}
    </AuthConfigContext.Provider>
  );
}

export function useRiderAuthConfig(): AuthConfig {
  const ctx = useContext(AuthConfigContext);
  if (ctx == null) {
    throw new Error(
      "useRiderAuthConfig must be used within a <RiderAuthConfigProvider>. Ensure the provider wraps this component."
    );
  }
  return ctx;
}
