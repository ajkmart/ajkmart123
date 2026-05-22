import React, { createContext, useContext, useMemo } from "react";
import { usePlatformConfig, isMethodEnabled } from "@/context/PlatformConfigContext";

/** Auth methods that can be checked via `isMethodEnabled()` */
export type SupportedAuthMethod =
  | "phone"
  | "email"
  | "usernamePassword"
  | "google"
  | "facebook"
  | "magicLink"
  | "biometric"
  | "twoFactor"
  | "emailRegister";

export interface AuthConfig {
  allowPhone: boolean;
  allowEmail: boolean;
  allowUsernamePassword: boolean;
  allowGoogle: boolean;
  allowFacebook: boolean;
  allowMagicLink: boolean;
  allowBiometric: boolean;
  allowTwoFactor: boolean;
  allowEmailRegister: boolean;
  captchaEnabled: boolean;
  captchaSiteKey: string;
  googleClientId: string;
  facebookAppId: string;
  authMode: "OTP" | "EMAIL" | "FIREBASE" | "HYBRID";
  firebaseEnabled: boolean;
  hasAnyMethod: boolean;
  /** The configured OTP delivery provider (e.g. "twilio", "firebase", "console") */
  otpProvider: string;
  /** Check whether a specific auth method is enabled for this client. */
  isMethodEnabled: (method: SupportedAuthMethod) => boolean;
}

const _methodMap: Record<SupportedAuthMethod, keyof Pick<AuthConfig, "allowPhone" | "allowEmail" | "allowUsernamePassword" | "allowGoogle" | "allowFacebook" | "allowMagicLink" | "allowBiometric" | "allowTwoFactor" | "allowEmailRegister">> = {
  phone: "allowPhone",
  email: "allowEmail",
  usernamePassword: "allowUsernamePassword",
  google: "allowGoogle",
  facebook: "allowFacebook",
  magicLink: "allowMagicLink",
  biometric: "allowBiometric",
  twoFactor: "allowTwoFactor",
  emailRegister: "allowEmailRegister",
};

function makeIsMethodEnabled(cfg: Omit<AuthConfig, "isMethodEnabled">) {
  return (method: SupportedAuthMethod): boolean => !!cfg[_methodMap[method]];
}

const _defaults = {
  allowPhone: true,
  allowEmail: true,
  allowUsernamePassword: true,
  allowGoogle: false,
  allowFacebook: false,
  allowMagicLink: false,
  allowBiometric: false,
  allowTwoFactor: false,
  allowEmailRegister: true,
  captchaEnabled: false,
  captchaSiteKey: "",
  googleClientId: "",
  facebookAppId: "",
  authMode: "OTP" as const,
  firebaseEnabled: false,
  hasAnyMethod: true,
  otpProvider: "console",
};

const AuthConfigContext = createContext<AuthConfig>({
  ..._defaults,
  isMethodEnabled: makeIsMethodEnabled(_defaults),
});

/**
 * Provides customer-scoped auth configuration derived from PlatformConfigContext.
 * Does not make a separate network request — reads from the already-fetched
 * platform config (which includes the `auth` section).
 */
export function AuthConfigProvider({ children }: { children: React.ReactNode }) {
  const { config } = usePlatformConfig();
  const auth = config.auth;

  const value = useMemo<AuthConfig>(() => {
    const allowPhone = isMethodEnabled(auth.phoneOtpEnabled, "customer");
    const allowEmail = isMethodEnabled(auth.emailOtpEnabled, "customer");
    const allowUsernamePassword = isMethodEnabled(auth.usernamePasswordEnabled, "customer");
    const allowGoogle = isMethodEnabled(auth.googleEnabled, "customer");
    const allowFacebook = isMethodEnabled(auth.facebookEnabled, "customer");
    const allowMagicLink = isMethodEnabled(auth.magicLinkEnabled, "customer");
    const allowBiometric = isMethodEnabled(auth.biometricEnabled, "customer");
    const allowTwoFactor = isMethodEnabled(auth.twoFactorEnabled, "customer");
    const allowEmailRegister = isMethodEnabled(auth.emailRegisterEnabled, "customer");

    const hasAnyMethod =
      allowPhone ||
      allowEmail ||
      allowUsernamePassword ||
      allowGoogle ||
      allowFacebook ||
      allowMagicLink;

    const partial = {
      allowPhone,
      allowEmail,
      allowUsernamePassword,
      allowGoogle,
      allowFacebook,
      allowMagicLink,
      allowBiometric,
      allowTwoFactor,
      allowEmailRegister,
      captchaEnabled: auth.captchaEnabled,
      captchaSiteKey: auth.captchaSiteKey,
      googleClientId: auth.googleClientId,
      facebookAppId: auth.facebookAppId,
      authMode: auth.authMode ?? "OTP",
      firebaseEnabled: auth.firebaseEnabled ?? false,
      hasAnyMethod,
      otpProvider: (auth as Record<string, unknown>).otpProvider as string ?? "twilio",
    };

    return { ...partial, isMethodEnabled: makeIsMethodEnabled(partial) };
  }, [auth]);

  return (
    <AuthConfigContext.Provider value={value}>
      {children}
    </AuthConfigContext.Provider>
  );
}

export function useAuthConfig(): AuthConfig {
  return useContext(AuthConfigContext);
}
