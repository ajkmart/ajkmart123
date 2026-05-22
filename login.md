# AJKMart — Complete Full-Stack Auth System Redesign Plan

## Overview
Yeh document **Admin Panel**, **Vendor App**, **Rider App**, aur **Customer App (AJKMart)** ke
login / logout / signup / forgot-password system ka mukammal redesign plan hai.
Har prompt ek independent kaam hai — sequentially execute karna hai.

---

## 🔍 Current State — Project Structure

### Apps & Their Auth Entry Points

| App | Framework | Auth Files | Storage |
|-----|-----------|-----------|---------|
| **Admin Panel** | React + Vite | `artifacts/admin/src/lib/auth/LoginScreen.tsx`, `forgot-password.tsx`, `reset-password.tsx` | `sessionStorage` (tab-scoped) |
| **Vendor App** | React + Vite | `artifacts/vendor-app/src/lib/auth/LoginScreen.tsx`, `RegisterWizard.tsx`, `ForgotPassword.tsx` | `sessionStorage` (tab-scoped) |
| **Rider App** | React + Vite | `artifacts/rider-app/src/lib/auth/LoginScreen.tsx`, `RegisterWizard.tsx`, `ForgotPassword.tsx` | `@capacitor/preferences` |
| **Customer App** | Expo RN | `artifacts/ajkmart/app/auth/index.tsx`, `register.tsx`, `forgot-password.tsx` | `expo-secure-store` + `AsyncStorage` |

### Shared Libraries

| Library | Path | Purpose |
|---------|------|---------|
| `@workspace/auth-react` | `lib/auth-react/src/` | Shared OtpInput, PhoneInput, OtpTimer, SharedAuthProvider |
| `@workspace/auth-utils` | `lib/auth-utils/src/` | JWT helpers, phone utils, captcha, magic-link, 2FA components |
| `@workspace/i18n` | `lib/i18n/src/` | Multi-language (EN, UR, Roman Urdu, Dual modes) |
| `@workspace/ui` | `lib/ui/src/` | Shared Radix UI components (Button, Input, Dialog, etc.) |

### Backend Auth Routes (`artifacts/api-server/src/routes/auth/`)

| File | Endpoints |
|------|-----------|
| `phone.routes.ts` | `POST /auth/send-otp`, `POST /auth/verify-otp` |
| `email.routes.ts` | `POST /auth/send-email-otp`, `POST /auth/verify-email-otp` |
| `password.ts` | `POST /auth/login`, `POST /auth/login/username`, `POST /auth/forgot-password`, `POST /auth/verify-reset-otp`, `POST /auth/reset-password`, `POST /auth/set-password` |
| `register.ts` | `POST /auth/register`, `POST /auth/vendor-register`, `POST /auth/complete-profile`, `POST /auth/check-available` |
| `magic-link.ts` | `POST /auth/magic-link/send`, `POST /auth/magic-link/verify` |
| `social.ts` | `POST /auth/social/google`, `POST /auth/social/facebook`, `POST /auth/firebase-verify`, `POST /auth/link-google`, `POST /auth/link-facebook` |
| `totp.routes.ts` | `GET /auth/2fa/setup`, `POST /auth/2fa/verify-setup`, `POST /auth/2fa/verify`, `POST /auth/2fa/disable`, `POST /auth/2fa/recovery`, `POST /auth/2fa/trust-device`, `GET /auth/2fa/status` |
| `refresh.ts` | `POST /auth/refresh`, `POST /auth/refresh-token`, `POST /auth/logout`, `GET /auth/sessions` |
| `identifier.ts` | `POST /auth/check-identifier`, `GET /auth/login-history` |
| `sessions.ts` | Session revocation endpoints |
| `phone-account.ts` | `POST /auth/add-phone` (merge OTP flow) |

---

## ⚙️ Admin Platform Settings Matrix (Auth Control)

Yeh settings **Admin Panel → Settings** se control hoti hain aur `platform_settings` table mein store hoti hain.

### Auth Method Toggles
```
auth_mode                       = "OTP"     # OTP | EMAIL | FIREBASE | HYBRID
auth_otp_enabled                = "on"      # Master OTP toggle
auth_phone_otp_enabled          = "on"      # Phone SMS/WhatsApp OTP
auth_email_otp_enabled          = "on"      # Email OTP
auth_email_enabled              = "on"      # Email-based auth
auth_username_password_enabled  = "off"     # Username+Password login
auth_google_enabled             = "on"      # Google OAuth
auth_facebook_enabled           = "off"     # Facebook OAuth
auth_magic_link_enabled         = "off"     # Magic Link (passwordless)
auth_magic_link_ttl_min         = "30"      # Magic Link expiry (minutes)
auth_biometric_enabled          = "off"     # Fingerprint/FaceID (per-role JSON)
```

### Registration & Approval
```
feature_new_users               = "on"      # Allow new user registration
user_require_approval           = "off"     # Customers need admin approval
rider_auto_approve              = "off"     # Riders bypass manual review
vendor_auto_approve             = "off"     # Vendors bypass manual review
```

### Security & Rate Limits
```
security_lockout_enabled        = "on"      # Account lockout on failures
security_login_max_attempts     = "5"       # Max failed logins before lockout
security_lockout_minutes        = "30"      # Lockout duration
security_otp_max_per_phone      = "5"       # OTP requests per phone/window
security_otp_max_per_ip         = "10"      # OTP requests per IP/window
security_otp_window_min         = "60"      # Rate limit window (minutes)
security_mfa_required           = "off"     # Force TOTP for all admins
security_super_admin_mfa_required = "on"   # Force TOTP for super-admins
security_admin_token_hrs        = "8"       # Admin JWT expiry hours
security_session_days           = "30"      # Customer refresh token days
security_rider_token_days       = "7"       # Rider token expiry days
security_admin_ip_whitelist     = ""        # CIDR whitelist for admin access
otp_channel_priority            = "whatsapp,sms,email"  # OTP delivery order
```

### OTP Bypass (Admin Control Center)
```
security_otp_bypass             = "off"     # Global OTP bypass (dev only)
otp_global_disabled_until       = ""        # Timed global suspension
```

---

## 🏗️ New Architecture — Auth Flow Per App

### Admin Panel Auth Flow
```
[Login Page]
    ↓ POST /auth/admin/login (username + password)
    ↓ → 200: { requires2FA: true } → [TOTP Screen]
    ↓ → 200: { accessToken, adminId } → [Dashboard]
    ↓ POST /auth/admin/2fa/verify (totp code)
    
[Forgot Password]
    ↓ POST /auth/admin/forgot-password (email/username)
    ↓ → Email with reset link (token)
    ↓ POST /auth/admin/reset-password (token + newPassword)
    
[Session]
    - HttpOnly cookie: refresh token
    - sessionStorage: access token (tab-scoped)
    - Auto-refresh 60s before expiry
    - IP whitelist check on each request
```

### Vendor App Auth Flow
```
[Login Screen]
    ↓ Phone OTP:    POST /auth/send-otp → POST /auth/verify-otp
    ↓ Password:     POST /auth/login
    ↓ Google:       POST /auth/social/google
    ↓ Biometric:    POST /auth/refresh (with biometric token)
    ↓ → Approval check (pending/rejected overlay)
    ↓ → Dashboard

[Register Wizard — 4 Steps]
    Step 1: Store Info (category, name, city)
    Step 2: Contact (phone → OTP verify) + CNIC
    Step 3: Bank/Payout details
    Step 4: Password setup
    → POST /auth/vendor-register

[Forgot Password — 5 Steps]
    Step 1: Choose method (Phone/Email)
    Step 2: Send OTP → POST /auth/forgot-password
    Step 3: Verify OTP → POST /auth/verify-reset-otp
    Step 4: New password → POST /auth/reset-password
    Step 5: TOTP gate (if 2FA enabled) → POST /auth/2fa/verify

[Logout]
    → POST /auth/logout
    → Clear sessionStorage
    → Clear React Query cache
    → Redirect /login
```

### Rider App Auth Flow
```
[Login Screen]
    ↓ Phone OTP:    POST /auth/send-otp → POST /auth/verify-otp
    ↓ Password:     POST /auth/login
    ↓ Google:       POST /auth/social/google
    ↓ Biometric:    POST /auth/refresh (biometric token)
    ↓ → Dashboard

[Register Wizard — 5 Steps]
    Step 1: Personal Info (name, phone, username)
    Step 2: OTP Verification (inline SMS verify)
    Step 3: Vehicle Info (CNIC, vehicle type, license, registration)
    Step 4: KYC Documents (photos: vehicle, license, CNIC front/back)
    Step 5: Password setup
    → POST /auth/register (role: rider) + POST /uploads/register

[Forgot Password]
    Step 1: Identify (phone/email)
    Step 2: Send OTP → POST /auth/forgot-password
    Step 3: Verify OTP → POST /auth/verify-reset-otp
    Step 4: New password → POST /auth/reset-password
    (2FA gate if enabled)

[Logout]
    → POST /auth/logout (logoutSequence)
    → Clear @capacitor/preferences
    → Disconnect socket
    → Redirect /login
```

### Customer App (AJKMart) Auth Flow
```
⚠️  DO NOT MODIFY — artifacts/ajkmart is read-only per user preferences.
    Included here for documentation only.

[Login — 7 Methods]
    1. Phone OTP:    POST /auth/send-otp → POST /auth/verify-otp
    2. Email OTP:    POST /auth/send-email-otp → POST /auth/verify-email-otp
    3. Username+PW:  POST /auth/login
    4. Google:       expo-auth-session → POST /auth/social/google
    5. Facebook:     expo-auth-session → POST /auth/social/facebook
    6. Magic Link:   deep link handler → POST /auth/magic-link/verify
    7. Biometric:    expo-local-authentication → POST /auth/refresh

[Register — 5 Steps]
    Step 1: Phone Verify (OTP)
    Step 2: Personal Details (name, email, username — availability check)
    Step 3: Location (city, area, GPS reverse geocoding)
    Step 4: Security (password + CNIC + Terms acceptance)
    Step 5: Success (accountLevel badge + signup bonus)
    → POST /auth/register + POST /auth/complete-profile

[Forgot Password — 3 Steps + 2FA gate]
    Step 1: Identify (phone/email)
    Step 2: Verify OTP
    Step 3: New password (+ TOTP if 2FA enabled)

[Special Screens]
    - wrong-app.tsx: Rider/Vendor trying to log into customer app
    - MagicLinkHandler.tsx: Deep link interception
    - DevOtpBanner: Shows dev OTP in development mode
```

---

## 📋 IMPLEMENTATION PLAN — Step by Step Prompts

---

### ═══ PROMPT 1 — DB Schema: Auth Events & Session Tables ═══

```
Task: Database schema improvements for the auth system.

Files to create/modify:
- lib/db/src/schema/auth_events.ts   (NEW)
- lib/db/src/schema/trusted_devices.ts (NEW)
- lib/db/migrations/XXXX_auth_events.sql (NEW)

1. auth_events table:
   CREATE TABLE auth_events (
     id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
     event_type  TEXT NOT NULL,  -- login_success | login_fail | logout | register | password_reset | 2fa_enable | 2fa_disable | magic_link | social_login | biometric | account_lock | otp_bypass
     channel     TEXT,           -- phone_otp | email_otp | password | google | facebook | magic_link | biometric
     role        TEXT,           -- customer | rider | vendor | admin
     ip          TEXT,
     user_agent  TEXT,
     device_id   TEXT,
     country     TEXT,
     city        TEXT,
     success     BOOLEAN NOT NULL DEFAULT true,
     failure_reason TEXT,
     metadata    JSONB,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   Indexes: (user_id), (event_type), (created_at), (ip + created_at)

2. trusted_devices table:
   CREATE TABLE trusted_devices (
     id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
     device_id    TEXT NOT NULL,
     device_name  TEXT,
     device_type  TEXT,  -- mobile | desktop | tablet
     fingerprint  TEXT,
     trusted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     expires_at   TIMESTAMPTZ NOT NULL,
     last_used_at TIMESTAMPTZ,
     is_revoked   BOOLEAN NOT NULL DEFAULT false
   );
   Indexes: (user_id), (device_id), (expires_at)

3. Run migration via drizzle-kit push.

4. Export both tables from lib/db/src/schema/index.ts.

Acceptance: Both tables exist in DB. Schema compiles with 0 TS errors.
```

---

### ═══ PROMPT 2 — Backend: Auth Response Standardization ═══

```
Task: Standardize ALL auth API responses to a consistent shape.

File: artifacts/api-server/src/lib/auth-response.ts (NEW)

Standard response shapes:

SUCCESS LOGIN:
{
  success: true,
  data: {
    accessToken: string,
    refreshToken?: string,     // only for mobile clients
    expiresIn: number,         // seconds
    user: {
      id, name, phone, email, username, avatar,
      role, roles, accountLevel, walletBalance,
      phoneVerified, emailVerified, totpEnabled,
      kycStatus, approvalStatus, isActive,
      city, ajkId
    },
    requires2FA?: boolean,
    twoFactorToken?: string,   // short-lived challenge token
    isNewUser?: boolean,       // true on first login via social
    sessionId?: string
  }
}

ERROR:
{
  success: false,
  error: string,              // English
  message?: string,           // localized (Urdu/English)
  data?: {
    code: string,             // INVALID_OTP | ACCOUNT_LOCKED | APPROVAL_PENDING | WRONG_APP | etc.
    attemptsRemaining?: number,
    lockoutUntil?: string,    // ISO timestamp
    retryAfterMs?: number,
    redirectTo?: string       // for wrong-app detection
  }
}

Error Codes to standardize:
- INVALID_OTP           → wrong/expired OTP
- ACCOUNT_LOCKED        → too many failed attempts
- ACCOUNT_SUSPENDED     → admin banned
- APPROVAL_PENDING      → vendor/rider awaiting approval
- APPROVAL_REJECTED     → vendor/rider rejected
- WRONG_APP             → rider trying customer app login
- 2FA_REQUIRED          → 2FA challenge issued
- INVALID_CREDENTIALS   → wrong password
- PHONE_NOT_REGISTERED  → phone not found
- EMAIL_NOT_REGISTERED  → email not found
- REGISTRATION_REQUIRED → new user needs to register
- DELIVERY_FAILED       → OTP could not be delivered
- TOKEN_EXPIRED         → JWT/refresh token expired
- ROLE_MISMATCH         → trying to login as wrong role

Files to update:
- All files in artifacts/api-server/src/routes/auth/
- Use sendAuthSuccess() and sendAuthError() helper functions
- Add event logging to auth_events table on every auth operation

Acceptance: All auth endpoints return consistent shapes. TS 0 errors.
```

---

### ═══ PROMPT 3 — Backend: Registration System Hardening ═══

```
Task: Harden and complete the registration system for all 3 roles.

Files:
- artifacts/api-server/src/routes/auth/register.ts
- artifacts/api-server/src/routes/auth/identifier.ts

Changes:

1. /auth/check-available (GET with query params):
   - Check username, email, phone availability
   - Return { available: true/false, suggestions: string[] } for username conflicts
   - Rate limit: 20/min per IP

2. /auth/register:
   - Validate feature_new_users = "on" (block if off, return REGISTRATION_DISABLED)
   - Validate role is allowed (customer | rider | vendor)
   - AJK ID generation: "AJK-XXXXXX" (retry up to 10 times for uniqueness)
   - CNIC validation: XXXXX-XXXXXXX-X format, encrypt with ENCRYPTION_MASTER_KEY
   - Log to auth_events: { event_type: "register", channel, role }
   - On success: { success: true, data: { user, accessToken, isNewUser: true } }

3. /auth/vendor-register:
   - Validate vendor_auto_approve setting → set approvalStatus accordingly
   - Create vendor_profiles row immediately (storeName, storeCategory, city)
   - Send admin notification: "New vendor application from {name}"
   - Log to auth_events

4. /auth/complete-profile (customer 5-step registration final step):
   - Accept: name, email, city, area, address, latitude, longitude, cnic, password
   - Validate reg_token (short-lived token from phone verify step)
   - Set accountLevel: "bronze" (default for new users)
   - Apply signup bonus from platform_settings["signup_bonus_amount"]
   - Log to auth_events

5. Role detection on verify-otp:
   - If user has roles "rider" and client is vendor → return WRONG_APP error
   - Include redirectTo hint in error response

Acceptance: All 3 registration flows work. AJK ID generated. CNIC encrypted.
```

---

### ═══ PROMPT 4 — Backend: Password Reset + Magic Link ═══

```
Task: Complete and harden password reset + magic link flows.

Files:
- artifacts/api-server/src/routes/auth/password.ts
- artifacts/api-server/src/routes/auth/magic-link.ts

PASSWORD RESET FLOW:

1. POST /auth/forgot-password:
   - Accept: { identifier } (phone or email)
   - Rate limit: 3 requests per hour per identifier
   - Send OTP via otp module (uses otp_channel_priority)
   - On unknown identifier: ALWAYS return success (anti-enumeration)
   - Save reset_context: { type: "password_reset", identifier, expiresAt }
   - Log to auth_events: { event_type: "password_reset_request" }

2. POST /auth/verify-reset-otp:
   - Verify OTP from otp_tokens table
   - Issue a short-lived reset_token (JWT, 10 min TTL, signed with JWT_SECRET)
   - reset_token payload: { userId, purpose: "password_reset", jti }
   - Return: { success: true, data: { resetToken, requires2FA } }

3. POST /auth/reset-password:
   - Validate reset_token (check purpose, expiry, jti not reused)
   - If user has TOTP enabled → also validate totpCode in body
   - Hash new password via bcrypt (cost 12)
   - Increment tokenVersion → invalidates all outstanding JWTs
   - Revoke all refresh tokens for this user
   - Log to auth_events: { event_type: "password_reset" }
   - Return: { success: true, message: "Password updated. Please login again." }

4. POST /auth/set-password (authenticated — for users without password):
   - Requires valid accessToken
   - Validate current password if already set
   - Same hardening as reset-password

MAGIC LINK FLOW:

5. POST /auth/magic-link/send:
   - Check auth_magic_link_enabled = "on" (else 403 METHOD_DISABLED)
   - Rate limit: 3/hour per email
   - Generate secure token: crypto.randomBytes(32).toString('hex')
   - Hash token before storing in magic_link_tokens table
   - TTL: auth_magic_link_ttl_min (default 30 min)
   - Send email with link: {DOMAIN}/auth/magic?token=RAW_TOKEN
   - Log to auth_events

6. POST /auth/magic-link/verify:
   - Hash incoming token, look up in magic_link_tokens
   - Validate: not used, not expired
   - Mark as used (used_at = NOW())
   - Issue accessToken + refreshToken
   - Log to auth_events: { event_type: "login_success", channel: "magic_link" }

Acceptance: All flows work. Reset token is single-use. Anti-enumeration on forgot-password.
```

---

### ═══ PROMPT 5 — Backend: Social Auth + Biometric ═══

```
Task: Harden social auth (Google/Facebook/Firebase) and biometric flows.

Files:
- artifacts/api-server/src/routes/auth/social.ts

GOOGLE AUTH:
1. POST /auth/social/google:
   - Validate auth_google_enabled = "on" for the requesting role
   - Verify Google ID token via google-auth-library
   - Extract: { email, name, avatar, googleId }
   - Find user by googleId OR email
   - If not found: create account (isNewUser: true), set emailVerified: true
   - If found but different role: return WRONG_APP error
   - Issue tokens, log to auth_events: { channel: "google" }

2. POST /auth/link-google (authenticated):
   - Link Google account to existing user
   - Prevent duplicate googleId across accounts

FACEBOOK AUTH:
3. POST /auth/social/facebook:
   - Validate auth_facebook_enabled = "on"
   - Verify token via Facebook Graph API: /me?fields=id,name,email,picture
   - Same logic as Google

FIREBASE:
4. POST /auth/firebase-verify:
   - Unified endpoint for Firebase ID tokens (used by mobile apps)
   - Detect provider from token (google.com, facebook.com, phone)
   - Route to correct handler

BIOMETRIC:
5. GET /auth/biometric/status:
   - Return whether biometric login is enabled for this user's role
   - Check auth_biometric_enabled platform setting

6. POST /auth/biometric/register:
   - Authenticated endpoint
   - Store biometric_credential_id, device_id in trusted_devices table
   - Return biometricToken (long-lived refresh token, stored in device secure storage)

7. Biometric login:
   - Reuses POST /auth/refresh endpoint
   - Client sends stored biometricToken as refresh token
   - Server validates, issues new accessToken
   - No separate endpoint needed

Acceptance: All social auth flows work. Wrong-role detection. Biometric tokens stored in trusted_devices.
```

---

### ═══ PROMPT 6 — Backend: 2FA/TOTP Complete System ═══

```
Task: Ensure complete and hardened 2FA/TOTP system.

Files:
- artifacts/api-server/src/routes/auth/totp.routes.ts
- artifacts/api-server/src/modules/otp/otp.totp.ts

ENDPOINTS (verify/improve existing):

1. GET /auth/2fa/setup (authenticated):
   - Generate TOTP secret via speakeasy
   - Store encrypted in user_totp_setup (temporary, not activated yet)
   - Return: { qrCode, secret, backupCodes[] }

2. POST /auth/2fa/verify-setup:
   - Verify TOTP code matches secret from setup
   - Move secret to users.totpSecret (encrypted)
   - Generate 10 backup codes (hash before storing in totp_recovery_codes)
   - Set users.totpEnabled = true
   - Log to auth_events: { event_type: "2fa_enable" }

3. POST /auth/2fa/verify (during login):
   - Validate 2faToken (JWT challenge token)
   - Accept TOTP code OR backup code
   - On backup code: mark used, warn if last 2 remaining
   - Invalidate 2faToken after use (single-use)
   - Issue final accessToken + refreshToken
   - Log to auth_events: { event_type: "login_success", channel: "totp" }

4. POST /auth/2fa/disable (authenticated + password confirm):
   - Require current password + TOTP code
   - Delete totpSecret, set totpEnabled = false
   - Revoke all trusted devices
   - Log to auth_events: { event_type: "2fa_disable" }

5. POST /auth/2fa/recovery (backup code):
   - If all backup codes used: force 2FA disable, require re-setup

6. POST /auth/2fa/trust-device:
   - Create trusted_devices row (30-day expiry)
   - Future logins from this device skip TOTP challenge

7. GET /auth/2fa/status (authenticated):
   - Return: { enabled, trustedDevices[], backupCodesRemaining }

Admin force-2FA check:
- If security_mfa_required = "on" → all admins must have 2FA before dashboard access
- If security_super_admin_mfa_required = "on" → super-admins always need TOTP

Acceptance: Full 2FA cycle works. Backup codes are single-use. Trusted devices bypass TOTP.
```

---

### ═══ PROMPT 7 — Backend: Session & Token Management ═══

```
Task: Complete session management system.

Files:
- artifacts/api-server/src/routes/auth/refresh.ts
- artifacts/api-server/src/routes/auth/sessions.ts
- artifacts/api-server/src/services/auth/tokenRotation.ts

1. POST /auth/refresh:
   - HttpOnly cookie OR Authorization: Bearer {refreshToken}
   - Validate refresh token family (prevent reuse attack)
   - Rotate: issue new refreshToken, invalidate old one
   - Update user_sessions: last_active_at
   - Return: { accessToken, expiresIn, user }
   - On stolen token detection (family invalidation): log auth_event, return 401

2. POST /auth/logout:
   - Revoke current refresh token (mark used)
   - Clear HttpOnly cookie
   - Optionally: revoke all sessions (body.allDevices: true)
   - Log to auth_events: { event_type: "logout" }

3. GET /auth/sessions:
   - Return active sessions for the current user
   - Include: device info, IP, last_active_at, current session indicator

4. DELETE /auth/sessions/:id:
   - Revoke specific session
   - Increment tokenVersion if revoking all

5. Token expiry rules (from platform_settings):
   - Admin: security_admin_token_hrs (default 8h access, 24h refresh)
   - Customer: security_session_days (default 30d refresh)
   - Rider: security_rider_token_days (default 7d refresh)
   - Vendor: same as customer (30d)
   - Access token: always 15 minutes

6. IP-based admin whitelist:
   - If security_admin_ip_whitelist is set, validate IP on every admin request
   - Return 403 FORBIDDEN if IP not in whitelist

7. auth_events logging on every token refresh:
   - Log only on suspicious activity (different IP/device) to avoid noise

Acceptance: Token rotation works. Session list correct. IP whitelist enforced for admin.
```

---

### ═══ PROMPT 8 — Shared UI Library: Auth Components ═══

```
Task: Improve shared auth-react library with missing/improved components.

Library: lib/auth-react/src/

COMPONENTS TO ADD/IMPROVE:

1. LoginCard (NEW — lib/auth-react/src/components/LoginCard.tsx):
   - Wrapper card with logo, app name, tagline
   - Props: logoSrc, appName, tagline, children
   - Consistent dark card style matching all 3 apps

2. MethodSelector (NEW — lib/auth-react/src/components/MethodSelector.tsx):
   - Horizontal tab switcher: [Phone OTP] [Password] [Google]
   - Driven by platform config (hides disabled methods)
   - Props: methods: AuthMethod[], active, onChange
   - AuthMethod: "phone_otp" | "email_otp" | "password" | "google" | "facebook" | "magic_link" | "biometric"

3. SocialLoginButtons (NEW — lib/auth-react/src/components/SocialLoginButtons.tsx):
   - Google + Facebook buttons
   - Props: onGoogle, onFacebook, loadingGoogle, loadingFacebook
   - Shows divider "— OR —" above
   - Hides if all social methods disabled

4. PasswordInput (IMPROVE — lib/auth-react/src/components/PasswordInput.tsx):
   - Eye toggle (show/hide)
   - Strength bar (on signup only)
   - Props: showStrength, value, onChange, placeholder, disabled

5. BiometricPrompt (IMPROVE — lib/auth-react/src/components/BiometricPrompt.tsx):
   - Fingerprint/FaceID icon button overlay
   - Props: onSuccess, onCancel, isAvailable

6. ApprovalOverlay (NEW — lib/auth-react/src/components/ApprovalOverlay.tsx):
   - Shown when vendor/rider account is pending/rejected
   - Props: status: "pending" | "rejected", reason?, onLogout
   - Pending: amber card with spinner and "Your application is under review"
   - Rejected: red card with rejection reason and "Contact Support" button

7. SessionExpiredOverlay (NEW — lib/auth-react/src/components/SessionExpiredOverlay.tsx):
   - Full-screen overlay shown when refresh token expires
   - "Your session has expired. Please sign in again."
   - Login button → clears state and redirects

8. WrongAppScreen (NEW — lib/auth-react/src/components/WrongAppScreen.tsx):
   - Shown when user tries wrong app (rider in vendor app, etc.)
   - Props: detectedRole, expectedRole, redirectUrl
   - "This account is registered as a [rider]. Please use the Rider App."

9. Update lib/auth-react/src/index.ts:
   - Export all new components

10. NATIVE versions (.native.tsx) for components used in Expo apps:
    - MethodSelector.native.tsx
    - ApprovalOverlay.native.tsx

Acceptance: All components export correctly. TypeScript 0 errors. No ajkmart modifications.
```

---

### ═══ PROMPT 9 — Admin Panel: Auth UI Redesign ═══

```
Task: Redesign Admin Panel login/logout/forgot-password screens.

Files:
- artifacts/admin/src/lib/auth/LoginScreen.tsx
- artifacts/admin/src/pages/forgot-password.tsx
- artifacts/admin/src/pages/reset-password.tsx
- artifacts/admin/src/pages/set-new-password.tsx
- artifacts/admin/src/lib/auth/FirstLoginCredentialsDialog.tsx

ADMIN LOGIN SCREEN:
Layout: centered card (max-w-md), dark background, AJKMart Admin logo
Fields:
  - Username or Email input (with user icon)
  - Password input (with eye toggle)
  - Remember me checkbox (7-day session vs default 8h)
  - "Forgot Password?" link → /forgot-password
  - Sign In button (loading state with spinner)

2FA Step (conditional):
  - After credentials verified, if requires2FA:
  - Show 6-digit TOTP input (use OtpInput component from auth-react)
  - "Lost access to authenticator? Use backup code" link
  - Back to login button

Error states:
  - Invalid credentials: inline red error below form
  - Account locked: show lockout duration (e.g., "Try again in 24 minutes")
  - IP restricted: "Access denied from this IP address"
  - Session expired: SessionExpiredOverlay component

First Login Dialog:
  - Check if admin is using default seeded password
  - Force password change on first login
  - Clear, friendly dialog: "Welcome! Please set a secure password to continue."

FORGOT PASSWORD:
  Step 1: Enter username or email → POST /auth/admin/forgot-password
  Step 2: "Check your email" confirmation screen (anti-enumeration)
  Step 3: Token from email link → /reset-password?token=XXX
  Step 4: New password (with strength bar) + confirm → POST /auth/admin/reset-password
  Step 5: Success screen → Auto-redirect to login after 3 seconds

SET NEW PASSWORD (voluntary change):
  - Current password verification
  - New password + confirm
  - Strength bar
  - "All other sessions will be signed out" warning
  - Success → redirect to dashboard

LOGOUT:
  - Confirm dialog: "Sign out? [Cancel] [Sign Out]"
  - POST /auth/logout → clear sessionStorage → redirect /login
  - "Signed out successfully" toast on login page

Acceptance: Login → Dashboard works. 2FA works. Forgot password flow complete.
```

---

### ═══ PROMPT 10 — Vendor App: Auth UI Redesign ═══

```
Task: Redesign Vendor App login/register/forgot-password screens.

Files:
- artifacts/vendor-app/src/lib/auth/LoginScreen.tsx
- artifacts/vendor-app/src/lib/auth/RegisterWizard.tsx
- artifacts/vendor-app/src/pages/ForgotPassword.tsx
- artifacts/vendor-app/src/lib/vendor-auth.tsx
- artifacts/vendor-app/src/App.tsx

LOGIN SCREEN:
Top: AJKMart Vendor logo + tagline "Grow your business with AJKMart"
Method Tabs: [Phone OTP] [Password] (Google button if enabled)

Phone OTP Tab:
  - PhoneInput (+92 prefix) → Send OTP button
  - OtpInput (6 digits, shake on error, auto-submit) → Verify
  - Resend timer (OtpTimer component, 60s)
  - Channel indicator: SMS / WhatsApp icon

Password Tab:
  - Username or Email input
  - Password input (eye toggle)
  - Forgot Password? link
  - Sign In button

Google Button (if auth_google_enabled):
  - "Continue with Google"
  - Positioned below divider

Biometric (if available + enabled):
  - Fingerprint icon button in top-right corner
  - BiometricPrompt overlay on tap

2FA Gate:
  - OtpInput for TOTP (6 digits)
  - Backup code link

Post-login overlays:
  - ApprovalOverlay (pending/rejected)
  - KYC required banner (for analytics/wallet features)

REGISTER WIZARD (4 Steps):
Step 1 — Store Info:
  - Store name (required)
  - Store category (dropdown from platform categories)
  - City (searchable dropdown from AJK cities)
  - Store description (optional, max 200 chars)
  - Progress: 1/4 indicator at top

Step 2 — Contact & Verification:
  - Full name (required)
  - Phone number (required) → Send OTP → Verify inline
  - CNIC (optional, XXXXX-XXXXXXX-X format)
  - Email (optional)
  Progress: 2/4

Step 3 — Bank & Payout:
  - Bank name (dropdown)
  - Account title
  - Account number or IBAN
  - NTN number (optional)
  Progress: 3/4

Step 4 — Password & Submit:
  - Password (strength bar, min 8 chars)
  - Confirm password
  - Terms & Conditions checkbox (link to /terms)
  - Create Account button
  Progress: 4/4

Draft persistence: save non-sensitive fields to localStorage on each step

FORGOT PASSWORD (5 Steps):
Step 1: Phone or Email choice + input
Step 2: OTP sent → 6-digit verify (OtpInput)
Step 3: New password (strength bar)
Step 4: TOTP gate (if 2FA enabled)
Step 5: Success → redirect to login

LOGOUT:
- Confirm dialog
- POST /auth/logout
- Clear sessionStorage
- Invalidate React Query cache
- Redirect /login with toast "Signed out successfully"

SESSION EXPIRY:
- SessionExpiredOverlay (from auth-react)
- Auto-appears when refresh fails
- Preserves current URL for post-login redirect

Acceptance: Full login/register/logout/forgot-password works. ApprovalOverlay shows correctly.
```

---

### ═══ PROMPT 11 — Rider App: Auth UI Redesign ═══

```
Task: Redesign Rider App login/register/forgot-password screens.

Files:
- artifacts/rider-app/src/lib/auth/LoginScreen.tsx
- artifacts/rider-app/src/lib/auth/RegisterWizard.tsx
- artifacts/rider-app/src/pages/ForgotPassword.tsx
- artifacts/rider-app/src/lib/rider-auth.tsx
- artifacts/rider-app/src/App.tsx (or wouter router)

LOGIN SCREEN:
Top: AJKMart Rider logo (green accent) + "Deliver with AJKMart"
Same structure as Vendor but green theme:
  - Phone OTP tab
  - Password tab
  - Google (if enabled)
  - Biometric fingerprint button (top-right)
  - 2FA gate on TOTP-enabled accounts

Post-login: No approval overlay needed (riders go to dashboard directly,
  but show "Application Under Review" banner in dashboard if pending)

REGISTER WIZARD (5 Steps — most complex):
Step 1 — Personal Info:
  - Full name
  - Phone number (required) — availability pre-check
  - Username (optional, auto-suggest based on name)
  - Real-time availability check on blur → POST /auth/check-available
  Progress: 1/5

Step 2 — OTP Verification:
  - OtpInput (6 digits) sent to phone from Step 1
  - Resend timer (OtpTimer, 60s)
  - Cannot go back after phone verified (security)
  Progress: 2/5

Step 3 — Vehicle Info:
  - CNIC (XXXXX-XXXXXXX-X, required for riders)
  - Vehicle type (dropdown: Bike | Car | Rickshaw | Van | Truck)
  - Vehicle plate number
  - Driving license number
  - Vehicle registration number
  Progress: 3/5

Step 4 — KYC Documents (photo uploads):
  - Vehicle photo (front) — file picker + preview
  - Driving license photo — file picker + preview
  - CNIC front photo — file picker + preview
  - CNIC back photo — file picker + preview
  - Upload progress bars per file
  - POST /uploads/register (multipart, session token)
  Progress: 4/5

Step 5 — Password & Submit:
  - Password (strength bar)
  - Confirm password
  - Terms checkbox
  - Create Rider Account button
  - POST /auth/register (role: rider)
  Progress: 5/5

Draft persistence: localStorage rider_reg_draft (exclude passwords and photos)

FORGOT PASSWORD:
  Same flow as Vendor (Steps 1-4 + 2FA gate)
  Green accent instead of blue

LOGOUT:
  - logoutSequence (disconnect socket, clear @capacitor/preferences)
  - POST /auth/logout
  - Redirect /login

Acceptance: All 5 registration steps work. KYC docs upload. Login/logout/forgot-password complete.
```

---

### ═══ PROMPT 12 — Admin Panel: Auth Control Center Page ═══

```
Task: Build unified Auth Control Center page in Admin Panel.

File: artifacts/admin/src/pages/auth-control.tsx (NEW or improve existing auth-methods.tsx)
Route: /auth-control (register in App.tsx if not already)

SECTIONS:

─── SECTION 1: Auth Methods Matrix ───
Table with rows = methods, columns = roles (Customer | Rider | Vendor)
Methods:
  - Phone OTP          → platform key: auth_phone_otp_enabled
  - Email OTP          → auth_email_otp_enabled
  - Username+Password  → auth_username_password_enabled
  - Google Login       → auth_google_enabled
  - Facebook Login     → auth_facebook_enabled
  - Magic Link         → auth_magic_link_enabled
  - Biometric Login    → auth_biometric_enabled
  - 2FA/TOTP           → always on (cannot disable, only require)

Each cell: Toggle switch (on/off per role via JSON value)
Save button (PATCH /admin/settings/auth-methods batch update)
Warning: "Disabling all methods for a role will lock users out"

─── SECTION 2: Registration Settings ───
- New user registration: feature_new_users toggle
- Customer auto-approval: user_require_approval toggle
- Rider auto-approval: rider_auto_approve toggle
- Vendor auto-approval: vendor_auto_approve toggle
- Signup bonus amount: input (PKR)
- Welcome notification: textarea (message sent on register)

─── SECTION 3: OTP Channel & Delivery ───
- Channel priority drag-and-drop: [WhatsApp] [SMS] [Email]
- Console fallback toggle (dev only, NODE_ENV check)
- OTP TTL minutes (per type): login, register, reset, merge
- Magic Link TTL: auth_magic_link_ttl_min

─── SECTION 4: Security & Rate Limits ───
- Max login attempts: security_login_max_attempts
- Lockout duration: security_lockout_minutes
- Admin session hours: security_admin_token_hrs
- Customer session days: security_session_days
- Rider token days: security_rider_token_days
- Admin IP whitelist: CIDR textarea
- Force 2FA for admins: security_mfa_required
- Force 2FA for super-admins: security_super_admin_mfa_required

─── SECTION 5: Recent Auth Events ───
- Table: last 50 events from auth_events table
- Columns: timestamp, user, event_type, channel, role, success, ip
- Filters: event_type, role, success/failure
- Color coding: green=success, red=failure, amber=suspicious

─── SECTION 6: Locked Out Users ───
- List from otp_attempts table (count >= max_attempts)
- Per user: phone/email, attempts, locked_since, Unlock button
- Unlock: DELETE /admin/users/:id/otp/attempts

API endpoints needed:
- GET /admin/auth/methods → { methods: Record<string, Record<role, boolean>> }
- PATCH /admin/auth/methods → batch update platform_settings
- GET /admin/auth/events → paginated auth_events
- GET /admin/auth/locked-users → users with otp_attempts >= threshold

Acceptance: All 6 sections load and save. Auth events table shows data. Unlock works.
```

---

### ═══ PROMPT 13 — Backend: Auth Events API + Admin Routes ═══

```
Task: Add auth events API routes for the Auth Control Center.

File: artifacts/api-server/src/routes/admin/auth-control.ts (NEW)
Mount in: artifacts/api-server/src/routes/admin.ts → router.use(authControlRouter)

ENDPOINTS:

1. GET /admin/auth/methods:
   - Read from platform_settings all auth_* keys
   - Parse per-role JSON values
   - Return structured { methods: { phone_otp: { customer, rider, vendor }, ... } }

2. PATCH /admin/auth/methods:
   - Body: { method: string, role: string, enabled: boolean }
   - Validate method is in allowed list
   - Update platform_settings (JSON-encoded per-role value)
   - Log to admin audit
   - Emit platform-config:updated event (so clients reload)

3. GET /admin/auth/events:
   - Query auth_events table with filters
   - Params: page, limit, event_type, role, success, userId, dateFrom, dateTo
   - Return paginated list

4. GET /admin/auth/locked-users:
   - Join otp_attempts with users
   - Where count >= security_login_max_attempts
   - Return: [{ userId, name, phone, email, attempts, expiresAt }]

5. GET /admin/auth/stats:
   - Last 24h login counts by method and role
   - Success vs failure ratio
   - New registrations today
   - Active sessions count
   - Return for dashboard widgets

6. POST /admin/auth/broadcast-logout:
   - Increment tokenVersion for ALL users of a role (or all users)
   - Used in security emergencies
   - Requires super-admin permission
   - Log to audit

Acceptance: All 6 endpoints work. Auth events logged. Locked users unlockable.
```

---

### ═══ PROMPT 14 — Testing & Verification Checklist ═══

```
Task: Verify the complete auth system end-to-end.

─── BACKEND CHECKS ───
1. POST /auth/send-otp → otp_tokens row created, no devCode in response
2. POST /auth/verify-otp (wrong) → INVALID_OTP, attemptsRemaining decrements
3. POST /auth/verify-otp (correct) → accessToken + user returned
4. POST /auth/register (customer) → AJK ID generated, auth_events logged
5. POST /auth/vendor-register → vendor_profiles row created, pending status
6. POST /auth/register (rider) → rider_profiles row created
7. POST /auth/forgot-password → success even for unknown identifier (anti-enum)
8. POST /auth/verify-reset-otp → resetToken returned (JWT)
9. POST /auth/reset-password → password changed, all sessions revoked
10. POST /auth/magic-link/send → token hashed in DB, email sent
11. POST /auth/magic-link/verify → single-use, second use rejected
12. POST /auth/social/google → works if enabled, 403 if disabled in settings
13. POST /auth/2fa/verify → backup code works, marks as used
14. POST /auth/refresh → token rotated, old token rejected on second use
15. POST /auth/logout (allDevices: true) → all sessions revoked

─── ADMIN PANEL CHECKS ───
16. Admin login → dashboard accessible
17. Wrong password × 5 → account locked (show duration)
18. IP not in whitelist → 403 (if whitelist configured)
19. Forgot password → email received → reset works
20. First login dialog → shows if default password
21. 2FA setup → enable → login now requires TOTP
22. Auth Control Center → all sections load
23. Toggle phone OTP off for riders → rider login rejects phone OTP
24. Auth events table → shows recent login events

─── VENDOR APP CHECKS ───
25. Phone OTP login → dashboard
26. Password login → dashboard
27. Google login → dashboard (if enabled)
28. Register wizard → 4 steps → approval pending screen
29. Forgot password → 5 steps → success
30. Session expired → SessionExpiredOverlay appears → re-login works
31. Approval rejected → rejection reason shown with contact support

─── RIDER APP CHECKS ───
32. Phone OTP login → dashboard
33. Register wizard → 5 steps → KYC docs uploaded
34. Forgot password → success
35. Logout → @capacitor/preferences cleared → redirect login

─── SECURITY CHECKS ───
36. Reset token single-use (replay rejected)
37. Refresh token rotation (reuse rejected, family invalidated)
38. Magic link single-use
39. Backup TOTP code single-use
40. devCode not in production response (ALLOW_DEV_OTP not set)
41. CNIC stored encrypted in DB
42. Password stored as bcrypt hash (cost 12)
43. auth_events table has entries for all tested flows

─── DB CHECKS ───
44. auth_events table exists with correct columns
45. trusted_devices table exists
46. otp_tokens has no plaintext codes (only hashes)
47. magic_link_tokens stores hashed tokens only
```

---

## 🚀 Execution Order

| Step | Prompt | App | Risk | Est. Time |
|------|--------|-----|------|-----------|
| 1 | DB Schema (auth_events, trusted_devices) | Backend | Low | 15 min |
| 2 | Auth Response Standardization | Backend | Medium | 30 min |
| 3 | Registration System Hardening | Backend | Medium | 30 min |
| 4 | Password Reset + Magic Link | Backend | Medium | 25 min |
| 5 | Social Auth + Biometric | Backend | Medium | 25 min |
| 6 | 2FA/TOTP Complete System | Backend | Low | 20 min |
| 7 | Session & Token Management | Backend | Medium | 25 min |
| 8 | Shared UI Library (auth-react) | Shared | Low | 30 min |
| 9 | Admin Panel Auth UI | Admin | Medium | 45 min |
| 10 | Vendor App Auth UI | Vendor | Medium | 45 min |
| 11 | Rider App Auth UI | Rider | Medium | 50 min |
| 12 | Admin Auth Control Center Page | Admin | Low | 40 min |
| 13 | Backend Auth Control APIs | Backend | Low | 25 min |
| 14 | Testing & Verification | All | — | 30 min |

**Total estimated time: ~7 hours**

---

## 🔐 Security Guarantees (Post-Implementation)

| Guarantee | Mechanism |
|-----------|-----------|
| No plaintext OTPs in DB | otp_tokens stores bcrypt/HMAC hashes only |
| No plaintext passwords | bcrypt cost 12 |
| No plaintext CNIC | AES-256-GCM encrypted with ENCRYPTION_MASTER_KEY |
| No plaintext TOTP secrets | Encrypted before storage |
| Anti-enumeration on forgot-password | Always returns success regardless |
| Replay attack prevention | All tokens (OTP, reset, magic link, refresh) are single-use |
| Token family invalidation | Stolen refresh token detected and all family revoked |
| Rate limiting | OTP send, login, forgot-password all rate limited |
| Account lockout | After N failed attempts (configurable) |
| Session scoping | Admin: HttpOnly cookie + sessionStorage; Mobile: secure-store |
| Wrong-app detection | WRONG_APP error code with redirectTo hint |
| Auth event trail | Every auth action logged to auth_events |
| IP whitelist for admin | Configurable per deployment |
| 2FA bypass protection | 2FA challenge token is single-use JWT (10 min TTL) |
| Biometric security | Biometric token = long-lived refresh token in device secure storage |
| devCode never in production | Double-gated: NODE_ENV + ALLOW_DEV_OTP env var |

---

## ⚠️ Notes

1. **Customer App (AJKMart)**: `artifacts/ajkmart/` — READ ONLY per user preferences.
   Auth system is already well-implemented. Only implement changes if user explicitly requests.

2. **Auth file restriction**: `artifacts/api-server/src/routes/auth/auth.ts` — DO NOT MODIFY.
   Work around by adding new route files and mounting them.

3. **OTP System**: Already redesigned in `otp.md` (PROMPTS 1-12 complete).
   This plan builds on top of that foundation.

4. **Shared lib `auth-react`**: Changes here affect Admin, Vendor, and Rider apps.
   Always run `pnpm tsc --noEmit` across all 3 apps after lib changes.

5. **Platform settings**: Changes to auth method toggles take effect immediately
   (cached in memory, refreshed every 60s). No server restart needed.
```
