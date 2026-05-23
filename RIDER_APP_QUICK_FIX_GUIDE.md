# 🔧 RIDER APP - QUICK FIX GUIDE

## **TOP 5 CRITICAL FIXES - APPLY TODAY**

---

## **FIX #1: Install Missing Type Definitions** ⚡ (5 min)
```bash
cd /workspaces/ajkmart123

# Install missing type packages
pnpm add -D @types/node @types/react @types/react-dom @types/express

# Reinstall all dependencies
pnpm install

# Verify no TypeScript errors
pnpm tsc --noEmit
```

**Expected Result:** 691 errors → 0 errors

---

## **FIX #2: Fix Ride Accept - Add Profile Validation** ⚠️ (20 min)

**File:** `artifacts/api-server/src/routes/rider/index.ts`

**ADD THIS MIDDLEWARE:**
```typescript
import { riderProfilesTable } from "@workspace/db/schema";

async function validateRiderProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await db.query.riderProfiles.findFirst({
      where: eq(riderProfilesTable.userId, req.riderId!),
    });

    if (!profile) {
      return sendValidationError(res, "Create a rider profile first");
    }

    if (!profile.vehicleType || !profile.vehiclePhoto || !profile.drivingLicense) {
      return sendValidationError(res, "Complete your profile: vehicle type, photo, and license required");
    }

    // Check for penalties/suspensions
    const penalties = await db
      .select()
      .from(riderPenaltiesTable)
      .where(eq(riderPenaltiesTable.riderId, req.riderId!));

    if (penalties.length > 0) {
      return sendError(res, "You have active penalties. Contact support.", 403);
    }

    next();
  } catch (err) {
    next(err);
  }
}

// USE IT:
router.post("/rides/accept", validateRiderProfile, rideAcceptLimiter, async (req, res, next) => {
  // ... existing logic
});
```

---

## **FIX #3: GPS Spoofing - Block Suspicious Riders** 🚨 (25 min)

**File:** `artifacts/api-server/src/routes/rides/dispatch.ts`

**ADD VALIDATION:**
```typescript
async function validateRiderLocation(riderId: string, lat: number, lng: number) {
  // Get rider's last known location
  const lastLocation = await db.query.liveLocations.findFirst({
    where: eq(liveLocationsTable.userId, riderId),
  });

  if (!lastLocation) return true; // First location, always ok

  // Calculate distance
  const distance = haversineMeters(
    parseFloat(lastLocation.lat),
    parseFloat(lastLocation.lng),
    lat,
    lng
  );

  // Check if movement is physically possible
  const timeDiff = (Date.now() - new Date(lastLocation.updatedAt).getTime()) / 1000;
  const maxSpeed = 120; // km/h for delivery bike
  const maxDistance = (maxSpeed / 3.6) * timeDiff; // meters

  if (distance > maxDistance * 1.5) {
    // 50% buffer for GPS error
    await addSecurityEvent({
      type: "gps_spoof_detected",
      userId: riderId,
      data: { distance, maxDistance, timeDiff },
    });

    // SUSPEND RIDER
    await db
      .update(usersTable)
      .set({
        status: "suspended",
        suspendReason: "GPS spoofing detected - traveling impossibly fast",
        suspendedAt: new Date(),
      })
      .where(eq(usersTable.id, riderId));

    throw new Error("Suspicious location activity. Account suspended.");
  }

  return true;
}

// BEFORE accepting ride:
await validateRiderLocation(req.riderId!, lat, lng);
```

---

## **FIX #4: Wallet Transaction Idempotency** 💰 (30 min)

**File:** `artifacts/api-server/src/routes/vendor.ts`

**CURRENT CODE (BROKEN):**
```typescript
router.post("/wallet/withdraw", async (req, res, next) => {
  const { amount, method } = req.body;
  // PROBLEM: No idempotency - concurrent requests both pass balance check!
});
```

**FIXED CODE:**
```typescript
// Add to idempotency cache at top of file
interface IdempotencyEntry {
  status: number;
  body: any;
  timestamp: number;
}
const idempotencyCache = new Map<string, IdempotencyEntry>();
const IDEM_TTL_MS = 5 * 60_000; // 5 minutes

router.post("/wallet/withdraw", async (req, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const idempotencyKey = req.headers["x-idempotency-key"];

    // Check idempotency cache
    if (idempotencyKey && typeof idempotencyKey === "string") {
      const cacheKey = `withdraw:${vendorId}:${idempotencyKey}`;
      const cached = idempotencyCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < IDEM_TTL_MS) {
        // Already processed
        return res.status(cached.status).json(cached.body);
      }
    }

    const { amount, method } = req.body;
    const amt = parseFloat(String(amount));

    if (!amt || amt <= 0) {
      return sendValidationError(res, "Valid amount is required");
    }

    const transactionId = generateId();

    // TRANSACTION: Atomic operation
    await db.transaction(async (tx) => {
      // LOCK the vendor row
      const [locked] = await tx
        .select({ walletBalance: usersTable.walletBalance })
        .from(usersTable)
        .where(eq(usersTable.id, vendorId))
        .limit(1)
        .for("update");

      const available = safeNum(locked?.walletBalance);

      if (amt > available) {
        throw Object.assign(new Error("Insufficient balance"), {
          code: "INSUFFICIENT",
          httpStatus: 400,
        });
      }

      // Deduct from wallet
      await tx
        .update(usersTable)
        .set({
          walletBalance: sql`wallet_balance - ${amt}`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, vendorId));

      // Record transaction
      await tx.insert(walletTransactionsTable).values({
        id: transactionId,
        userId: vendorId,
        type: "debit",
        amount: amt.toFixed(2),
        description: `Withdrawal - ${method}`,
        reference: `WD-${transactionId.slice(-8).toUpperCase()}`,
        paymentMethod: method || "bank_transfer",
        idempotencyKey: idempotencyKey || undefined,
      });
    });

    const response = {
      success: true,
      transactionId,
      amount: amt,
      reference: `WD-${transactionId.slice(-8).toUpperCase()}`,
    };

    // Store in idempotency cache
    if (idempotencyKey && typeof idempotencyKey === "string") {
      const cacheKey = `withdraw:${vendorId}:${idempotencyKey}`;
      idempotencyCache.set(cacheKey, {
        status: 201,
        body: response,
        timestamp: Date.now(),
      });
    }

    sendCreated(res, response);
  } catch (err) {
    // ... error handling
  }
});
```

---

## **FIX #5: Offline Queue Replay on App Resume** 📱 (20 min)

**File:** `artifacts/rider-app/src/App.tsx`

**ADD THIS TO RiderAuthProvider:**
```typescript
import { syncQueue } from "./lib/offline/queueManager";

export function RiderAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Replay queue when app becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && navigator.onLine) {
        log.info("App resumed - replaying offline queue");
        void syncQueue().catch((err) =>
          log.error({ err }, "Queue replay failed")
        );
      }
    };

    // Also sync when connection restored
    const handleOnline = () => {
      log.info("Connection restored - replaying offline queue");
      void syncQueue().catch((err) =>
        log.error({ err }, "Queue replay failed")
      );
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    // INITIAL: Check if there's queued actions on mount
    if (user && navigator.onLine) {
      void syncQueue();
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [user]);

  return <AuthContext.Provider value={{...}}>{children}</AuthContext.Provider>;
}
```

---

## **BONUS: Quick Wins** 🎯

### **Fix React Hook Warning (5 min)**
**File:** `artifacts/rider-app/src/pages/Home.tsx` line 169
```typescript
// BEFORE
}, [user?.id]);

// AFTER
}, [user]);
```

---

### **Fix ForgotPassword useCallback (5 min)**
**File:** `artifacts/rider-app/src/pages/ForgotPassword.tsx` line 167
```typescript
// BEFORE
const T = (key: TranslationKey) => tDual(key, language);

// AFTER
const T = useCallback(
  (key: TranslationKey) => tDual(key, language),
  [language]
);
```

---

### **Fix OTP Attempt Reset (10 min)**
**File:** `artifacts/api-server/src/routes/rider/index.ts`
```typescript
// ADD after successful OTP verification:
if (correctOtp === otpInput) {
  await db
    .delete(otpAttemptsTable)
    .where(
      and(
        eq(otpAttemptsTable.riderId, req.riderId!),
        eq(otpAttemptsTable.rideId, rideId)
      )
    );
  // Reset counter
  sendSuccess(res, { verified: true });
}
```

---

## **DATABASE MIGRATIONS (Run if using PostgreSQL)**

```sql
-- Add missing rider profile fields
ALTER TABLE rider_profiles 
ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS documents_verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS bank_account TEXT,
ADD COLUMN IF NOT EXISTS bank_account_title TEXT;

-- Add index for faster KYC queries
CREATE INDEX IF NOT EXISTS rider_profiles_kyc_status_idx 
ON rider_profiles(kyc_status);

-- Add index for rider penalties queries
CREATE INDEX IF NOT EXISTS rider_penalties_rider_date_idx 
ON rider_penalties(rider_id, created_at DESC);

-- Add wallet transaction idempotency
ALTER TABLE wallet_transactions
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
```

---

## **TESTING - Run Before Deploying**

```bash
# Lint check
pnpm lint

# Type check
pnpm tsc --noEmit

# Build test
pnpm build

# Run tests
pnpm test:unit
pnpm test:integration
```

---

## **DEPLOYMENT CHECKLIST**

- [ ] All type definitions installed
- [ ] 5 critical fixes implemented
- [ ] Database migrations run
- [ ] Unit tests passing
- [ ] Lint/build clean
- [ ] E2E tests on staging
- [ ] Monitoring alerts configured
- [ ] Feature flags ready

---

**Time to Fix:** ~2 hours for all 5 critical issues  
**Impact:** Prevents wallet fraud, improves data integrity, fixes crashes
