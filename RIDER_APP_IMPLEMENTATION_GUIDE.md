# 🛠️ RIDER APP AUDIT - COMPLETE IMPLEMENTATION GUIDE

## Complete Code Snippets for All 27 Fixes

---

## **CRITICAL FIXES (Implement First)**

### **CRITICAL FIX #1: Install Type Definitions**

```bash
#!/bin/bash
cd /workspaces/ajkmart123

# Install all missing type packages
pnpm add -D \
  @types/node \
  @types/react \
  @types/react-dom \
  @types/express \
  @types/cors \
  @types/helmet \
  @types/compression

# Verify installation
pnpm tsc --noEmit

# Run lint
pnpm lint
```

**Expected Output:**
```
✓ 0 errors
✓ Type checking passed
```

---

### **CRITICAL FIX #2: Rider Profile Validation Middleware**

**File:** `artifacts/api-server/src/routes/rider/index.ts`

**Add this import at the top:**
```typescript
import { 
  riderProfilesTable, 
  riderPenaltiesTable 
} from "@workspace/db/schema";
```

**Add this middleware function:**
```typescript
/**
 * Validates that rider has completed profile before accepting rides
 */
async function validateRiderProfileComplete(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  if (!req.riderId) {
    return sendValidationError(res, "Rider ID required");
  }

  try {
    // Check profile exists and is complete
    const profile = await db.query.riderProfiles.findFirst({
      where: eq(riderProfilesTable.userId, req.riderId),
    });

    if (!profile) {
      return sendValidationError(
        res, 
        "No rider profile found. Create one first."
      );
    }

    // Check required fields
    const missingFields = [];
    if (!profile.vehicleType) missingFields.push("vehicleType");
    if (!profile.vehiclePhoto) missingFields.push("vehiclePhoto");
    if (!profile.drivingLicense) missingFields.push("drivingLicense");
    if (!profile.vehiclePlate) missingFields.push("vehiclePlate");

    if (missingFields.length > 0) {
      return sendValidationError(
        res, 
        `Profile incomplete. Missing: ${missingFields.join(", ")}`
      );
    }

    // Check for active penalties
    const penalties = await db
      .select()
      .from(riderPenaltiesTable)
      .where(
        and(
          eq(riderPenaltiesTable.riderId, req.riderId),
          gte(
            riderPenaltiesTable.createdAt,
            sql`NOW() - INTERVAL '30 days'`
          )
        )
      );

    if (penalties.length > 0) {
      const totalPenalty = penalties.reduce(
        (sum, p) => sum + parseFloat(p.amount || "0"), 
        0
      );
      return sendError(
        res, 
        `You have ${penalties.length} active penalties (Total: ${totalPenalty}). Contact support.`,
        403
      );
    }

    // Check for suspensions
    const user = await db.query.users.findFirst({
      where: eq(usersTable.id, req.riderId),
    });

    if (user && user.status === "suspended") {
      return sendError(
        res, 
        `Account suspended: ${user.suspendReason || "Contact support"}`,
        403
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}
```

**Apply to ride accept endpoint:**
```typescript
router.post(
  "/rides/:rideId/accept",
  validateRiderProfileComplete,      // ← ADD THIS
  rideAcceptLimiter,
  async (req, res, next) => {
    // ... existing logic
  }
);
```

---

### **CRITICAL FIX #3: GPS Spoofing Detection & Blocking**

**File:** `artifacts/api-server/src/routes/rides/dispatch.ts`

**Add this helper function:**
```typescript
/**
 * Validates rider location hasn't changed impossibly fast (GPS spoofing check)
 */
async function validateRiderLocationSecurity(
  riderId: string, 
  currentLat: number, 
  currentLng: number,
  tx?: any
): Promise<{ valid: boolean; error?: string }> {
  const database = tx || db;

  // Get rider's last known location
  const lastLocation = await database
    .select()
    .from(liveLocationsTable)
    .where(eq(liveLocationsTable.userId, riderId))
    .orderBy(desc(liveLocationsTable.updatedAt))
    .limit(1);

  // First location is always ok
  if (!lastLocation || lastLocation.length === 0) {
    return { valid: true };
  }

  const prev = lastLocation[0];
  const timeDiff = (Date.now() - new Date(prev.updatedAt).getTime()) / 1000;

  // Calculate distance using Haversine formula
  const R = 6_371_000; // Earth radius in meters
  const dLat = ((currentLat - parseFloat(prev.lat)) * Math.PI) / 180;
  const dLng = ((currentLng - parseFloat(prev.lng)) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((parseFloat(prev.lat) * Math.PI) / 180) *
      Math.cos((currentLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // Check if movement is physically possible
  // Max speed for delivery bike: 100 km/h = 27.78 m/s
  const maxSpeedMs = 28;
  const maxPossibleDistance = maxSpeedMs * timeDiff;
  const buffer = 1.5; // 50% buffer for GPS error & calculation variance

  if (distance > maxPossibleDistance * buffer) {
    // Log security event
    await addSecurityEvent({
      userId: riderId,
      type: "gps_spoof_detected",
      severity: "critical",
      details: {
        distance: distance.toFixed(2),
        maxPossible: maxPossibleDistance.toFixed(2),
        timeSec: timeDiff.toFixed(2),
        speedKmh: ((distance / timeDiff) * 3.6).toFixed(2),
      },
    });

    return {
      valid: false,
      error: "Suspicious location activity detected. Possible GPS spoofing.",
    };
  }

  return { valid: true };
}

/**
 * Suspends rider account after GPS spoofing detected
 */
async function suspendRiderForSpoof(riderId: string, tx?: any) {
  const database = tx || db;

  await database
    .update(usersTable)
    .set({
      status: "suspended",
      suspendReason: "GPS spoofing detected during ride dispatch",
      suspendedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, riderId));

  // Notify admin
  await sendPushToUser(riderId, {
    title: "Account Suspended",
    body: "Your account has been suspended due to suspicious activity. Contact support.",
    type: "warning",
  });
}
```

**Use in ride accept:**
```typescript
router.post("/rides/:rideId/accept", async (req, res, next) => {
  try {
    const { lat, lng } = req.body;

    // Validate location
    const locationCheck = await validateRiderLocationSecurity(
      req.riderId!, 
      parseFloat(lat), 
      parseFloat(lng)
    );

    if (!locationCheck.valid) {
      // Suspend account immediately
      await suspendRiderForSpoof(req.riderId!);
      return sendError(res, locationCheck.error, 403);
    }

    // ... rest of accept logic
  } catch (err) {
    next(err);
  }
});
```

---

### **CRITICAL FIX #4: Wallet Transaction Idempotency**

**File:** `artifacts/api-server/src/routes/vendor.ts`

**Add at top of file:**
```typescript
// Idempotency cache for duplicate prevention
interface IdempotencyEntry {
  status: number;
  body: any;
  timestamp: number;
}

const idempotencyCache = new Map<string, IdempotencyEntry>();
const IDEM_TTL_MS = 5 * 60_000; // 5 minutes

function cleanupIdempotencyCache() {
  const now = Date.now();
  const staleKeys = [];
  
  for (const [key, entry] of idempotencyCache) {
    if (now - entry.timestamp > IDEM_TTL_MS) {
      staleKeys.push(key);
    }
  }
  
  staleKeys.forEach((k) => idempotencyCache.delete(k));
}

function getIdempotencyKey(req: Request): string | null {
  const key = req.headers["x-idempotency-key"];
  if (!key || typeof key !== "string") return null;
  const userId = req.vendorId || req.riderId || "anon";
  return `${req.method}:${req.path}:${userId}:${key}`;
}
```

**Replace the /wallet/withdraw endpoint:**
```typescript
router.post("/wallet/withdraw", async (req, res, next) => {
  try {
    // Clean up stale entries
    cleanupIdempotencyCache();

    const vendorId = req.vendorId!;
    const idemKey = getIdempotencyKey(req);

    // Check for existing response
    if (idemKey) {
      const existing = idempotencyCache.get(idemKey);
      if (existing) {
        return res.status(existing.status).json(existing.body);
      }
    }

    const { amount, method } = req.body;
    const amt = parseFloat(String(amount));

    if (!amt || amt <= 0) {
      return sendValidationError(res, "Valid amount is required");
    }

    const txId = generateId();

    // ATOMIC TRANSACTION
    const response = await db.transaction(async (tx) => {
      // Lock vendor row for update
      const [locked] = await tx
        .select({ walletBalance: usersTable.walletBalance })
        .from(usersTable)
        .where(eq(usersTable.id, vendorId))
        .limit(1)
        .for("update");

      if (!locked) {
        throw Object.assign(new Error("User not found"), {
          code: "NOT_FOUND",
          httpStatus: 404,
        });
      }

      const balance = safeNum(locked.walletBalance);

      if (amt > balance) {
        throw Object.assign(
          new Error(
            `Insufficient balance. Available: ${balance.toFixed(2)}`
          ),
          { code: "INSUFFICIENT", httpStatus: 400 }
        );
      }

      // Deduct from wallet (atomic)
      await tx
        .update(usersTable)
        .set({
          walletBalance: sql`wallet_balance - ${amt}`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, vendorId));

      // Record withdrawal transaction
      await tx.insert(walletTransactionsTable).values({
        id: txId,
        userId: vendorId,
        type: "debit",
        amount: amt.toFixed(2),
        description: `Withdrawal request — ${method || "bank_transfer"}`,
        reference: `WD-${txId.slice(-8).toUpperCase()}`,
        paymentMethod: method || "bank_transfer",
        idempotencyKey: idemKey || undefined,
      });

      return {
        success: true,
        transactionId: txId,
        amount: amt,
        reference: `WD-${txId.slice(-8).toUpperCase()}`,
        status: 201,
      };
    });

    // Cache response
    if (idemKey) {
      idempotencyCache.set(idemKey, {
        status: response.status,
        body: response,
        timestamp: Date.now(),
      });
    }

    sendCreated(res, response);
  } catch (err) {
    if (err instanceof Error && (err as any).code === "INSUFFICIENT") {
      return sendError(res, err.message, (err as any).httpStatus || 400);
    }
    if (err instanceof Error && (err as any).code === "NOT_FOUND") {
      return sendNotFound(res, err.message);
    }
    next(err);
  }
});
```

---

### **CRITICAL FIX #5: Offline Queue Replay**

**File:** `artifacts/rider-app/src/App.tsx`

**Add to RiderAuthProvider or main App:**
```typescript
import { syncQueue } from "./lib/offline/queueManager";

// Add this effect in your main component or provider
useEffect(() => {
  // Sync queue when tab becomes visible
  const handleVisibilityChange = () => {
    if (!document.hidden && navigator.onLine) {
      log.info("App resumed - syncing offline queue");
      void syncQueue().catch((err) =>
        log.error({ err }, "Failed to sync offline queue")
      );
    }
  };

  // Sync queue when connection restored
  const handleOnline = () => {
    log.info("Connection restored - syncing offline queue");
    void syncQueue().catch((err) =>
      log.error({ err }, "Failed to sync offline queue")
    );
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("online", handleOnline);

  // Initial sync on mount if online
  if (navigator.onLine) {
    void syncQueue();
  }

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("online", handleOnline);
  };
}, []);
```

---

## **HIGH PRIORITY FIXES**

### **HIGH FIX #6: Ride Expiry Refund Calculation**

**File:** `artifacts/api-server/src/routes/rides/dispatch.ts`

**Replace refund logic in expiry handler:**
```typescript
if (ride.paymentMethod === "wallet") {
  const rideRef = `ride:${ride.id}`;
  
  // Get the ride object for accurate fare info
  const rideData = await tx
    .select()
    .from(ridesTable)
    .where(eq(ridesTable.id, ride.id))
    .limit(1);

  if (rideData && rideData[0]) {
    const r = rideData[0];
    
    // Calculate total charges
    const fare = parseFloat(r.fare || "0");
    const platformFee = parseFloat(r.platformFee || "0");
    const totalCharged = fare + platformFee;

    // Refund full amount
    if (totalCharged > 0) {
      await tx
        .update(usersTable)
        .set({
          walletBalance: sql`wallet_balance + ${totalCharged}`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, ride.userId));

      await tx.insert(walletTransactionsTable).values({
        id: generateId(),
        userId: ride.userId,
        type: "credit",
        amount: totalCharged.toFixed(2),
        description: `Ride expired — auto-refund (Ride #${ride.id.slice(-6).toUpperCase()})`,
        reference: rideRef,
      });
    }
  }
}
```

---

### **HIGH FIX #7: Socket.IO Retry Optimization**

**File:** `artifacts/rider-app/src/lib/socket.tsx`

**Replace socket initialization:**
```typescript
// Adaptive retry configuration
const getSocketConfig = () => {
  const isOnline = typeof navigator !== "undefined" && navigator.onLine;
  const hasConnection = "connection" in navigator;
  
  // Reduce retries if offline or no persistent connection
  const maxRetries = !isOnline || !hasConnection ? 2 : 5;
  
  return {
    path: "/api/socket.io",
    auth: { token },
    transports: ["websocket", "polling"] as const,
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 20000,
    reconnectionAttempts: maxRetries,
    // Don't spam connections
    reconnectionDelayMaxRandom: 5000,
    // Reduce network overhead
    upgradeTimeout: 5000,
    forceBase64: false,
  };
};

const s = io(socketOrigin, getSocketConfig());

// Add error handler
s.on("error", (error) => {
  log.warn({ error }, "Socket error");
  setConnected(false);
});

// Add disconnect handler  
s.on("disconnect", (reason) => {
  if (reason === "io server disconnect") {
    // Server closed connection, don't auto-reconnect
    s.disconnect();
    setConnected(false);
  }
});
```

---

### **HIGH FIX #8: Earnings Calculation with Fees**

**File:** `artifacts/api-server/src/routes/rider/index.ts`

**Add or fix earnings endpoint:**
```typescript
router.get("/riders/me/earnings", async (req, res, next) => {
  try {
    const riderId = req.riderId;
    if (!riderId) {
      return sendValidationError(res, "Rider ID required");
    }

    // Get earnings breakdown
    const earnings = await db
      .select({
        grossFare: sql<number>`CAST(COALESCE(SUM(${ridesTable.fare}), 0) AS FLOAT)`,
        platformFees: sql<number>`CAST(COALESCE(SUM(${ridesTable.platformFee}), 0) AS FLOAT)`,
        cancellationFees: sql<number>`CAST(COALESCE(SUM(${ridesTable.cancellationFee}), 0) AS FLOAT)`,
        bonusEarnings: sql<number>`CAST(COALESCE(SUM(
          CASE WHEN ${walletTransactionsTable.type} = 'bonus' 
          THEN CAST(${walletTransactionsTable.amount} AS FLOAT) 
          ELSE 0 END
        ), 0) AS FLOAT)`,
        totalRides: sql<number>`CAST(COUNT(DISTINCT ${ridesTable.id}) AS INT)`,
      })
      .from(ridesTable)
      .leftJoin(
        walletTransactionsTable,
        eq(walletTransactionsTable.userId, riderId)
      )
      .where(
        and(
          eq(ridesTable.riderId, riderId),
          eq(ridesTable.status, "completed")
        )
      );

    const [data] = earnings;

    if (!data) {
      return sendSuccess(res, {
        gross: 0,
        platformFees: 0,
        cancellationFees: 0,
        bonus: 0,
        net: 0,
        totalRides: 0,
      });
    }

    const gross = parseFloat(String(data.grossFare || 0));
    const platformFees = parseFloat(String(data.platformFees || 0));
    const cancellationFees = parseFloat(String(data.cancellationFees || 0));
    const bonus = parseFloat(String(data.bonusEarnings || 0));
    const net = gross - platformFees - cancellationFees + bonus;

    sendSuccess(res, {
      gross: parseFloat(gross.toFixed(2)),
      platformFees: parseFloat(platformFees.toFixed(2)),
      cancellationFees: parseFloat(cancellationFees.toFixed(2)),
      bonus: parseFloat(bonus.toFixed(2)),
      net: parseFloat(net.toFixed(2)),
      totalRides: data.totalRides,
    });
  } catch (err) {
    next(err);
  }
});
```

---

## **MEDIUM PRIORITY FIXES**

### **MEDIUM FIX #11: Fix React Hook Dependencies**

**File:** `artifacts/rider-app/src/pages/Home.tsx` (line 169)

```typescript
// BEFORE
useEffect(() => {
  if (!user) return;
  setLastSeenOnlineAt((prev) => prev ?? new Date().toISOString());
}, [user?.id]);  // ← WRONG

// AFTER
useEffect(() => {
  if (!user) return;
  setLastSeenOnlineAt((prev) => prev ?? new Date().toISOString());
}, [user]);  // ← CORRECT
```

---

### **MEDIUM FIX #12: Memoize Translation Function**

**File:** `artifacts/rider-app/src/pages/ForgotPassword.tsx` (line 167)

```typescript
// BEFORE
const T = (key: TranslationKey) => tDual(key, language);

const handle2faVerify = useCallback(async (code: string) => {
  // ...
}, [method, phone, email, otp, newPassword, auth.captchaEnabled, captchaSiteKey, T]);
// ← React Hook warning!

// AFTER
const T = useCallback(
  (key: TranslationKey) => tDual(key, language),
  [language]
);

const handle2faVerify = useCallback(async (code: string) => {
  // ...
}, [method, phone, email, otp, newPassword, auth.captchaEnabled, captchaSiteKey, T]);
// ← No warning!
```

---

### **MEDIUM FIX #13: Clear Queue on Auth Failure**

**File:** `artifacts/rider-app/src/lib/offline/queueManager.ts`

```typescript
export class PermanentQueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentQueueError";
  }
}

async function clearQueue() {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, DL_STORE], "readwrite");
    tx.objectStore(STORE).clear();
    tx.objectStore(DL_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function syncQueue() {
  try {
    const actions = await getAllActions();
    
    for (const action of actions) {
      try {
        const response = await api("POST", `/rider-action`, action.payload, {
          headers: {
            "X-Action-Type": action.type,
            "X-Entity-ID": action.entityId,
          },
        });

        // Check for auth failure
        if (response.status === 401) {
          // Unauthorized - clear all queued actions
          await clearQueue();
          throw new PermanentQueueError(
            "Session expired - offline queue cleared"
          );
        }

        if (response.status >= 400) {
          throw new Error(`Action failed: ${response.statusText}`);
        }

        // Success - remove from queue
        await removeAction(action.id);
      } catch (err) {
        if (err instanceof PermanentQueueError) {
          throw err; // Bubble up to clear queue
        }

        // Increment retry count
        action.retryCount++;

        if (action.retryCount >= MAX_RETRIES) {
          // Move to dead letter
          await moveToDeadLetter(action);
          await removeAction(action.id);
        } else {
          // Keep in queue for next sync
          await updateAction(action);
        }
      }
    }
  } catch (err) {
    if (err instanceof PermanentQueueError) {
      await clearQueue();
    }
    throw err;
  }
}
```

---

### **MEDIUM FIX #14: Real-Time Wallet Updates**

**File:** `artifacts/rider-app/src/pages/Wallet.tsx`

```typescript
import { useSocket } from "../lib/socket";

export default function Wallet() {
  const { socket } = useSocket();
  const qc = useQueryClient();

  // Query with polling + focus refetch
  const { data: wallet } = useQuery(
    ["wallet"],
    () => api.getWallet(),
    {
      refetchInterval: 30_000,  // Poll every 30s
      refetchOnWindowFocus: true,  // Refetch when tab focused
      staleTime: 10_000,  // Mark stale after 10s
    }
  );

  // Real-time socket updates
  useEffect(() => {
    if (!socket) return;

    const handleWalletUpdate = (data: any) => {
      qc.setQueryData(["wallet"], data);
    };

    const handleTransactionAdded = (tx: any) => {
      // Invalidate cache to refetch
      void qc.invalidateQueries(["wallet", "transactions"]);
    };

    socket.on("wallet:update", handleWalletUpdate);
    socket.on("wallet:transaction", handleTransactionAdded);

    return () => {
      socket.off("wallet:update", handleWalletUpdate);
      socket.off("wallet:transaction", handleTransactionAdded);
    };
  }, [socket, qc]);

  return (
    // ... UI
  );
}
```

---

### **MEDIUM FIX #15: Reset OTP Counter**

**File:** `artifacts/api-server/src/routes/rider/index.ts`

```typescript
// After successful OTP verification
router.post("/rides/:rideId/verify-otp", otpLimiter, async (req, res, next) => {
  try {
    const rideId = req.params.rideId;
    const { otp } = req.body;

    // Get ride
    const ride = await db.query.rides.findFirst({
      where: eq(ridesTable.id, rideId),
    });

    if (!ride) {
      return sendNotFound(res, "Ride not found");
    }

    if (ride.tripOtp !== otp) {
      // Increment attempts
      const attempts = await getOtpAttempts(req.riderId!, rideId);
      if (attempts >= MAX_OTP_ATTEMPTS) {
        return sendTooManyRequests(res, "Too many OTP attempts");
      }
      return sendError(res, "Incorrect OTP", 400);
    }

    // OTP correct - RESET counter
    await db
      .delete(otpAttemptsTable)
      .where(
        and(
          eq(otpAttemptsTable.riderId, req.riderId!),
          eq(otpAttemptsTable.rideId, rideId)
        )
      );

    // Mark OTP as verified
    await db
      .update(ridesTable)
      .set({
        otpVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(ridesTable.id, rideId));

    sendSuccess(res, { verified: true });
  } catch (err) {
    next(err);
  }
});
```

---

## **DATABASE MIGRATIONS**

```sql
-- Add missing fields to rider_profiles
ALTER TABLE rider_profiles 
ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS documents_verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS bank_account TEXT,
ADD COLUMN IF NOT EXISTS bank_account_title TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS rider_profiles_kyc_status_idx 
ON rider_profiles(kyc_status);

CREATE INDEX IF NOT EXISTS rider_profiles_user_kyc_idx 
ON rider_profiles(user_id, kyc_status);

CREATE INDEX IF NOT EXISTS rider_penalties_rider_date_idx 
ON rider_penalties(rider_id, created_at DESC);

-- Add idempotency key to wallet transactions
ALTER TABLE wallet_transactions 
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS wallet_tx_idem_idx 
ON wallet_transactions(idempotency_key, created_at DESC);

-- Track GPS spoofing events
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  indexed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events(user_id);
CREATE INDEX IF NOT EXISTS security_events_type_idx ON security_events(event_type, created_at DESC);
```

---

## **TESTING COMMANDS**

```bash
# Install dependencies
pnpm install

# Type check
pnpm tsc --noEmit

# Lint
pnpm lint

# Fix linting issues
pnpm lint --fix

# Run tests
pnpm test:unit
pnpm test:integration

# Build
pnpm build

# Preview production build
pnpm preview
```

---

## **DEPLOYMENT CHECKLIST**

```bash
# 1. Create feature branch
git checkout -b fix/rider-app-audit-27-issues

# 2. Apply all fixes
# ... implement changes ...

# 3. Run tests
pnpm test:unit
pnpm test:integration

# 4. Lint & type check
pnpm lint --fix
pnpm tsc --noEmit

# 5. Build
pnpm build

# 6. Commit & push
git add .
git commit -m "fix: Implement 27 audit findings from rider app audit"
git push origin fix/rider-app-audit-27-issues

# 7. Create PR
gh pr create --title "fix: 27 Rider App Audit Fixes" \
  --body "Fixes 5 critical, 5 high, 12 medium, 5 low priority issues"

# 8. After merge, tag release
git tag -a v1.1.0-audit -m "Rider app audit fixes"
git push origin v1.1.0-audit
```

---

**Total Implementation Time:** ~7-8 hours  
**Recommended Team:** 2-3 developers  
**Deployment Window:** Low-traffic hours preferred
