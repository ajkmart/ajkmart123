# AJKMart — Professional OTP System Redesign
## Complete Full-Stack Plan (Backend + Frontend)

---

## 🔍 Current State — Problems Summary

### Files Jo Delete Honge (Replaced by new system)
| File | Reason |
|---|---|
| `artifacts/api-server/src/routes/auth/otp.ts` | Replaced by OTP module |
| `artifacts/api-server/src/routes/auth/email-otp.ts` | Merged into OTP module |
| `artifacts/api-server/src/routes/auth/two-factor.ts` | Moved into OTP module |
| `artifacts/api-server/src/services/sms.ts` | Replaced by delivery layer |
| `artifacts/api-server/src/services/smsGateway.ts` | Replaced by delivery layer |
| `artifacts/api-server/src/services/whatsapp.ts` | Merged into delivery layer |
| `artifacts/api-server/src/services/totp.ts` | Moved into OTP module |
| `artifacts/api-server/src/routes/admin/otp.ts` | Replaced by new admin module |
| `lib/auth-react/src/components/OtpInput.tsx` | Replaced by new unified component |

### DB Changes
| Current (Messy) | New (Clean) |
|---|---|
| OTP columns scattered in `users` table | Dedicated `otp_tokens` table |
| Separate `pending_otps` table (new users only) | Single `otp_tokens` table for ALL users |
| `otp_attempts` table (custom) | Unified `otp_attempts` (extended) |
| Trip OTP inline in `rides` table | Kept in `rides` (correct, no change) |

---

## 🏗️ New Architecture — Professional Module Structure

```
artifacts/api-server/src/
└── modules/
    └── otp/                          ← Self-contained OTP module
        ├── index.ts                  ← Public exports only
        ├── otp.types.ts              ← All TypeScript interfaces
        ├── otp.config.ts             ← TTL, length, limits, channels
        ├── otp.generate.ts           ← Cryptographic generation
        ├── otp.store.ts              ← Database read/write (single source)
        ├── otp.deliver.ts            ← SMS → WhatsApp → Email delivery
        ├── otp.verify.ts             ← Verification + brute-force guard
        ├── otp.totp.ts               ← TOTP/2FA logic
        └── otp.trip.ts               ← Ride/Trip OTP (specialized)

artifacts/api-server/src/
└── routes/auth/
    ├── phone.routes.ts               ← Thin controller → calls otp module
    ├── email.routes.ts               ← Thin controller → calls otp module
    └── totp.routes.ts                ← Thin controller → calls otp module

lib/
└── otp-ui/src/                       ← Shared UI library (all apps use this)
    ├── OtpInput.tsx                  ← Universal OTP input component
    ├── OtpTimer.tsx                  ← Resend countdown timer
    └── index.ts                      ← Exports

artifacts/admin/src/pages/
└── otp-control.tsx                   ← Rebuilt admin control panel
```

---

## 🗄️ New Database Schema

### New Table: `otp_tokens` (replaces pending_otps + users OTP columns)
```sql
CREATE TABLE otp_tokens (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier      TEXT NOT NULL,          -- phone or email (normalized)
  identifier_type TEXT NOT NULL,          -- 'phone' | 'email'
  otp_type        TEXT NOT NULL,          -- 'login' | 'register' | 'reset' | 'merge'
  otp_hash        TEXT NOT NULL,          -- HMAC-SHA256 hash
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,            -- NULL = unused
  user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,  -- NULL for new users
  channel         TEXT NOT NULL,          -- 'sms' | 'whatsapp' | 'email'
  ip_address      TEXT,
  device_fingerprint TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_tokens_identifier ON otp_tokens(identifier, identifier_type);
CREATE INDEX idx_otp_tokens_expires ON otp_tokens(expires_at);
```

### Modified Table: `otp_attempts` (extended)
```sql
-- Already exists, add columns:
ALTER TABLE otp_attempts ADD COLUMN identifier_type TEXT DEFAULT 'phone';
ALTER TABLE otp_attempts ADD COLUMN otp_type TEXT DEFAULT 'login';
```

### Users Table Cleanup (remove OTP columns after migration)
```sql
-- Columns to DROP from users table (after migration):
-- otp_code, otp_expiry, otp_used
-- email_otp_code, email_otp_expiry, email_otp_used
-- merge_otp_code, merge_otp_expiry
```

---

## 📋 IMPLEMENTATION PLAN — Step by Step Prompts

---

### ═══ PROMPT 1 — Database Migration ═══

```
Task: Create the new otp_tokens database migration for the AJKMart OTP system redesign.

1. Create migration file: lib/db/migrations/0040_otp_tokens_table.sql
   - Create table `otp_tokens` with columns:
     * id (text PK, gen_random_uuid())
     * identifier (text NOT NULL) — normalized phone or email
     * identifier_type (text NOT NULL) — 'phone' | 'email'
     * otp_type (text NOT NULL) — 'login' | 'register' | 'reset' | 'merge'
     * otp_hash (text NOT NULL) — HMAC-SHA256 hash of the code
     * expires_at (timestamptz NOT NULL)
     * used_at (timestamptz) — NULL means unused
     * user_id (text, FK to users.id ON DELETE SET NULL) — NULL for unregistered users
     * channel (text NOT NULL) — 'sms' | 'whatsapp' | 'email' | 'console'
     * ip_address (text)
     * device_fingerprint (text)
     * created_at (timestamptz DEFAULT NOW())
   - Index on (identifier, identifier_type)
   - Index on (expires_at) — for cleanup jobs
   - Index on (user_id) where user_id is not null

2. Create migration file: lib/db/migrations/0041_otp_attempts_extend.sql
   - Add column identifier_type (text DEFAULT 'phone') to otp_attempts
   - Add column otp_type (text DEFAULT 'login') to otp_attempts

3. Update Drizzle schema: lib/db/src/schema/otp_tokens.ts
   - Create new Drizzle table definition matching the SQL above
   - Export: otpTokensTable, OtpToken, NewOtpToken types

4. Update lib/db/src/schema/index.ts to export otpTokensTable

5. DO NOT touch users table or pending_otps yet — migration is additive only.

6. DO NOT modify any route files yet.
```

---

### ═══ PROMPT 2 — OTP Module Core: Types + Config + Generate ═══

```
Task: Build the core of the new OTP module — types, config, and generation layer.

Create these files in artifacts/api-server/src/modules/otp/:

─── FILE 1: otp.types.ts ───
Export these TypeScript interfaces:
- OtpChannel: 'sms' | 'whatsapp' | 'email' | 'console'
- OtpType: 'login' | 'register' | 'reset' | 'merge' | 'trip'
- IdentifierType: 'phone' | 'email'
- OtpSendOptions: { identifier, identifierType, otpType, userId?, channel?, ipAddress?, deviceFingerprint? }
- OtpVerifyOptions: { identifier, identifierType, otpType, code, ipAddress? }
- OtpSendResult: { success, channel, otpRequired, expiresAt, devCode? (only if NODE_ENV=dev AND ALLOW_DEV_OTP=true) }
- OtpVerifyResult: { success, userId?, isNewUser? }
- OtpDeliveryError: extends Error with { channel, provider }

─── FILE 2: otp.config.ts ───
Export OTP_CONFIG object with:
- CODE_LENGTH: 6 (digits)
- TRIP_CODE_LENGTH: 4 (digits)
- TTL_MS: 5 * 60 * 1000 (5 minutes)
- MAX_ATTEMPTS: 5 (before lockout)
- LOCKOUT_DURATION_MS: 15 * 60 * 1000 (15 minutes)
- MAX_SEND_PER_HOUR: 5 (per identifier)
- CHANNEL_PRIORITY: ['whatsapp', 'sms', 'email'] as OtpChannel[]
- RESEND_COOLDOWN_MS: 60 * 1000 (1 minute)

─── FILE 3: otp.generate.ts ───
Export these functions:
- generateOtpCode(length: number): string
  → Uses crypto.randomInt() for cryptographically secure generation
  → Pads with leading zeros to ensure correct length
  
- hashOtpCode(code: string, secret: string): string
  → HMAC-SHA256 using crypto.createHmac
  → Uses HMAC_OTP_SECRET env var (falls back to JWT_SECRET with warning)
  
- generateTripOtp(): string
  → Calls generateOtpCode(OTP_CONFIG.TRIP_CODE_LENGTH)

- verifyOtpHash(code: string, hash: string, secret: string): boolean
  → Uses crypto.timingSafeEqual to prevent timing attacks
```

---

### ═══ PROMPT 3 — OTP Module: Storage Layer ═══

```
Task: Build the OTP storage layer — all DB operations in one place.

Create file: artifacts/api-server/src/modules/otp/otp.store.ts

Export these functions (all async, all use Drizzle ORM):

1. saveOtpToken(options: {
     identifier: string,
     identifierType: IdentifierType,
     otpType: OtpType,
     otpHash: string,
     channel: OtpChannel,
     userId?: string,
     ipAddress?: string,
     deviceFingerprint?: string,
     ttlMs?: number
   }): Promise<string>  ← returns new token id
   → UPSERT pattern: invalidate any existing unused tokens for same identifier+type
   → Insert fresh token with expires_at = NOW() + ttlMs

2. getActiveOtpToken(options: {
     identifier: string,
     identifierType: IdentifierType,
     otpType: OtpType
   }): Promise<OtpToken | null>
   → SELECT where used_at IS NULL AND expires_at > NOW()
   → Order by created_at DESC, take first

3. markOtpUsed(tokenId: string): Promise<void>
   → UPDATE otp_tokens SET used_at = NOW() WHERE id = tokenId
   → Atomic single-row update

4. countRecentSends(identifier: string, identifierType: IdentifierType, windowMs: number): Promise<number>
   → Count tokens created within the window (for rate limiting sends)

5. recordAttempt(identifier: string, success: boolean): Promise<{ blocked: boolean, attemptsLeft: number }>
   → Insert/update otp_attempts table
   → On success: DELETE the attempt record (reset)
   → On failure: increment count, check if >= MAX_ATTEMPTS, set expires_at

6. getAttemptStatus(identifier: string): Promise<{ blocked: boolean, attemptsLeft: number, unlocksAt?: Date }>
   → Check otp_attempts table for active lockout

7. cleanupExpiredTokens(): Promise<number>
   → DELETE FROM otp_tokens WHERE expires_at < NOW() AND used_at IS NULL
   → Returns count deleted (used by scheduler)
```

---

### ═══ PROMPT 4 — OTP Module: Delivery Layer ═══

```
Task: Build the unified OTP delivery layer with automatic failover.

Create file: artifacts/api-server/src/modules/otp/otp.deliver.ts

This file consolidates all of: sms.ts, smsGateway.ts, whatsapp.ts delivery logic.

Export this main function:
deliverOtp(options: {
  identifier: string,
  identifierType: IdentifierType,
  code: string,
  channel: OtpChannel,
  fallbackChannels?: OtpChannel[]
}): Promise<{ success: boolean, usedChannel: OtpChannel, provider?: string }>

Internal delivery functions (not exported):
- deliverViaSms(phone: string, code: string): Promise<boolean>
  → Try providers in order from platform_settings sms_gateways table
  → Twilio first, then MSG91, then Zong (CM.com), then console (dev only)
  → Each provider wrapped in try/catch, logs failure, tries next

- deliverViaWhatsApp(phone: string, code: string): Promise<boolean>
  → Meta Cloud API Graph v19.0
  → Uses wa_phone_number_id + wa_access_token from platform_settings
  → Template: otp_verification
  → Returns false (not throws) if unconfigured

- deliverViaEmail(email: string, code: string): Promise<boolean>
  → SendGrid if SENDGRID_API_KEY set, else SMTP (nodemailer)
  → Subject: "Your AJKMart verification code"
  → Clean HTML template with the code in large text

- deliverViaConsole(identifier: string, code: string): Promise<boolean>
  → ONLY if NODE_ENV !== 'production' AND ALLOW_DEV_OTP === 'true'
  → Logs code to console/pino logger with [DEV-OTP] prefix
  → Never sends real message

Auto-failover logic in deliverOtp:
1. Try primary channel
2. If fails, iterate fallbackChannels
3. If all fail, throw OtpDeliveryError
4. Log each attempt (provider, success/fail, latency) using pino logger
```

---

### ═══ PROMPT 5 — OTP Module: Verification + Send Logic ═══

```
Task: Build the main send and verify functions — the heart of the OTP module.

Create file: artifacts/api-server/src/modules/otp/otp.verify.ts

Export these functions:

1. sendOtp(options: OtpSendOptions, db: DrizzleDB): Promise<OtpSendResult>
   Flow:
   a. Normalize identifier (phone: E.164 format, email: lowercase trim)
   b. Check getAttemptStatus → if blocked, throw error with unlocksAt
   c. Check countRecentSends → if >= MAX_SEND_PER_HOUR, throw rate limit error
   d. Check resend cooldown (last token created_at < RESEND_COOLDOWN_MS ago)
   e. Check platform_settings: otp_global_disabled_until → if active, return otpRequired:false
   f. Check user's otp_bypass_until → if active, return otpRequired:false
   g. Check whitelist_users table for static bypass code
   h. Generate code via generateOtpCode()
   i. Hash code via hashOtpCode()
   j. Determine channel: use options.channel if provided, else auto-select from CHANNEL_PRIORITY
      based on what's configured in platform_settings
   k. Save to otp_tokens via saveOtpToken()
   l. Deliver via deliverOtp()
   m. Return OtpSendResult (never return the code except in dev mode)

2. verifyOtp(options: OtpVerifyOptions, db: DrizzleDB): Promise<OtpVerifyResult>
   Flow:
   a. Normalize identifier
   b. Check getAttemptStatus → if blocked, return blocked error
   c. Get active token via getActiveOtpToken()
   d. If no token found → recordAttempt(fail) → return invalid error
   e. Hash incoming code → compare with timingSafeEqual against token.otp_hash
   f. If hash mismatch → recordAttempt(fail) → return invalid error
   g. markOtpUsed(token.id) — atomic, prevents replay
   h. recordAttempt(success) — clears lockout
   i. Return OtpVerifyResult { success: true, userId: token.userId, isNewUser: !token.userId }

Create file: artifacts/api-server/src/modules/otp/index.ts
Export only:
- sendOtp
- verifyOtp  
- generateTripOtp (from otp.generate.ts)
- OTP_CONFIG
- All types from otp.types.ts
```

---

### ═══ PROMPT 6 — OTP Module: TOTP (2FA) ═══

```
Task: Move and clean up TOTP/2FA logic into the OTP module.

Create file: artifacts/api-server/src/modules/otp/otp.totp.ts

Move all logic from artifacts/api-server/src/services/totp.ts into this file.
Clean up and export:

1. generateTotpSecret(): { secret: string, encryptedSecret: string }
   → 20-byte Base32 secret
   → Encrypt with AES-256-GCM using TOTP_ENCRYPTION_KEY env var
   → Throw explicit error if TOTP_ENCRYPTION_KEY not set (no fallback)

2. encryptTotpSecret(secret: string): string
3. decryptTotpSecret(encryptedSecret: string): string

4. verifyTotpToken(encryptedSecret: string, token: string): boolean
   → Decrypt secret first
   → Validate 6-digit code with ±1 time step drift (30s window)
   → Use otplib or manual HOTP calculation

5. generateQrCodeUrl(secret: string, accountName: string, issuer: string): string
   → Returns otpauth:// URI for Google Authenticator

6. generateRecoveryCodes(count: number = 8): string[]
   → 8 x 8-character alphanumeric codes (e.g. "A3K9-XM2P")
   → Store hashed versions in DB, return plain text once

7. verifyRecoveryCode(userId: string, code: string, db: DrizzleDB): Promise<boolean>
   → Check hashed recovery codes in user_recovery_codes table
   → Mark used on success (single-use)
   → Return false if not found or already used

After creating this file:
- Delete artifacts/api-server/src/services/totp.ts
- Update any imports pointing to old file
```

---

### ═══ PROMPT 7 — New Route Controllers (Thin) ═══

```
Task: Replace all OTP route files with thin controllers that call the new OTP module.

─── FILE 1: artifacts/api-server/src/routes/auth/phone.routes.ts ───
Replace existing otp.ts content with thin controllers:

POST /auth/send-otp
→ Validate: phone (E.164), preferredChannel?, captchaToken?
→ Call: sendOtp({ identifier: phone, identifierType: 'phone', otpType, ... })
→ Return: { success, data: { otpRequired, channel, expiresIn: 300, ...(devCode if dev mode) } }

POST /auth/verify-otp  
→ Validate: phone, otp (6 digits), deviceFingerprint?
→ Call: verifyOtp({ identifier: phone, identifierType: 'phone', otpType: 'login', ... })
→ If isNewUser: create user record, issue JWT pair
→ If existing user + 2FA enabled: issue tempToken, return { twoFactorRequired: true }
→ If existing user: issue accessToken + refreshToken
→ Return: { success, data: { accessToken?, refreshToken?, user?, twoFactorRequired?, isNewUser? } }

─── FILE 2: artifacts/api-server/src/routes/auth/email.routes.ts ───
Replace existing email-otp.ts with:

POST /auth/send-email-otp
→ Call: sendOtp({ identifier: email, identifierType: 'email', ... })

POST /auth/verify-email-otp
→ Call: verifyOtp({ identifier: email, identifierType: 'email', ... })

─── FILE 3: artifacts/api-server/src/routes/auth/totp.routes.ts ───
Replace existing two-factor.ts with thin controller using otp.totp.ts functions.

─── UPDATE: artifacts/api-server/src/routes/auth/index.ts ───
Mount new route files. Remove old otp.ts, email-otp.ts, two-factor.ts imports.

─── DELETE after confirming routes work: ───
- artifacts/api-server/src/routes/auth/otp.ts
- artifacts/api-server/src/routes/auth/email-otp.ts  
- artifacts/api-server/src/routes/auth/two-factor.ts
- artifacts/api-server/src/services/sms.ts
- artifacts/api-server/src/services/smsGateway.ts
- artifacts/api-server/src/services/whatsapp.ts
```

---

### ═══ PROMPT 8 — Database Cleanup (Users Table) ═══

```
Task: Migrate OTP data from users table to otp_tokens, then clean up.

1. Create migration: lib/db/migrations/0042_migrate_otp_to_tokens.sql
   → Copy active (non-expired) OTPs from users table into otp_tokens:
   INSERT INTO otp_tokens (identifier, identifier_type, otp_type, otp_hash, expires_at, user_id, channel, created_at)
   SELECT phone, 'phone', 'login', otp_code, otp_expiry, id, 'sms', NOW()
   FROM users WHERE otp_code IS NOT NULL AND otp_expiry > NOW() AND otp_used = false;
   
   → Same for email OTPs.

2. Create migration: lib/db/migrations/0043_drop_users_otp_columns.sql
   → Drop from users table:
     otp_code, otp_expiry, otp_used,
     email_otp_code, email_otp_expiry, email_otp_used,
     merge_otp_code, merge_otp_expiry

3. Create migration: lib/db/migrations/0044_migrate_pending_otps.sql
   → Copy pending_otps into otp_tokens (user_id = NULL for unregistered):
   INSERT INTO otp_tokens (identifier, identifier_type, otp_type, otp_hash, expires_at, user_id, channel)
   SELECT phone, 'phone', 'register', otp_hash, otp_expiry, NULL, 'sms'
   FROM pending_otps WHERE otp_expiry > NOW();
   
   → DROP TABLE pending_otps;

4. Update Drizzle schemas:
   - lib/db/src/schema/users.ts: remove OTP columns
   - Delete lib/db/src/schema/pending_otps.ts
   - Update lib/db/src/schema/index.ts exports

IMPORTANT: Run 0042 first (copy data), then 0043 (drop columns), then 0044 (drop table).
Test login flow before running 0043 and 0044.
```

---

### ═══ PROMPT 9 — Scheduler: Cleanup Job ═══

```
Task: Register OTP cleanup in the existing scheduler.

In artifacts/api-server/src/lib/scheduler.ts (or wherever scheduler jobs are registered):

1. Add a new job: "otp-token-cleanup"
   → Runs every 30 minutes
   → Calls cleanupExpiredTokens() from otp.store.ts
   → Logs count of deleted tokens via pino logger: [otp-cleanup] Deleted N expired tokens

2. Remove or keep the existing "pending-otp-cleanup" job:
   → After Prompt 8 is done (pending_otps table dropped), remove this job
   → Until then keep both

3. In the cleanupExpiredTokens function in otp.store.ts, also:
   → Delete used tokens older than 24 hours: WHERE used_at < NOW() - INTERVAL '24 hours'
   → This keeps the table small and fast
```

---

### ═══ PROMPT 10 — Frontend: Shared OTP UI Component ═══

```
Task: Build a new universal OTP input component that works in all 3 apps.

─── FOR WEB APPS (admin, vendor-app, rider-app) ───
Update lib/auth-react/src/components/OtpInput.tsx with full rewrite:

Component: OtpInput
Props:
- length: number (4 or 6)
- onComplete: (code: string) => void
- onResend?: () => Promise<void>
- resendCooldown?: number (seconds, default 60)
- autoSubmit?: boolean (default true)
- disabled?: boolean
- error?: string | null
- label?: string
- channel?: 'sms' | 'whatsapp' | 'email' (shows icon indicating delivery channel)

Features:
- Individual input boxes (one per digit) — professional look like Careem/Bykea
- Auto-focus next box on input
- Backspace moves to previous box
- Paste support (pastes across boxes)
- Numeric only (blocks letters)
- Shake animation on error
- Channel icon (WhatsApp = green icon, SMS = blue, Email = envelope)
- Resend button with live countdown timer (60s → 0 → "Resend")
- Accessibility: aria-labels, role="group"
- Loading state (spinner overlay during verify)

─── FOR MOBILE APP (ajkmart — Expo React Native) ───
NOTE: User preference says DO NOT modify artifacts/ajkmart files.
Only update lib/auth-react if it is used by the mobile app.
If OtpInput.tsx is shared with mobile, add conditional:
  Platform.OS === 'web' ? <WebOtpBoxes /> : <NativeOtpBoxes />

─── Export from lib/auth-react/src/index.ts ───
- OtpInput component
- OtpTimer component (standalone countdown)
```

---

### ═══ PROMPT 11 — Admin Panel: OTP Control Center Rebuild ═══

```
Task: Rebuild the Admin OTP Control Center page with professional UI.

File: artifacts/admin/src/pages/otp-control.tsx

Rebuild with these sections using existing Shadcn/Radix UI components:

─── SECTION 1: System Status Header ───
- Large status badge: OTP ACTIVE (green) or SUSPENDED (red) 
- If suspended: shows "Resumes in: MM:SS" countdown
- Live stats row: Sent Today | Verified Today | Failed Today | Active Bypasses

─── SECTION 2: Global Controls ───
- "Suspend OTP Platform-Wide" button + duration picker (15min / 30min / 1hr / custom)
- Calls: POST /admin/otp/disable
- Warning dialog before confirming: "This will affect ALL users logging in"
- If suspended: "Resume Now" button → DELETE /admin/otp/disable

─── SECTION 3: Rate Limit Settings ───
- Max OTPs per phone per hour (input, default 5)
- Max OTPs per IP per hour (input, default 10)  
- OTP validity duration in minutes (input, default 5)
- Max verify attempts before lockout (input, default 5)
- Lockout duration in minutes (input, default 15)
- Save button → PATCH /admin/settings (updates platform_settings)

─── SECTION 4: User OTP Management ───
- Search bar (phone or email)
- Found user card showing: name, phone, email, bypass status
- Actions:
  * "Generate OTP for User" → POST /admin/users/:id/otp/generate (shows generated code in modal)
  * "Grant Bypass" with duration picker → POST /admin/users/:id/otp/bypass
  * "Revoke Bypass" → DELETE /admin/users/:id/otp/bypass
  * "Unlock (clear attempts)" → DELETE /admin/users/:id/otp/attempts

─── SECTION 5: Whitelist Management ───
Table of whitelisted numbers with columns: Phone, Bypass Code, Added By, Expires, Actions
- Add to whitelist button (opens modal: phone + optional static code + expiry)
- Remove button per row
- Uses GET/POST/DELETE /admin/whitelist

─── SECTION 6: Live Audit Log ───
- Last 50 OTP events: type, identifier (masked), channel, result, IP, timestamp
- Auto-refreshes every 30 seconds
- Filterable by: type (send/verify/fail), channel, date range
- Uses GET /admin/otp/audit

Add route in artifacts/admin/src/App.tsx: /otp-control
Add nav entry in AdminLayout.tsx under "Security" section.
```

---

### ═══ PROMPT 12 — Testing & Verification Checklist ═══

```
Task: Verify the complete OTP system is working end-to-end.

Run these manual checks and fix any issues found:

─── BACKEND CHECKS ───
1. API Health: GET /api/health → should return 200
2. Phone OTP Send: POST /api/auth/send-otp { phone: "+923001234567" }
   → Should return { success: true, data: { otpRequired: true, channel: "sms"|"whatsapp" } }
   → Check otp_tokens table: new row should exist with correct hash
3. Phone OTP Verify (wrong code): POST /api/auth/verify-otp { phone, otp: "000000" }
   → Should return error, check otp_attempts incremented
4. Phone OTP Verify (correct code — use devCode from step 2 if dev mode):
   → Should return { accessToken, refreshToken, user }
   → Check otp_tokens row: used_at should be set
5. Replay attack: use same code again → should return "OTP already used" error
6. Rate limit: send OTP 6 times in a row → should block on 6th attempt
7. Email OTP: POST /api/auth/send-email-otp { email: "test@example.com" }
8. 2FA Setup → Enable → Verify flow

─── DATABASE CHECKS ───
9. Confirm pending_otps table is gone (after Prompt 8)
10. Confirm users table has no otp_code/email_otp_code columns (after Prompt 8)
11. Confirm otp_tokens has correct indexes

─── ADMIN PANEL CHECKS ───
12. Open /admin/otp-control → all sections load
13. Global suspend → resume works
14. User search → grant bypass → verify bypass works (login skips OTP)
15. Audit log shows recent events

─── FRONTEND CHECKS ───
16. Vendor App login → OTP boxes render correctly
17. Rider App login → OTP verify works
18. Resend button countdown works (60s)
19. Wrong OTP → shake animation shows
20. Auto-submit on 6th digit works

─── SECURITY CHECKS ───
21. Confirm ALLOW_DEV_OTP=true is NOT set in production secrets
22. Confirm devCode never appears in production API response
23. Rate limiting blocks after 5 failed verify attempts
24. Check pino logs show [OTP] prefix entries for all events
```

---

## 🚀 Execution Order

| Step | Prompt | Risk | Estimated Time |
|---|---|---|---|
| 1 | DB Migration (additive) | Low | 10 min |
| 2 | OTP Types + Config + Generate | Zero | 15 min |
| 3 | OTP Store Layer | Zero | 20 min |
| 4 | OTP Delivery Layer | Zero | 20 min |
| 5 | OTP Verify + Send Logic | Zero | 25 min |
| 6 | TOTP/2FA Module | Low | 20 min |
| 7 | New Route Controllers | Medium | 30 min |
| 8 | DB Cleanup (destructive!) | HIGH ⚠️ | 20 min |
| 9 | Scheduler Cleanup Job | Low | 10 min |
| 10 | Frontend OTP Component | Low | 25 min |
| 11 | Admin Panel Rebuild | Low | 30 min |
| 12 | Testing & Verification | — | 30 min |

**Total: ~4 hours**

> ⚠️ **IMPORTANT:** Run Prompt 8 ONLY after Prompt 7 is tested and working.
> Prompt 8 drops database columns — cannot be undone without a DB backup.
> Take a Replit checkpoint before running Prompt 8.

---

## 🔐 Security Guarantees (Post-Rebuild)

| Guarantee | How |
|---|---|
| OTP codes never stored in plaintext | HMAC-SHA256 hash in DB |
| Timing attack proof | `crypto.timingSafeEqual` everywhere |
| Replay attacks impossible | `used_at` atomic update |
| Brute force protected | 5 attempts → 15min lockout |
| Dev OTP never leaks to production | Double guard: NODE_ENV + ALLOW_DEV_OTP |
| TOTP secrets encrypted at rest | AES-256-GCM with dedicated key |
| Rate limiting per IP + per identifier | Redis (if set) or in-memory |
| All OTP events audited | pino logger + audit table |
