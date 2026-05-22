# @workspace/auth-utils

Shared authentication utilities for AJKMart. Provides server-side helpers, reusable web components, native (Expo) auth hooks, and JWT utilities used across the API server and all client apps.

## Server Helpers

Located in `lib/auth-utils/src/server.ts`:

```ts
import { isAuthMethodEnabled, isAuthMethodEnabledStrict } from "@workspace/auth-utils/server";

// Check if a login method is toggled on in platform_settings
// Returns false if the method is explicitly disabled; true if not set (permissive default)
await isAuthMethodEnabled("google_login", platformSettings);

// Strict variant — returns false if the method is not explicitly enabled
// Used for sensitive flows (magic links, biometric) that must be opted in
await isAuthMethodEnabledStrict("magic_link", platformSettings);
```

Auth methods controlled by platform settings: `phone_otp`, `email_otp`, `username_password`, `google_login`, `facebook_login`, `magic_link`, `biometric`.

## Web Components

Located in `lib/auth-utils/src/two-factor/` and `lib/auth-utils/src/magic-link/`:

```tsx
import { TwoFactorSetup, TwoFactorVerify } from "@workspace/auth-utils";
import { MagicLinkSender } from "@workspace/auth-utils";

// 2FA setup wizard — renders QR code + backup codes
<TwoFactorSetup userId={userId} onComplete={() => router.push("/profile")} />

// 2FA verification modal — handles TOTP code entry
<TwoFactorVerify onVerified={(token) => completeLogin(token)} />

// Magic link request form — triggers email dispatch
<MagicLinkSender email={email} redirectTo="/dashboard" />
```

## Native (Expo) Helpers

Located in `lib/auth-utils/src/captcha/` and `lib/auth-utils/src/oauth/`:

```tsx
import { CaptchaModal } from "@workspace/auth-utils/captcha";
import { useGoogleLoginNative, useFacebookLoginNative } from "@workspace/auth-utils/oauth";

// Invisible reCAPTCHA WebView modal for mobile
<CaptchaModal visible={show} onVerified={(token) => proceed(token)} />

// Google OAuth via expo-auth-session
const { signIn, loading } = useGoogleLoginNative();

// Facebook OAuth via expo-auth-session
const { signIn, loading } = useFacebookLoginNative();
```

## JWT Helpers

Located in `lib/auth-utils/src/jwt.ts`:

```ts
import { signAccessToken, verifyUserJwt, sign2faChallengeToken } from "@workspace/auth-utils/jwt";

// Sign a short-lived access token (role-scoped)
const token = signAccessToken(userId, phone, "customer", "customer,rider", tokenVersion);

// Verify and decode any user JWT
const payload = verifyUserJwt(token);  // throws on invalid/expired

// Sign a temporary 2FA challenge token (used between step 1 and step 2 of login)
const challengeToken = sign2faChallengeToken(userId, "totp");
```

## Required Environment Variables

| Variable | Used by | Description |
|---|---|---|
| `RECAPTCHA_SITE_KEY` | `CaptchaModal` | Google reCAPTCHA v2/v3 site key |
| `GOOGLE_CLIENT_ID` | `useGoogleLoginNative` | Google OAuth client ID |
| `FACEBOOK_APP_ID` | `useFacebookLoginNative` | Facebook App ID for OAuth |
| `JWT_SECRET` | JWT helpers | Primary signing secret (min 32 chars) |

Missing `RECAPTCHA_SITE_KEY` disables captcha enforcement silently in dev. In production, the API rejects unverified registrations.
