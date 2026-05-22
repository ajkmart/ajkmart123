export const version = "0.0.1";

// AuthProvider & context
export { AuthContext, AuthProvider, useAuthContext } from "./AuthProvider";
export type { AuthContextValue, AuthProviderProps, AuthUser } from "./AuthProvider";

// Token storage
export {
  SecureStorage,
  createNativeTokenStorage,
  createTokenStorage,
  getTokenStorage,
} from "./api/tokenStorage";
export type { StorageType, TokenStorage } from "./api/tokenStorage";

// Auth client
export { createAuthClient } from "./api/authClient";
export type { AuthClientOptions } from "./api/authClient";

// JWT utilities
export { decodeJwt, getTokenExpiryRemaining, isTokenExpired } from "./utils/jwtUtils";
export type { JwtPayload } from "./utils/jwtUtils";

// Device fingerprint
export { getDeviceFingerprint } from "./utils/deviceFingerprint";

// Hooks
export { useAuth } from "./hooks/useAuth";
export { useLoginFlow } from "./hooks/useLoginFlow";
export type { IdentifierCheckResult, LoginMethod, UseLoginFlowOptions } from "./hooks/useLoginFlow";
export { useSessionManager } from "./hooks/useSessionManager";
export type {
  LoginHistoryEntry,
  Session,
  UseSessionManagerOptions,
  UseSessionManagerResult,
} from "./hooks/useSessionManager";
export { useTokenRefresh } from "./hooks/useTokenRefresh";
export type { UseTokenRefreshOptions } from "./hooks/useTokenRefresh";

// Components
// React Native consumers: import platform variants directly instead of from the barrel:
//   import { OtpInput } from '@workspace/auth-react/src/components/OtpInput.native'
//   import { PhoneInput } from '@workspace/auth-react/src/components/PhoneInput.native'
export { ApprovalOverlay } from "./components/ApprovalOverlay";
export type { ApprovalOverlayProps } from "./components/ApprovalOverlay";
export { BiometricPrompt } from "./components/BiometricPrompt";
export type { BiometricPromptProps } from "./components/BiometricPrompt";
export { LoginCard } from "./components/LoginCard";
export type { LoginCardProps } from "./components/LoginCard";
export { LoginScreen } from "./components/LoginScreen";
export type {
  AppRole,
  CustomField,
  LoginScreenProps,
  LoginScreenStrings,
} from "./components/LoginScreen";
export { MethodSelector } from "./components/MethodSelector";
export type { MethodSelectorItem, MethodSelectorProps } from "./components/MethodSelector";
export { OtpInput, OtpTimer } from "./components/OtpInput";
export type { OtpInputProps, OtpTimerProps } from "./components/OtpInput";
export { PasswordInput } from "./components/PasswordInput";
export type { PasswordInputProps, PasswordStrength } from "./components/PasswordInput";
export { PhoneInput } from "./components/PhoneInput";
export type { Country, PhoneInputProps } from "./components/PhoneInput";
export { RegisterScreen } from "./components/RegisterScreen";
export type {
  FieldConfig,
  RegisterRole,
  RegisterScreenProps,
  StepComponentProps,
  StepConfig,
} from "./components/RegisterScreen";
export { SessionExpiredOverlay } from "./components/SessionExpiredOverlay";
export type { SessionExpiredOverlayProps } from "./components/SessionExpiredOverlay";
export { SessionManagerScreen } from "./components/SessionManagerScreen";
export type { SessionManagerScreenProps } from "./components/SessionManagerScreen";
export { SocialButtons } from "./components/SocialButtons";
export type { SocialButtonsProps } from "./components/SocialButtons";
export { SocialLoginButtons } from "./components/SocialLoginButtons";
export type { SocialLoginButtonsProps } from "./components/SocialLoginButtons";
export { WrongAppScreen } from "./components/WrongAppScreen";
export type { WrongAppScreenProps } from "./components/WrongAppScreen";

// Theme context — inject per-app brand colors into auth components
export { DEFAULT_THEMES, ThemeContext, ThemeProvider, useAuthTheme } from "./context/ThemeContext";
export type { AuthTheme, ThemeProviderProps } from "./context/ThemeContext";

// Rate-limit countdown hook
export { useRateLimitCountdown } from "./hooks/useRateLimitCountdown";
export type { RateLimitCountdown } from "./hooks/useRateLimitCountdown";

// Device metadata capture
export { captureDeviceMeta } from "./lib/deviceMeta";
export type { DeviceMeta } from "./lib/deviceMeta";
