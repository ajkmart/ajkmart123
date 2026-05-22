/**
 * auth-schemas.ts — canonical auth validation schema module
 *
 * Single source of truth for all authentication and registration Zod schemas
 * used across auth routes (otp, register, password, social, magic-link, merge,
 * refresh, complete-profile, 2FA). All auth routes MUST import schemas from
 * this module rather than from schemas.ts directly or defining schemas inline.
 *
 * Non-auth schemas (orders, wallet, products, etc.) remain in schemas.ts.
 */

export {
  ChangePhoneConfirmSchema,
  ChangePhoneRequestSchema,
  CheckAvailableSchema,
  CompleteProfileSchema,
  EmailRegisterSchema,
  FirebaseVerifySchema,
  LinkFacebookSchema,
  LinkGoogleSchema,
  LoginVerifyOtpSchema,
  LogoutSchema,
  MagicLinkSendSchema,
  MagicLinkVerifySchema,
  MergeAccountSchema,
  ResetPasswordSchema,
  SendEmailOtpSchema,
  SendMergeOtpSchema,
  SendOtpSchema,
  SetPasswordSchema,
  SocialFacebookSchema,
  SocialGoogleSchema,
  TotpCodeSchema,
  TrustDeviceSchema,
  TwoFaRecoverySchema,
  TwoFaVerifySchema,
  UserLoginSchema,
  ValidateTokenSchema,
  VendorRegisterSchema,
  VerifyEmailOtpSchema,
  VerifyOtpSchema,
  VerifyResetOtpSchema,
} from "./schemas.js";
