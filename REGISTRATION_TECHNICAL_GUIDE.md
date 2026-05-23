# 💻 Registration Testing - Technical Details

**کیلیے Technical Walkthroughs**

---

## How devCode Works (Behind The Scenes)

### Backend Response

```typescript
// File: artifacts/api-server/src/modules/otp/otp.verify.ts:160-170

// Step 8: Return response
const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MS);

logger.info({ identifier: maskId(identifier), ... }, "[otp:send] OTP sent");

return {
  success: true,
  otpRequired: true,
  channel: delivery.usedChannel,
  expiresAt,
  resendAfter: OTP_CONFIG.RESEND_COOLDOWN_MS,
  
  // ⭐ یہاں devCode شامل ہوتا ہے (dev mode میں)
  ...(isDevMode() && { devCode: code }),  // ← مہم!
};
```

### isDevMode() کیا چیک کرتا ہے؟

```typescript
// Development mode check
function isDevMode(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "staging"
  );
}

// NOT production
if (process.env.NODE_ENV === "production") {
  return {
    // devCode نہیں ملے گی!
  };
}
```

### Frontend میں Receive کریں

```typescript
// File: artifacts/ajkmart/lib/auth/RegisterWizard.tsx:394

const res = await fetch(`${API_BASE}/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone, otp, fullName, city, password }),
});

const data = await res.json();

// Response میں یہ ہوگی:
console.log(data);
// {
//   success: true,
//   otpRequired: true,
//   channel: "sms",
//   devCode: "654321",  ← یہاں!
//   expiresAt: "2026-05-23T15:30:00Z"
// }

// UI میں show کریں
if (data.devCode) {
  console.log(`[Development] Use OTP code: ${data.devCode}`);
}
```

---

## Whitelist Bypass - SQL Level

### Add Test Account

```sql
-- Insert کریں whitelist میں
INSERT INTO whitelist_users (
  id,
  identifier,
  identifier_type,
  bypass_code,
  is_active,
  label,
  created_at,
  expires_at
) VALUES (
  'wl_' || gen_random_uuid()::text,
  '03001234567',
  'phone',
  '123456',
  true,
  'Test Vendor Account',
  NOW(),
  NOW() + INTERVAL '1 month'
);
```

### Backend Check Flow

```typescript
// File: artifacts/api-server/src/lib/auth-otp-bypass.ts:68-104

export async function checkOTPBypass(phone: string): Promise<OTPBypassStatus> {
  // ...
  
  // Check 3: Whitelist bypass
  const whitelisted = await db.query.whitelistUsersTable.findFirst({
    where: and(
      eq(whitelistUsersTable.identifier, phone),
      eq(whitelistUsersTable.isActive, true),
      or(
        isNull(whitelistUsersTable.expiresAt),
        gt(whitelistUsersTable.expiresAt, now)
      )
    ),
    columns: { id: true, bypassCode: true, expiresAt: true },
  });

  if (whitelisted) {
    // Production safety: block test codes
    if (
      process.env.NODE_ENV === "production" &&
      (whitelisted.bypassCode === "123456" || whitelisted.bypassCode === "000000")
    ) {
      logger.warn({ phone, code: whitelisted.bypassCode },
        "[OTPBypass] Rejected test bypass code in production"
      );
      // Fall through to normal OTP
    } else {
      return {
        isBypassed: true,
        reason: "whitelist",
        expiresAt: whitelisted.expiresAt || null,
        bypassCode: whitelisted.bypassCode,
      };
    }
  }
  
  return { isBypassed: false, reason: null, expiresAt: null };
}
```

### Frontend میں Impact

```typescript
// App کو یہ ملے گی:

{
  success: true,
  otpRequired: false,  ← ⭐ MAIN DIFFERENCE!
  channel: undefined,
}

// Frontend behavior:
if (!response.otpRequired) {
  // OTP screen skip کر دو
  goToNextStep();  // Full Name step پر جاؤ
} else {
  // OTP input چاہیے
  showOtpInput();
}
```

---

## Per-User Bypass - API Level

### Endpoint

```http
POST /users/{userId}/otp/bypass
Content-Type: application/json

{
  "minutes": 60
}

Response:
{
  "success": true,
  "data": {
    "bypassUntil": "2026-05-23T16:00:00Z"
  }
}
```

### Backend Logic

```typescript
// File: artifacts/api-server/src/routes/admin/users.ts (approximate)

router.post("/users/:userId/otp/bypass", async (req, res) => {
  const { userId } = req.params;
  const { minutes } = req.body;
  
  // Validate
  if (!minutes || minutes < 1) {
    return res.status(400).json({ error: "Invalid duration" });
  }
  
  // Calculate expiry
  const bypassUntil = new Date(Date.now() + minutes * 60 * 1000);
  
  // Update database
  await db.update(usersTable)
    .set({ otpBypassUntil: bypassUntil })
    .where(eq(usersTable.id, userId));
  
  // Log event
  await logOTPBypassEvent(
    "login_per_user_bypass",
    userId,
    phone,
    ip,
    "admin_action"
  );
  
  return res.json({ success: true, data: { bypassUntil } });
});
```

### Check During Login

```typescript
// File: artifacts/api-server/src/lib/auth-otp-bypass.ts:37-49

// Priority 1: Per-user bypass (checked FIRST)
const user = await db.query.usersTable.findFirst({
  where: and(
    eq(usersTable.phone, phone),
    gt(usersTable.otpBypassUntil, now)  ← Is bypass still active?
  ),
  columns: { id: true, otpBypassUntil: true },
});

if (user && user.otpBypassUntil && user.otpBypassUntil > now) {
  return {
    isBypassed: true,
    reason: "per_user",
    expiresAt: user.otpBypassUntil,
  };
}
```

---

## Global OTP Suspend - platform_settings

### Database Schema

```sql
-- Table: platform_settings
CREATE TABLE platform_settings (
  id UUID PRIMARY KEY,
  key VARCHAR NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  UNIQUE(key)
);

-- Example row for OTP suspension:
INSERT INTO platform_settings (id, key, value, created_at, updated_at)
VALUES (
  'ps_' || gen_random_uuid()::text,
  'otp_global_disabled_until',
  '2026-05-23T16:00:00Z',
  NOW(),
  NOW()
);
```

### Check Logic

```typescript
// File: artifacts/api-server/src/lib/auth-otp-bypass.ts:52-64

// Priority 2: Global OTP disable
const activeDisable = await db.query.platformSettingsTable.findFirst({
  where: and(
    eq(platformSettingsTable.key, "otp_global_disabled_until"),
    gt(platformSettingsTable.value, now.toISOString())  ← Is it still active?
  ),
  columns: { value: true },
});

if (activeDisable?.value) {
  const disabledUntil = new Date(activeDisable.value);
  return {
    isBypassed: true,
    reason: "global",
    expiresAt: disabledUntil,
  };
}
```

### API Endpoint

```http
POST /otp/disable
Content-Type: application/json

{
  "minutes": 60,
  "reason": "SMS provider outage"
}

Response:
{
  "success": true,
  "data": {
    "disabledUntil": "2026-05-23T16:00:00Z"
  }
}
```

---

## OTP Config Values

```typescript
// File: artifacts/api-server/src/modules/otp/otp.config.ts

export const OTP_CONFIG = {
  CODE_LENGTH: 6,              // 6-digit code
  TRIP_CODE_LENGTH: 4,         // 4-digit for delivery
  
  TTL_MS: 5 * 60 * 1000,      // 5 minutes expiry
  
  MAX_ATTEMPTS: 5,             // 5 failed tries
  LOCKOUT_DURATION_MS: 15 * 60 * 1000,  // 15 min lockout
  
  MAX_SEND_PER_HOUR: 5,       // 5 OTPs per hour
  RESEND_COOLDOWN_MS: 60 * 1000,  // 60 sec between sends
  
  CHANNEL_PRIORITY: ["whatsapp", "sms", "email"],
  
  CLEANUP_USED_AFTER_MS: 24 * 60 * 60 * 1000,  // Delete after 24h
};
```

---

## Registration Endpoint

```http
POST /auth/register
Content-Type: application/json

{
  "phone": "+923001234567",
  "otp": "123456",
  "fullName": "Test User",
  "city": "Karachi",
  "password": "Password@123",
  "userType": "vendor|rider|customer"
}

Response (Success):
{
  "success": true,
  "data": {
    "user": {
      "id": "user_xxx",
      "phone": "+923001234567",
      "fullName": "Test User",
      "email": null,
      "phone_verified_at": "2026-05-23T15:28:00Z",
      "roles": ["vendor"],
      "is_verified": false,
      "approval_status": "pending"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}

Response (OTP Bypass - if it was bypassed):
{
  "success": true,
  "otpRequired": false,
  "devCode": "654321",  // Dev mode only
  "message": "Registration flow started - OTP bypassed"
}
```

---

## Environment Check

```bash
# Check NODE_ENV
echo $NODE_ENV
# Expected output: development

# Check in .env file
cat artifacts/api-server/.env | grep NODE_ENV
# NODE_ENV=development

# Check Backend Logs
# Expected: "[DEV MODE] AJKMart API — running without vault"

# Verify isDevMode works
curl http://localhost:3000/api/auth/send-otp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"phone": "+923001234567", "identifierType": "phone", "otpType": "auth"}'

# Response should include "devCode" field:
# {
#   "success": true,
#   "otpRequired": true,
#   "devCode": "654321"
# }
```

---

## Testing Workflow (Command Line)

```bash
# 1. Send OTP
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+923001234567",
    "identifierType": "phone",
    "otpType": "auth"
  }' | jq .

# Response:
# {
#   "success": true,
#   "otpRequired": true,
#   "channel": "sms",
#   "devCode": "654321",
#   "expiresAt": "2026-05-23T15:33:00Z"
# }

# 2. Verify OTP
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+923001234567",
    "otp": "654321",
    "identifierType": "phone",
    "otpType": "auth"
  }' | jq .

# Response:
# {
#   "success": true,
#   "data": {
#     "accessToken": "eyJhbGc...",
#     "refreshToken": "eyJhbGc...",
#     "user": { ... }
#   }
# }

# 3. Register User
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+923001234567",
    "otp": "654321",
    "fullName": "Test Vendor",
    "city": "Karachi",
    "password": "TestVendor@123",
    "userType": "vendor"
  }' | jq .
```

---

## Troubleshooting

### Problem: devCode not in response

```bash
# Check 1: NODE_ENV
echo $NODE_ENV
# Should be: development

# Check 2: Restart backend
pkill -f "api-server"
npm run dev

# Check 3: Check logs for DEV MODE message
# Should see: "[DEV MODE] AJKMart API — running without vault"

# Check 4: Test again
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+923001234567",
    "identifierType": "phone",
    "otpType": "auth"
  }' | jq .devCode
# Should output: "123456"
```

### Problem: Whitelist not working

```bash
# Check 1: Entry exists
psql -d ajkmart_db -c "
  SELECT identifier, bypass_code, is_active, expires_at
  FROM whitelist_users
  WHERE identifier = '03001234567';
"

# Check 2: Phone format
# Should be E.164: +923001234567 OR Pakistani: 03001234567
# NOT: 00923001234567 (wrong format)

# Check 3: is_active = true
# Check 4: expires_at > NOW()

# Check 5: Logs during OTP send
# Should see: "[OTPBypass] Check found — whitelist bypass active"
```

---

## Summary

| Concept | Where | What |
|---------|-------|------|
| devCode | Response | Generated OTP code (dev only) |
| Whitelist | DB | Test accounts in whitelist_users |
| Per-User Bypass | users table | otpBypassUntil timestamp |
| Global Suspend | platform_settings | otp_global_disabled_until |
| isDevMode() | Backend | NODE_ENV check |
| checkOTPBypass() | auth-otp-bypass.ts | Main bypass logic |

---

**ہر چیز technical details کے ساتھ تیار ہے!** ✅
