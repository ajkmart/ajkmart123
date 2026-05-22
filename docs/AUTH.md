# AJKMart Authentication System

This document covers the full auth system built across T001–T012: token lifecycle, device fingerprinting, rate limits, error codes, and the `@workspace/auth-react` SDK integration guide.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Token Lifecycle](#token-lifecycle)
4. [Device Fingerprinting](#device-fingerprinting)
5. [Rate Limits](#rate-limits)
6. [Auth Methods](#auth-methods)
7. [Auth Flows](#auth-flows)
8. [Error Codes](#error-codes)
9. [Token Management](#token-management)
10. [Client App Integration](#client-app-integration)
11. [SDK Integration Guide](#sdk-integration-guide)
12. [Security Features](#security-features)
13. [Admin Auth Recovery](#admin-auth-recovery)
14. [Environment Variables](#environment-variables)
15. [API Reference](#api-reference)

---

## Overview

AJKMart uses a unified, token-based authentication system shared across all client apps (customer, vendor, rider) via the `@workspace/auth-react` shared package. The backend is a modular Express 5.x router in `artifacts/api-server/src/routes/auth/`.

It is a **multi-method authentication system** controlled entirely by the admin panel. No auth method is hard-coded — every method can be toggled on/off per role (customer, rider, vendor, admin) via platform settings.

Supported methods:
- **Phone OTP** — 6-digit code via SMS, WhatsApp, or email fallback
- **Email OTP** — 6-digit code sent directly to email
- **Password** — username/email/phone + password
- **Magic Link** — one-click login link via email
- **Google OAuth** — via Google Sign-In SDK
- **Facebook OAuth** — via Facebook SDK
- **TOTP 2FA** — TOTP app (authenticator) as a second factor

---

## Architecture

```
lib/auth-react/          ← Shared auth SDK (hooks, components, token storage)
├── src/hooks/           ← useAuth, useLoginFlow, useTokenRefresh
├── src/components/      ← LoginScreen, OtpInput, PhoneInput, PasswordInput, SocialButtons, BiometricPrompt
├── src/api/             ← authClient, tokenStorage
└── src/utils/           ← jwtUtils

artifacts/api-server/src/routes/auth/   ← Backend auth router (modular)
├── config.ts            ← Auth feature flags
├── identifier.ts        ← /check-identifier (smart routing)
├── otp.ts               ← /send-otp, /verify-otp
├── email-otp.ts         ← /send-email-otp, /verify-email-otp
├── password.ts          ← /login-password
├── register.ts          ← /register
├── refresh.ts           ← /refresh, session management
├── two-factor.ts        ← TOTP setup, verify-2fa
├── magic-link.ts        ← Magic link send/verify
├── social.ts            ← Google/Facebook OAuth
└── helpers.ts           ← Shared schemas and utilities
```

---

## Token Lifecycle

### Access Token

| Property | Value |
|---|---|
| Algorithm | HS256 |
| TTL | **15 minutes** (`ACCESS_TOKEN_TTL_SEC=900`) |
| Claims | `userId`, `roles`, `tokenVersion`, `jti` (UUID) |
| Storage | In-memory (web), SecureStore (native) |

Access tokens embed a `jti` (JWT ID). On logout, the `jti` is blacklisted in Redis so the token is immediately invalid even before the 15-minute window expires.

### Refresh Token

| Property | Value |
|---|---|
| TTL | **7 days** (`REFRESH_TOKEN_DAYS=7`) |
| Storage | `httpOnly` cookie (rider/vendor) or in-memory (customer) |
| Rotation | Yes — every `/auth/refresh` call rotates the token |
| Family tracking | Tokens belong to a family; reuse of an old token triggers **family breach** → all tokens in the family are revoked |

### Token Rotation Flow

```
Client                          Server
  │─── POST /auth/refresh ──────▶│
  │       { refreshToken }        │  1. Hash token and look up in DB
  │                               │  2. Check not revoked, not expired
  │                               │  3. Verify family not breached
  │◀── { token, refreshToken } ───│  4. Revoke old token, issue new pair
  │                               │  5. New refresh token stored in DB
```

**Family breach detection:** If a refresh token that was already rotated (and thus revoked) is presented again, the server detects token theft. All tokens in the family are immediately invalidated and the user is logged out everywhere.

### Token Version

Every user has a `tokenVersion` integer. When the server signs an access token it embeds the current `tokenVersion`. On validation, mismatches reject the token immediately — this is how logout, password change, and admin suspension take immediate effect across all devices without waiting for TTL.

---

## Device Fingerprinting

The auth system tracks trusted devices to allow 2FA bypass for known devices.

**How it works:**
1. After successful 2FA verification, the client can call `POST /auth/2fa/trust-device` with a `deviceFingerprint` string (min 8 chars).
2. The server stores the fingerprint hash in `users.trustedDevices` JSON array with a configurable expiry (`auth_trusted_device_days`, default 30 days).
3. On subsequent logins, if the presented fingerprint matches a trusted device, the 2FA challenge is skipped.

**Recommended fingerprint generation (client-side):**
```javascript
const fp = btoa([
  navigator.userAgent,
  navigator.language,
  screen.width,
  screen.height,
  Intl.DateTimeFormat().resolvedOptions().timeZone,
].join("|")).slice(0, 32);
```

**Security note:** Device fingerprinting is a convenience feature, not a security boundary. It reduces friction for trusted devices but does not replace 2FA entirely — the fingerprint is hashed server-side but fingerprints are inherently spoofable by a determined attacker.

---

## Rate Limits

| Limiter | Scope | Window | Max Requests |
|---|---|---|---|
| `globalLimiter` | All `/api/*` | 15 min | 300 |
| `authLimiter` | All `/api/auth/*` | 15 min | 20 |
| `loginLimiter` | `POST /auth/login`, `POST /auth/login/username` | 60 s | 5 / IP |
| `otpLimiter` | `POST /auth/send-otp`, `POST /auth/verify-otp` | 60 s | 3 / phone or IP |
| `adminAuthLimiter` | Admin login routes | 15 min | 10 |
| `checkIdentifierLimiter` | `POST /auth/check-identifier` | 60 s | 10 / IP |
| `checkAvailableRateLimit` | `POST /auth/check-available` | 10 min | 20 / IP |

**OTP resend cooldown:** After sending an OTP, the same phone must wait `security_otp_cooldown_sec` (default 60 s) before requesting another.

**Account lockout:** After `security_login_max_attempts` (default 5) failed OTP/password attempts, the account is locked for `security_lockout_minutes` (default 30 minutes).

---

## Auth Methods

### Phone OTP (`POST /auth/send-otp` → `POST /auth/verify-otp`)

```
1. POST /api/auth/send-otp        { phone: "03001234567" }
   ← { otpRequired: true, channel: "sms", fallbackChannels: [...] }

2. POST /api/auth/verify-otp      { phone: "03001234567", otp: "654321" }
   ← { token, refreshToken, user, isNewUser }
   OR if 2FA: { twoFactorRequired: true, tempToken }
```

**OTP delivery channels** (in priority order, configurable via `otp_channel_priority`):
1. WhatsApp (if `integration_whatsapp=on`)
2. SMS (Twilio / bulk provider)
3. Email (SendGrid / SMTP)
4. Console (dev/staging only — OTP printed to server logs)

### Password Login (`POST /auth/login`)

```
POST /api/auth/login   { identifier: "phone|email|username", password }
← { token, refreshToken, user }
OR if 2FA: { twoFactorRequired: true, tempToken }
```

### Magic Link (`POST /auth/send-magic-link`)

```
POST /api/auth/send-magic-link   { email }
← { sent: true }
```

The user clicks the link in their email, which hits `POST /api/auth/verify-magic-link` with the one-time token.

### Two-Factor Authentication (TOTP)

**Setup flow:**
```
1. GET  /api/auth/2fa/setup         ← { secret, uri, qrDataUrl }
2. POST /api/auth/2fa/verify-setup  { code: "123456" }
   ← { backupCodes: [...] }   (show once — save securely)
```

**Login with 2FA:**
```
1. Normal login returns: { twoFactorRequired: true, tempToken }
2. POST /api/auth/2fa/verify  { tempToken, code: "123456" }
   ← { token, refreshToken, user }
```

**Recovery codes (if TOTP app is lost):**
```
POST /api/auth/2fa/recovery  { tempToken, backupCode: "abcd1234" }
← { token, refreshToken, codesRemaining: N }
```

---

## Auth Flows

### OTP (Phone/Email)
1. Client calls `POST /api/auth/check-identifier` → server returns `action` (e.g., `send_phone_otp`)
2. Client calls `POST /api/auth/send-otp` or `POST /api/auth/send-email-otp`
3. User enters OTP → client calls `POST /api/auth/verify-otp`
4. Server returns `{ token, refreshToken }` → stored in tokenStorage

### Password
1. `check-identifier` returns `login_password`
2. Client calls `POST /api/auth/login-password`
3. Server returns `{ token, refreshToken }`

### 2FA (TOTP)
1. After initial auth, server returns `{ requires2FA: true, tempToken }`
2. Client calls `POST /api/auth/verify-2fa` with `{ tempToken, totpCode }`

### Magic Link
1. Client calls `POST /api/auth/magic-link/send`
2. User clicks link → client calls `POST /api/auth/magic-link/verify`

### Social (Google/Facebook)
1. Client obtains ID token from provider SDK
2. Client calls `POST /api/auth/social-google` or `POST /api/auth/social-facebook`

---

## Error Codes

| HTTP Status | `error` / `code` field | Meaning |
|---|---|---|
| 400 | `AUTH_METHOD_DISABLED` | The requested auth method is off in platform settings |
| 400 | `token and password required` | Missing required fields |
| 400 | `Please call /auth/2fa/setup first` | TOTP setup not started |
| 401 | `Invalid or expired token` | JWT is malformed, expired, or blacklisted |
| 401 | `Invalid or expired OTP` | OTP wrong, expired, or already used |
| 401 | `Invalid 2FA code` | TOTP code wrong |
| 401 | `Invalid or expired 2FA challenge token` | `tempToken` expired (5 min TTL) |
| 401 | `Token revoked` | `tokenVersion` mismatch — user logged out or password changed |
| 403 | `Account suspended` | User `isBanned=true` |
| 403 | `Account inactive` | User `isActive=false` |
| 409 | `2FA is already enabled` | Cannot re-setup without disabling first |
| 422 | `Invalid verification code` | OTP hash mismatch |
| 422 | `Verification code has expired` | OTP TTL (10 min) elapsed |
| 429 | `Account temporarily locked` | Lockout after too many failures |
| 429 | `Please wait N second(s)` | OTP resend cooldown active |
| 502 | `Could not deliver OTP` | All SMS/email channels failed in production |
| 503 | `OTP delivery is not configured` | `otp_require_when_no_provider=on` with no SMS/email configured |

---

## Token Management

- **Access token**: Short-lived JWT (configurable lifetime), stored in `tokenStorage`
- **Refresh token**: Long-lived, stored in `tokenStorage` (SecureStore on mobile, httpOnly cookie / localStorage on web)
- **Token family breach detection**: If a refresh token is reused after rotation, the entire family is invalidated (`FAMILY_BREACH_DETECTED`)
- **Proactive refresh**: Access tokens are refreshed at 85% of lifetime to avoid expiry mid-session

---

## Client App Integration

### Vendor App (`artifacts/vendor-app/`)
- `src/lib/vendor-auth.tsx` — VendorAuthProvider (wraps `SharedAuthProvider` from `@workspace/auth-react`)
- `src/pages/Login.tsx` — Uses `LoginScreen` + individual components from `@workspace/auth-react`

### Rider App (`artifacts/rider-app/`)
- `src/lib/rider-auth.tsx` — RiderAuthProvider (wraps `SharedAuthProvider`)
- `src/pages/Login.tsx` — Uses `LoginScreen` from `@workspace/auth-react`

### Customer App (`artifacts/ajkmart/`)
- `context/AuthContext.tsx` — Full auth context (uses `@workspace/auth-react` types)
- `app/auth/index.tsx` — Login screen (follows `LoginScreen` contract from `@workspace/auth-react`)

---

## SDK Integration Guide

The `@workspace/auth-react` package provides ready-made components and hooks for any React (web) or React-compatible app in this monorepo.

### Installation

```json
// In your package.json
{
  "dependencies": {
    "@workspace/auth-react": "workspace:*"
  }
}
```

### Basic Setup

Wrap your app (or auth section) with `AuthProvider`:

```tsx
import { AuthProvider } from "@workspace/auth-react";

function App() {
  return (
    <AuthProvider
      role="customer"          // "customer" | "rider" | "vendor" | "admin"
      storageType="web"        // "web" | "web-local" | "memory" | "native"
      baseURL=""               // Leave empty to use relative URLs
    >
      <YourApp />
    </AuthProvider>
  );
}
```

### Drop-in Login Screen

```tsx
import { LoginScreen } from "@workspace/auth-react";

function LoginPage() {
  return (
    <LoginScreen
      role="vendor"
      onSuccess={(user, token) => {
        console.log("Logged in:", user.id);
        navigate("/dashboard");
      }}
    />
  );
}
```

### OTP Input Component

```tsx
import { OtpInput } from "@workspace/auth-react";

function OtpStep() {
  return (
    <OtpInput
      length={6}
      onComplete={(otp) => verifyOtp(otp)}
      onResend={() => resendOtp()}
      resendCooldownSeconds={60}
      label="Enter the 6-digit code"
    />
  );
}
```

### `useLoginFlow` Hook

For custom UI, use the hook directly:

```tsx
import { useLoginFlow } from "@workspace/auth-react";

function CustomLogin() {
  const {
    initiateLogin,   // (identifier) => Promise<{ method, exists }>
    verifyOtp,       // (otp) => Promise<void>
    verifyPassword,  // (password) => Promise<void>
    twoFactorVerify, // (code) => Promise<void>
    loading,
    error,
    method,          // null | "otp" | "password" | "social" | "totp"
    twoFactorPending,
    clearError,
  } = useLoginFlow({ baseURL: "", onSuccess: (user, token) => {} });

  // Step 1: check identifier
  const handleSubmit = async (id: string) => {
    const { method } = await initiateLogin(id);
    if (method === "otp") {
      // show OTP input
    }
  };
}
```

### `useAuth` Hook

Access the current auth state from anywhere inside `AuthProvider`:

```tsx
import { useAuth } from "@workspace/auth-react";

function ProfileButton() {
  const { user, isAuthenticated, logout } = useAuth();
  if (!isAuthenticated) return <LoginButton />;
  return <button onClick={logout}>{user?.phone}</button>;
}
```

### Session Manager

```tsx
import { SessionManagerScreen } from "@workspace/auth-react";

function SecuritySettings() {
  return <SessionManagerScreen />;
}
```

### Token Utilities

```tsx
import { decodeJwt, isTokenExpired, getTokenExpiryRemaining } from "@workspace/auth-react";

const payload = decodeJwt(token);
const expired = isTokenExpired(token);
const remainingSec = getTokenExpiryRemaining(token);
```

### Native (Expo) Integration

For React Native / Expo, use `storageType="native"` which automatically uses `expo-secure-store`:

```ts
import { createNativeTokenStorage } from "@workspace/auth-react";

const storage = await createNativeTokenStorage(); // restores from SecureStore on mount
```

---

## Security Features

| Feature | Implementation |
|---|---|
| Token family breach detection | `FAMILY_BREACH_DETECTED` flag in middleware |
| TOTP / 2FA | RFC 6238, secrets stored in DB (not in-memory) |
| Rate limiting | Per-route limits via express-rate-limit |
| OTP brute-force protection | Attempt counter + lockout in DB |
| Device fingerprinting | `deviceId` sent with auth requests |
| UTF-8 safe JWT decode | `decodeURIComponent(escape(atob()))` pattern |
| Account recovery | `POST /api/admin/auth/recovery` (admin only) |

---

## Admin Auth Recovery

Admins can recover locked/suspended accounts via:

```
POST /api/admin/auth/recovery
Authorization: Bearer <admin-token>

{
  "targetUserId": "user-id",
  "action": "unlock" | "unsuspend" | "reset_attempts" | "force_logout",
  "reason": "Reason for recovery action (min 10 chars)"
}
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `JWT_SECRET` | Secret for signing access tokens |
| `REFRESH_TOKEN_SECRET` | Secret for signing refresh tokens |
| `JWT_EXPIRY` | Access token lifetime (default: `15m`) |
| `REFRESH_TOKEN_EXPIRY` | Refresh token lifetime (default: `30d`) |
| `CAPTCHA_SECRET_KEY` | reCAPTCHA server-side secret |

---

## API Reference

Full Swagger documentation is available at **`/api-docs`** when the API server is running.

### Auth Endpoints Summary

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/check-identifier` | Check if identifier exists and get available login methods |
| POST | `/api/auth/send-otp` | Send OTP via SMS/WhatsApp/email |
| POST | `/api/auth/verify-otp` | Verify OTP and issue tokens |
| POST | `/api/auth/login` | Login with password |
| POST | `/api/auth/login/username` | Alias for `/auth/login` |
| POST | `/api/auth/register` | Register new account |
| POST | `/api/auth/refresh` | Rotate refresh token and issue new access token |
| POST | `/api/auth/logout` | Revoke tokens and end session |
| POST | `/api/auth/forgot-password` | Request password reset OTP |
| POST | `/api/auth/verify-reset-otp` | Verify reset OTP before setting new password |
| POST | `/api/auth/reset-password` | Set new password using reset OTP |
| POST | `/api/auth/set-password` | Change password (authenticated) |
| GET  | `/api/auth/2fa/setup` | Generate TOTP secret + QR code |
| POST | `/api/auth/2fa/verify-setup` | Confirm TOTP setup (activates 2FA) |
| POST | `/api/auth/2fa/verify` | Verify TOTP code during login |
| POST | `/api/auth/2fa/disable` | Disable 2FA (requires valid TOTP) |
| POST | `/api/auth/2fa/recovery` | Login using backup recovery code |
| POST | `/api/auth/totp/enable` | Canonical alias for `2fa/verify-setup` |
| POST | `/api/auth/totp/recover` | Canonical alias for `2fa/recovery` |
| POST | `/api/auth/2fa/trust-device` | Add device fingerprint to trusted list |
| GET  | `/api/auth/sessions` | List active sessions |
| DELETE | `/api/auth/sessions` | Revoke all sessions |
| DELETE | `/api/auth/sessions/:id` | Revoke a single session |
| POST | `/api/auth/sessions/revoke` | Revoke specific session or all-except-current |
| GET  | `/api/auth/login-history` | List last 20 login events |
| POST | `/api/auth/validate-token` | Validate an access token |
| POST | `/api/auth/check-available` | Check if phone/email/username is taken |
| POST | `/api/auth/send-email-otp` | Send OTP to email |
| POST | `/api/auth/verify-email-otp` | Verify email OTP |
| POST | `/api/auth/send-magic-link` | Send magic-link login email |
| POST | `/api/auth/verify-magic-link` | Verify magic-link token |
| POST | `/api/auth/merge` | Merge accounts (authenticated) |
| POST | `/api/auth/google` | Google OAuth sign-in |
| POST | `/api/auth/facebook` | Facebook OAuth sign-in |
| POST | `/api/auth/recovery/reset-password` | Reset password via admin-issued recovery link |
