# 📖 OTP Code Structure Reference

## File Organization

```
artifacts/
├── api-server/src/
│   ├── modules/otp/
│   │   ├── index.ts                    ← Exports: sendOtp, verifyOtp
│   │   ├── otp.types.ts               ← TypeScript interfaces
│   │   ├── otp.config.ts              ← Constants (MAX_ATTEMPTS=5, etc)
│   │   ├── otp.generate.ts            ← Code generation + hashing
│   │   ├── otp.deliver.ts             ← SMS/WhatsApp delivery
│   │   ├── otp.store.ts               ← Database operations
│   │   └── otp.verify.ts              ← MAIN: sendOtp + verifyOtp
│   │
│   ├── lib/
│   │   └── auth-otp-bypass.ts         ← ⭐ CRITICAL: checkOTPBypass()
│   │
│   └── routes/auth/
│       └── phone.routes.ts             ← API endpoints
│
└── admin/src/pages/
    └── otp-control.tsx                 ← Admin UI dashboard
```

---

## Core Function: checkOTPBypass()

### Location
```
File: artifacts/api-server/src/lib/auth-otp-bypass.ts
Lines: 32-112 (main logic)
Exported: YES
Used by: otp.verify.ts:sendOtp()
```

### Function Signature
```typescript
export async function checkOTPBypass(phone: string): Promise<OTPBypassStatus>
```

### Return Type
```typescript
interface OTPBypassStatus {
  isBypassed: boolean;              // true if bypass is active
  reason: "per_user" | "global" | "whitelist" | null;
  expiresAt: Date | null;           // when bypass expires
  bypassCode?: string;              // test code (dev only)
}
```

### Usage in sendOtp()
```typescript
// File: artifacts/api-server/src/modules/otp/otp.verify.ts:94

if (identifierType === "phone") {
  const bypass = await checkOTPBypass(identifier);  // ⭐ THE CALL
  
  if (bypass.isBypassed) {
    // Log the bypass event
    await logOTPBypassEvent(
      "otp_send_bypassed",
      userId ?? null,
      identifier,
      ipAddress ?? "unknown",
      bypass.reason ?? "unknown",
      { otpType }
    );
    
    // Return: user doesn't need OTP
    return {
      success: true,
      otpRequired: false,              // ⭐ THIS IS THE KEY
      channel: undefined,
      expiresAt: bypass.expiresAt ?? undefined,
      ...(bypass.bypassCode && isDevMode() && { devCode: bypass.bypassCode }),
    };
  }
}
```

---

## Implementation Detail: Three Bypass Checks

### Check 1: Per-User Bypass

```typescript
// File: auth-otp-bypass.ts:37-49

const user = await db.query.usersTable.findFirst({
  where: and(
    eq(usersTable.phone, phone),
    gt(usersTable.otpBypassUntil, now)  // Is bypass active RIGHT NOW?
  ),
  columns: { id: true, otpBypassUntil: true },
});

if (user && user.otpBypassUntil && user.otpBypassUntil > now) {
  return {
    isBypassed: true,
    reason: "per_user",
    expiresAt: user.otpBypassUntil,    // When does it expire?
  };
}
```

**When Used**: Admin grants bypass for 1 hour  
**Expires**: Automatically after 1 hour  
**Audit**: Logged in `otp_bypass_audit` table  

---

### Check 2: Global OTP Suspension

```typescript
// File: auth-otp-bypass.ts:52-64

const activeDisable = await db.query.platformSettingsTable.findFirst({
  where: and(
    eq(platformSettingsTable.key, "otp_global_disabled_until"),
    gt(platformSettingsTable.value, now.toISOString())  // Is it active NOW?
  ),
  columns: { value: true },
});

if (activeDisable?.value) {
  const disabledUntil = new Date(activeDisable.value);
  return {
    isBypassed: true,
    reason: "global",
    expiresAt: disabledUntil,          // When does it expire?
  };
}
```

**When Used**: SMS provider outage  
**Expires**: Automatically at set time  
**Effect**: ALL users skip OTP verification  
**Audit**: Logged in `otp_bypass_audit` table  

---

### Check 3: Whitelist Bypass

```typescript
// File: auth-otp-bypass.ts:68-104

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
  // PRODUCTION SAFETY: Block test codes in production
  if (
    process.env.NODE_ENV === "production" &&
    (whitelisted.bypassCode === "123456" || whitelisted.bypassCode === "000000")
  ) {
    logger.warn(
      { phone, code: whitelisted.bypassCode },
      "[OTPBypass] Rejected test bypass code in production"
    );
    // Fall through to normal OTP (test code rejected)
  } else {
    return {
      isBypassed: true,
      reason: "whitelist",
      expiresAt: whitelisted.expiresAt || null,
      bypassCode: whitelisted.bypassCode,
    };
  }
}
```

**When Used**: Testing with test accounts  
**Production Safety**: Test codes (000000, 123456) automatically blocked  
**Expires**: Optional expiry date  
**Dev Mode**: Bypass code returned in response  

---

## Admin UI: How It Works

### File: otp-control.tsx

#### 1. State Management
```typescript
// Line 267-287
const [status, setStatus] = useState<OTPStatus | null>(null);
const [statusLoading, setStatusLoading] = useState(false);
const [customMinutes, setCustomMinutes] = useState("");
const remaining = useCountdown(status?.disabledUntil ?? null);  // Countdown timer
```

#### 2. Suspend OTP Button
```typescript
// Line 856-879
<div>
  <p className="text-muted-foreground mb-2.5 text-[11px] font-semibold tracking-wider uppercase">
    Suspend for
  </p>
  <div className="flex flex-wrap gap-2">
    {[
      { label: "30 min", mins: 30 },
      { label: "1 hour", mins: 60 },
      { label: "2 hours", mins: 120 },
      { label: "24 hours", mins: 1440 },
    ].map((opt) => (
      <button
        key={opt.mins}
        onClick={() => openSuspendModal(opt.mins)}
        disabled={statusLoading}
        className="rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50"
      >
        {opt.label}
      </button>
    ))}
  </div>
</div>
```

#### 3. Confirmation Dialog
```typescript
// Line 919-960
<Dialog
  open={suspendModal.open}
  onOpenChange={(open) => {
    if (!open && !suspendPending) setSuspendModal({ open: false, mins: 0 });
  }}
>
  <DialogContent className="max-w-md rounded-2xl">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2 text-red-600">
        <ShieldOff className="h-5 w-5" /> Confirm Global OTP Suspension
      </DialogTitle>
    </DialogHeader>
    
    <div className="mt-1 space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50 p-3">
        <p className="text-sm text-red-800">
          You are about to suspend OTP verification for <strong>all users</strong> for{" "}
          <strong>
            {suspendModal.mins >= 60
              ? `${suspendModal.mins / 60 === Math.floor(suspendModal.mins / 60) ? suspendModal.mins / 60 + " hour(s)" : suspendModal.mins + " minutes"}`
              : `${suspendModal.mins} minute(s)`}
          </strong>
          . Users will be able to log in without receiving an OTP code.
        </p>
      </div>
      
      {/* Reason field (REQUIRED) */}
      <div className="space-y-1.5">
        <label className="text-foreground text-xs font-semibold tracking-wider uppercase">
          Reason for suspension <span className="text-red-500">*</span>
        </label>
        <textarea
          value={suspendReason}
          onChange={(e) => setSuspendReason(e.target.value)}
          placeholder="e.g. SMS gateway outage — Twilio down, users cannot receive OTP codes"
          className="border-input bg-background h-24 w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-300 focus:outline-none"
        />
      </div>
      
      {/* Buttons */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setSuspendModal({ open: false, mins: 0 })}>
          Cancel
        </Button>
        <Button variant="destructive" className="flex-1 gap-1.5 rounded-xl" onClick={confirmSuspend}>
          {suspendPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Suspending…
            </>
          ) : (
            <>
              <ShieldOff className="h-3.5 w-3.5" /> Confirm Suspension
            </>
          )}
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>
```

#### 4. API Call to Backend
```typescript
// Line 400-427
const confirmSuspend = async () => {
  if (!suspendReason.trim()) return;
  
  setSuspendPending(true);
  try {
    const d = await api("POST", "/otp/disable", {
      minutes: suspendModal.mins,
      reason: suspendReason.trim(),
    });
    
    if (d?.data) {
      toast({
        title: "OTP Suspended",
        description: `All OTPs suspended for ${suspendModal.mins} minute(s).`,
      });
      void loadStatus();
      void loadAudit();
      setSuspendModal({ open: false, mins: 0 });
      setSuspendReason("");
    } else {
      toast({
        title: "Error",
        description: d?.error ?? "Failed",
        variant: "destructive",
      });
    }
  } catch (e: unknown) {
    toast({
      title: "Error",
      description: errorMessage(e, "Failed to suspend OTPs."),
      variant: "destructive",
    });
  } finally {
    setSuspendPending(false);
  }
};
```

#### 5. Status Display with Countdown
```typescript
// Line 793-821
{status?.isGloballyDisabled ? (
  <div className="flex items-center gap-4 rounded-xl border-2 border-red-200 bg-red-50 p-4">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
      <AlertTriangle className="h-5 w-5 text-red-600" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-red-800">OTPs are GLOBALLY SUSPENDED</p>
        <span className="inline-flex items-center gap-1 rounded-lg bg-red-200 px-2 py-0.5 font-mono text-xs font-bold text-red-800">
          <Clock className="h-3 w-3" />
          {fmtCountdown(remaining)}  {/* ← Live countdown */}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-red-600">
        All users can log in without OTP. Auto-restores when the timer expires.
      </p>
    </div>
    <Button
      size="sm"
      variant="destructive"
      onClick={() =>
        api("DELETE", "/otp/disable")
          .then(() => {
            toast({
              title: "OTPs Restored",
              description: "Global OTP suspension lifted.",
            });
            void loadStatus();
            void loadAudit();
          })
          .catch((e: unknown) => {
            toast({
              title: "Error",
              description: errorMessage(e, "Failed to restore OTPs."),
              variant: "destructive",
            });
          })
      }
      className="shrink-0 rounded-xl"
    >
      Restore Now  {/* ← Manual override */}
    </Button>
  </div>
) : (
  <div className="flex items-center gap-4 rounded-xl border border-green-200 bg-green-50 p-4">
    <CheckCircle2 className="h-5 w-5 text-green-600" />
    <div>
      <p className="text-sm font-bold text-green-800">OTPs are ACTIVE</p>
      <p className="mt-0.5 text-xs text-green-600">
        All users must verify OTP on login.
      </p>
    </div>
  </div>
)}
```

---

## Database Tables Involved

### 1. users (Per-User Bypass)
```sql
Table: users
Columns relevant to OTP:
  - id: UUID
  - phone: E.164 format (+923001234567)
  - otpBypassUntil: TIMESTAMP  ← When bypass expires
  - isActive: BOOLEAN
  - is_verified: BOOLEAN
```

### 2. platform_settings (Global Suspension)
```sql
Table: platform_settings
Columns:
  - id: UUID
  - key: "otp_global_disabled_until"
  - value: ISO 8601 timestamp (e.g., "2026-05-23T20:00:00Z")
  - created_at: TIMESTAMP
```

### 3. whitelist_users (Whitelist Bypass)
```sql
Table: whitelist_users
Columns:
  - id: UUID
  - identifier: phone or email
  - bypassCode: 6-digit code
  - isActive: BOOLEAN
  - expiresAt: TIMESTAMP (optional)
```

### 4. otp_bypass_audit (Audit Trail)
```sql
Table: otp_bypass_audit
Columns:
  - id: UUID
  - eventType: "login_otp_bypass" | "otp_send_bypassed" | ...
  - userId: UUID (nullable)
  - phone: string
  - ip: string
  - bypassReason: "per_user" | "global" | "whitelist"
  - metadata: JSON
  - created_at: TIMESTAMP
```

---

## API Endpoints

### Suspend OTP (Global)
```http
POST /otp/disable
Content-Type: application/json

{
  "minutes": 60,
  "reason": "SMS gateway outage"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "disabledUntil": "2026-05-23T20:00:00Z"
  }
}
```

### Restore OTP (Global)
```http
DELETE /otp/disable

Response: 200 OK
{
  "success": true
}
```

### Grant Per-User Bypass
```http
POST /users/{userId}/otp/bypass
Content-Type: application/json

{
  "minutes": 60
}

Response: 200 OK
{
  "data": {
    "bypassUntil": "2026-05-23T20:00:00Z"
  }
}
```

### Generate OTP (for user)
```http
POST /users/{userId}/otp/generate

Response: 200 OK
{
  "data": {
    "code": "123456"
  }
}
```

---

## Error Handling

### Custom Error Classes
```typescript
// File: otp.types.ts

export class OtpBlockedError extends Error {
  constructor(message: string, public unlocksAt: Date) {
    super(message);
  }
}

export class OtpExpiredError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class OtpInvalidError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class OtpRateLimitError extends Error {
  constructor(message: string, public retryAfterMs: number) {
    super(message);
  }
}
```

---

## Key Constants

```typescript
// File: otp.config.ts

export const OTP_CONFIG = {
  CODE_LENGTH: 6,                    // 6-digit code
  CODE_TTL_MS: 10 * 60 * 1000,      // 10 minutes
  MAX_ATTEMPTS: 5,                   // Max tries before lockout
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes lockout
  MAX_SEND_PER_HOUR: 3,             // Max sends per hour
  RESEND_COOLDOWN_MS: 30 * 1000,    // 30 second wait between sends
  HASH_ROUNDS: 10,                   // Bcrypt rounds
};
```

---

## Summary

| Component | File | Purpose |
|-----------|------|---------|
| **Core Logic** | `auth-otp-bypass.ts` | `checkOTPBypass()` function |
| **OTP Send** | `otp.verify.ts` | Calls `checkOTPBypass()` |
| **Admin UI** | `otp-control.tsx` | Suspend/restore buttons |
| **Database** | Schema files | Stores bypass state |
| **API** | `phone.routes.ts` | `/otp/disable` endpoints |
| **Audit** | `otp_bypass_audit` | Complete event log |

**Everything is connected and working together** ✅
