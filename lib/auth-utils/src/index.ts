export { executeCaptcha, isRecaptchaLoaded } from "./captcha/index";
export { decodeJwt, isTokenExpired } from "./jwt";
export type { JwtPayload } from "./jwt";
export { MagicLinkSender } from "./magic-link/index";
export type { MagicLinkSenderProps } from "./magic-link/types";
export {
  GoogleOAuthProvider,
  decodeGoogleJwtPayload,
  initFacebookSDK,
  loadFacebookAccessToken,
  loadGoogleGSIToken,
  useFacebookLogin,
  useGoogleLogin,
  type OAuthError,
  type OAuthResult,
} from "./oauth/index";
export { canonicalizePhone, formatPhoneForApi, isValidPhone } from "./phone";
export { TwoFactorSetup, TwoFactorVerify } from "./two-factor/index";
export type { TwoFactorSetupProps, TwoFactorVerifyProps } from "./two-factor/types";
export { invalidateAuthConfigCache, useAuthConfig } from "./useAuthConfig";
export type { AuthConfig } from "./useAuthConfig";

// Permissions / RBAC catalog
export {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_IDS,
  assertPermissionId,
  compactPermissions,
  hasPermission,
  isPermissionId,
  permissionsByCategory,
} from "./permissions";
export type { PermissionCategory, PermissionDef, PermissionId } from "./permissions";
