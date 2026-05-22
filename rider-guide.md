# AJKMart — Rider App Complete Guide & Production Readiness Plan

## Overview

Yeh document AJKMart Rider App ke **Page Inventory**, **Backend API**, **Database Schema**,
**Admin Panel**, **Slow Network Handling**, **Socket.io**, **Auth**, **Wallet/Earnings**,
**Van Driver**, **Notifications**, **Penalties/Reviews/Chat**, **Bug Fixes**, **Performance**,
aur **E2E Verification** ke liye ek mukammal plan hai.

Har prompt ek independent kaam hai — sequentially execute karna hai.
Is plan ko implement karne ke baad rider app fully production-grade ban jati hai.

---

## 🔍 Current State — Project Structure

### Monorepo Layout

```
/
├── artifacts/
│   ├── api-server/          # Express 5 + TypeScript backend (port 5000)
│   ├── admin/               # React + Vite admin panel (port 3000)
│   ├── vendor-app/          # React + Vite vendor portal (port 3001)
│   ├── rider-app/           # React + Vite rider PWA (port 3002)  ← THIS GUIDE
│   └── ajkmart/             # Expo React Native customer app (port 3003) ← READ ONLY
├── lib/
│   ├── db/                  # Drizzle ORM schema + migrations (@workspace/db)
│   ├── i18n/                # Multi-language support (@workspace/i18n)
│   ├── auth-utils/          # Shared auth helpers (@workspace/auth-utils)
│   ├── auth-react/          # Shared React auth components (@workspace/auth-react)
│   ├── api-client-react/    # ResilientFetcher + React Query hooks (@workspace/api-client-react)
│   └── ui/                  # Shared Radix UI components (@workspace/ui)
└── package.json             # pnpm workspace root
```

### Tech Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React 19 + Vite 6 + TypeScript | React 19 |
| **Backend** | Express 5 + TypeScript | Express 5.x |
| **Database** | PostgreSQL + Drizzle ORM | Drizzle 0.30+ |
| **Native Shell** | Capacitor | v7 |
| **State** | TanStack Query (React Query) | v5 |
| **Realtime** | Socket.io | v4 |
| **Maps** | Leaflet + react-leaflet | v4 |
| **Auth Storage** | @capacitor/preferences + sessionStorage | — |
| **Push** | Firebase FCM (web) + @capacitor/push-notifications (native) | — |
| **Logging** | Pino-style createLogger wrapper | — |

### What Is Already Complete

| Area | Status |
|------|--------|
| Auth (Phone OTP, Email OTP, Username+Password, Social, Magic Link, Biometric, 2FA) | ✅ Complete |
| JWT token refresh with ResilientFetcher circuit breaker | ✅ Complete |
| CSRF token via X-CSRF-Token header (Preferences-backed) | ✅ Complete |
| Offline action queue (IndexedDB, drain on reconnect) | ✅ Complete |
| GPS queue (IndexedDB, batch drain, anti-spoof validation) | ✅ Complete |
| Adaptive polling (5 s / 7.5 s / 10 s by network tier) | ✅ Complete |
| Ride OTP verification + parcel support + event timestamps | ✅ Complete |
| Pull-to-refresh on all data pages (green accent) | ✅ Complete |
| Skeleton loaders on Home, Active, Notifications, Earnings, History | ✅ Complete |
| Socket.io GPS heartbeat every 5 s with slow-GPS mode | ✅ Complete |
| Admin fleet map live rider tracking | ✅ Complete |
| Van driver pool ride boarding module | ✅ Complete |
| Multi-step registration with document upload + XHR progress | ✅ Complete |

### What This Plan Covers

| Section | Area | Priority |
|---------|------|----------|
| PROMPT 1 | Rider App Page Inventory | 🔴 High |
| PROMPT 2 | Backend API Complete Route Map | 🔴 High |
| PROMPT 3 | Database Schema — Rider Tables | 🟡 Medium |
| PROMPT 4 | Admin Panel — Rider Management Map | 🔴 High |
| PROMPT 5 | Slow Network & Offline Resilience | 🔴 High |
| PROMPT 6 | Real-Time Socket.io Integration | 🔴 High |
| PROMPT 7 | Auth & Registration Flow | 🔴 High |
| PROMPT 8 | Wallet, Earnings & COD Flow | 🟡 Medium |
| PROMPT 9 | Van Driver Module | 🟢 Low |
| PROMPT 10 | Notifications & Push | 🟡 Medium |
| PROMPT 11 | Penalties, Reviews & Chat | 🟡 Medium |
| PROMPT 12 | Bug Fixes & Missing Wiring | 🔴 High |
| PROMPT 13 | Performance Optimization | 🟡 Medium |
| PROMPT 14 | Full E2E Verification Checklist | 🔴 High |

---

## ⚙️ Key Files & Entry Points

### Rider App

| File | Purpose |
|------|---------|
| `artifacts/rider-app/src/main.tsx` | Vite entry — `auditRiderEnv()` side-effect |
| `artifacts/rider-app/src/App.tsx` | Root router, auth guard, offline queue, QueryClient |
| `artifacts/rider-app/src/lib/api.ts` | All API methods + ResilientFetcher client (1047 lines) |
| `artifacts/rider-app/src/lib/socket.tsx` | Socket.io context + GPS heartbeat |
| `artifacts/rider-app/src/lib/rider-auth.tsx` | Rider JWT auth context |
| `artifacts/rider-app/src/lib/gpsQueue.ts` | IndexedDB GPS ping queue |
| `artifacts/rider-app/src/lib/offline/queueManager.ts` | IndexedDB action queue |
| `artifacts/rider-app/src/lib/envValidation.ts` | VITE_* env audit at startup |
| `artifacts/rider-app/src/hooks/useNetworkQuality.ts` | NetworkInformation API tier hook |

### API Server (Rider Routes)

| File | Purpose |
|------|---------|
| `artifacts/api-server/src/routes/rider/index.ts` | All rider endpoints (5,595 lines) |
| `artifacts/api-server/src/middleware/security.ts` | `requireRole("rider")`, rate limits |
| `artifacts/api-server/src/lib/socketio.ts` | `emitRiderLocation`, `emitRideOtp` |
| `artifacts/api-server/src/lib/geofence.ts` | Service zone check (`isInServiceZone`) |
| `artifacts/api-server/src/middleware/gpsSpoof.ts` | GPS anti-spoofing middleware |

---

## 📋 IMPLEMENTATION PLAN — Step by Step Prompts

---

### ═══ PROMPT 1 — Rider App Page Inventory ═══

```
Task: Audit and document all 13 rider app pages with routes, components,
      API calls, and admin controls.

Pages:

1. Home (/) — Main dashboard
   Route: /
   Components: OnlineToggleCard, StatsGrid, HomeRequestList, GoalSection,
               ActiveTaskBanner, SilenceControls, MiniMap, AcceptCountdown
   API calls:
     - GET /riders/requests  (adaptive polling: 5/7.5/10 s by network tier)
     - PATCH /riders/online  (toggle online/offline)
     - POST /riders/rides/:id/accept  (rate-limited)
     - POST /riders/orders/:id/accept (offline-queued)
     - POST /riders/rides/:id/counter (counter-bid)
     - POST /riders/rides/:id/ignore
   Socket events received: ride:assigned, rider:new_request
   Admin controls: /admin/riders (force offline), /admin/rides (cancel/reassign)

2. Active (/active) — Active trip management
   Route: /active
   Components: ActiveOrderPanel, ActiveRidePanel, MiniMap
   API calls:
     - GET /riders/active    (polled every 5 s while in progress)
     - PATCH /riders/orders/:id/status
     - PATCH /riders/rides/:id/status
     - POST /riders/rides/:id/verify-otp   (OTP brute-force limited: 5/min)
     - POST /uploads/proof   (multipart delivery proof)
   Socket events received: ride:otp, order:update
   Admin controls: /admin/rides/:id (OTP status badge, event timeline)

3. Wallet (/wallet) — Balance + transactions
   Route: /wallet
   Components: DepositModal, WithdrawModal, RemittanceModal
   API calls:
     - GET /riders/wallet/transactions (cursor pagination: limit=50)
     - GET /riders/wallet/min-balance
     - GET /riders/wallet/deposits
     - POST /riders/wallet/withdraw
     - POST /riders/wallet/deposit
     - GET /riders/cod-summary
     - POST /riders/cod/remit
   Admin controls: /admin/finance/deposits (approve/reject), /admin/riders/:id

4. Earnings (/earnings) — Earnings breakdown
   Route: /earnings
   API calls: GET /riders/earnings (today/week/month + breakdown by type)
   Admin controls: /admin/finance/transactions (rider wallet), /admin/riders/:id

5. History (/history) — Paginated job history
   Route: /history
   API calls: GET /riders/history?limit=20&offset= (infinite scroll)
   Admin controls: /admin/orders, /admin/rides

6. Profile (/profile) — Rider profile editor
   Route: /profile
   API calls:
     - GET /riders/me?appRole=rider
     - PATCH /riders/profile
     - POST /uploads/register (XHR with progress for profile photo)
     - POST /rider/kyc/request
   Admin controls: /admin/riders/:id (KYC approve/reject, ban/unban)

7. VanDriver (/van) — Pool ride / van route manager
   Route: /van
   API calls:
     - GET /van/driver/today
     - GET /van/driver/schedules/:id/passengers
     - POST /van/driver/board
   Offline queue actions: complete_trip, board_passenger
   Admin controls: /admin/rides (van routes, schedule management)

8. Chat (/chat) — Real-time chat + AI assistant
   Route: /chat
   Tabs: Chats | Requests | Search | AI
   API calls: GET /riders/chat, POST /riders/chat/message, POST /riders/ai-chat
   Socket events: admin:chat, comm:message, comm:typing

9. Notifications (/notifications) — Notification inbox
   Route: /notifications
   API calls:
     - GET /riders/notifications
     - PATCH /riders/notifications/read-all
     - PATCH /riders/notifications/:id/read
   Admin controls: /admin/broadcasts (send rider notifications)

10. PenaltyHistory (/penalty-history) — Penalty ledger
    Route: /penalty-history
    API calls: GET /riders/penalty-history
    Admin controls: /admin/riders/:id (add/remove penalty)

11. Reviews (/reviews) — Customer reviews received
    Route: /reviews
    API calls: GET /riders/reviews
    Admin controls: /admin/rides/:id (hide review)

12. SecuritySettings (/security) — 2FA + password + sessions
    Route: /security
    API calls:
      - GET /auth/2fa/setup
      - POST /auth/2fa/verify-setup
      - POST /auth/2fa/disable
      - POST /auth/set-password
    Admin controls: /admin/users/:id/sessions (revoke sessions)

13. GuestLanding (/guest) — Pre-auth landing
    Route: /guest  (unauthenticated only)

Auth Routes (unauthenticated):
- /login       — Phone OTP / Email OTP / Username+Password
- /register    — Multi-step onboarding with document upload
- /forgot-password — Phone or email reset flow

Acceptance:
- Every page renders without blank screen or console error
- BottomNav links work: / (Home), /wallet (Wallet), /earnings (Earnings), /profile (Profile)
- Deep links from push: /active (ride/order tap), /wallet (wallet tap), /chat?tab=ai (AI tap)
```

---

### ═══ PROMPT 2 — Backend API Complete Route Map ═══

```
Task: Document all rider API endpoints with auth, rate limits, and Zod schemas.

File: artifacts/api-server/src/routes/rider/index.ts (5,595 lines)
Auth middleware: requireRole("rider") — validates JWT, sets req.riderId

Rate Limiters:
| Limiter           | Window | Max | Applied To                        |
|-------------------|--------|-----|-----------------------------------|
| rideAcceptLimiter | 60 s   | 10  | POST /riders/rides/:id/accept     |
| rideBidLimiter    | 60 s   | 10  | POST /riders/rides/:id/counter    |
| rideStatusLimiter | 60 s   | 20  | PATCH /riders/rides/:id/status    |
| otpLimiter        | 60 s   | 5   | POST /riders/rides/:id/verify-otp |

Server-Side Idempotency:
- Header: X-Idempotency-Key (UUID from offline queue replay)
- TTL: 5 minutes per key
- Scope: All mutating rider endpoints
- Prevents double-accepts when network retries

Endpoint Table:
| Method | Endpoint | Zod Schema | Auth | Notes |
|--------|----------|------------|------|-------|
| GET | /riders/me | — | riderAuth | Returns profile + KYC status |
| PATCH | /riders/online | { isOnline: bool } | riderAuth | Returns serviceZoneWarning |
| PATCH | /riders/profile | profileSchema | riderAuth | vehicleRegistration alias |
| GET | /riders/requests | — | riderAuth | Envelope with serverTime |
| GET | /riders/active | — | riderAuth | Current order or ride |
| POST | /riders/orders/:id/accept | — | riderAuth + rateLimit | Offline-safe |
| POST | /riders/orders/:id/reject | { reason } | riderAuth | |
| PATCH | /riders/orders/:id/status | { status, proofPhoto? } | riderAuth | |
| POST | /riders/rides/:id/accept | — | riderAuth + rateLimit | OTP generated here |
| PATCH | /riders/rides/:id/status | { status, lat?, lng? } | riderAuth + rateLimit | |
| POST | /riders/rides/:id/verify-otp | { otp } | riderAuth + otpLimiter | |
| POST | /riders/rides/:id/counter | { counterFare, note? } | riderAuth + rateLimit | |
| POST | /riders/rides/:id/reject-offer | — | riderAuth | |
| POST | /riders/rides/:id/ignore | — | riderAuth | 90-second dismissed TTL |
| POST | /riders/rides/:id/event-log | { event, lat?, lng? } | riderAuth | GPS-tagged audit |
| GET | /riders/cancel-stats | — | riderAuth | |
| GET | /riders/ignore-stats | — | riderAuth | |
| PATCH | /riders/location | locationSchema | riderAuth + gpsSpoof | Single ping |
| POST | /riders/location/batch | { locations[] } | riderAuth | GPS queue drain |
| GET | /riders/earnings | — | riderAuth | today/week/month |
| GET | /riders/history | { limit?, offset? } | riderAuth | |
| GET | /riders/wallet/transactions | { cursor?, limit?, legacy? } | riderAuth | Cursor paged |
| GET | /riders/wallet/min-balance | — | riderAuth | |
| POST | /riders/wallet/withdraw | withdrawSchema | riderAuth | |
| POST | /riders/wallet/deposit | depositSchema | riderAuth | Rate limited |
| GET | /riders/wallet/deposits | — | riderAuth | |
| GET | /riders/cod-summary | — | riderAuth | |
| POST | /riders/cod/remit | remitSchema | riderAuth | |
| GET | /riders/notifications | — | riderAuth | |
| PATCH | /riders/notifications/read-all | — | riderAuth | |
| PATCH | /riders/notifications/:id/read | — | riderAuth | |
| GET | /riders/penalty-history | — | riderAuth | |
| GET | /riders/reviews | — | riderAuth | |
| GET | /riders/ai-chat | — | riderAuth | POST with { message, history } |
| POST | /rider/kyc/request | — | riderAuth | Triggers admin KYC queue |

GPS Anti-Spoof Middleware (gpsAntiSpoofMiddleware):
- Rejects pings with mockProvider: true
- Flags pings with speed > 200 km/h between consecutive pings
- Stores suspicious: true + suspicionReason in location_logs

Acceptance: Every endpoint returns 200 with correct shape.
            Rate-limited endpoints return 429 after threshold.
            Offline-queued actions replay correctly on reconnect.
```

---

### ═══ PROMPT 3 — Database Schema — Rider Tables ═══

```
Task: Document all 10 rider-related DB tables with columns, FK refs, and indexes.

Import: from "@workspace/db/schema"

1. rider_profiles (lib/db/src/schema/rider_profiles.ts)
   Primary key: user_id (FK → users.id CASCADE DELETE)
   Columns: vehicle_type, vehicle_plate, vehicle_reg_no, driving_license,
            vehicle_photo, documents, daily_goal (decimal 10,2),
            created_at, updated_at
   Notes: One row per rider. Populated on /auth/register with role=rider.

2. rides (lib/db/src/schema/rides.ts)
   Primary key: id (text)
   Indexes: rides_user_id_idx, rides_rider_id_idx, rides_status_idx, rides_created_at_idx
   Key columns:
     user_id       → FK users.id CASCADE DELETE (customer)
     rider_id      → FK users.id SET NULL (assigned rider)
     dispatched_rider_id → FK users.id SET NULL
     status        — searching/accepted/arrived/in_transit/completed/cancelled
     fare, distance (decimal)
     trip_otp, otp_verified
     is_parcel, receiver_name, receiver_phone, package_type
     is_scheduled, scheduled_at
     is_pool_ride, pool_group_id, stops (jsonb)
     accepted_at, arrived_at, started_at, completed_at, cancelled_at, refunded_at

3. ride_bids (lib/db/src/schema/ride_bids.ts)
   Primary key: id (text)
   FK: ride_id → rides.id CASCADE, rider_id → users.id CASCADE
   Indexes: ride_bids_ride_rider_uidx (unique on ride_id+rider_id WHERE status='pending'),
            ride_bids_ride_id_idx, ride_bids_rider_id_idx, ride_bids_status_idx
   Columns: fare (decimal), note, status (pending/accepted/rejected), expires_at

4. rider_penalties (lib/db/src/schema/rider_penalties.ts)
   Primary key: id (text)
   FK: rider_id → users.id CASCADE
   Indexes: rider_penalties_rider_id_idx, rider_penalties_type_idx, rider_penalties_created_at_idx
   Columns: type, amount (decimal), reason, created_at

5. live_locations (lib/db/src/schema/live_locations.ts)
   Primary key: user_id (FK → users.id CASCADE DELETE)
   Indexes: live_locations_role_idx, live_locations_lat_lng_idx, live_locations_role_updated_idx
   Columns: latitude, longitude (decimal 10,6), role, action,
            battery_level (real), last_seen, online_since, updated_at
   Notes: One row per online rider. Deleted by heartbeat cleanup after 5 min stale.

6. location_logs (lib/db/src/schema/location_logs.ts)
   Primary key: id (text)
   FK: user_id → users.id CASCADE
   Indexes: location_logs_user_ts_idx, location_logs_user_idx, location_logs_role_idx,
            location_logs_role_ts_idx, location_logs_lat_lng_idx
   Columns: role, latitude, longitude, accuracy, speed, heading, battery_level,
            is_spoofed (bool), created_at
   Notes: Historical GPS log for fleet analytics and spoofing audit.

7. wallet_transactions (lib/db/src/schema/wallet_transactions.ts)
   Primary key: id (text)
   FK: user_id → users.id CASCADE, receiver_id → users.id SET NULL
   Indexes: wallet_txn_user_id_idx, wallet_txn_created_at_idx, wallet_txn_reference_idx,
            idx_wallet_txn_receiver
   Constraint: wallet_txn_amount_non_negative (amount >= 0)
   Columns: type (credit/debit/withdrawal/deposit), amount (decimal), description,
            reference, payment_method, receiver_id, receiver_name, p2p_note

8. ride_ratings (lib/db/src/schema/ride_ratings.ts)
   Primary key: id (text)
   FK: ride_id → rides.id CASCADE, user_id → users.id CASCADE, rider_id → users.id CASCADE
   Indexes: ride_ratings_ride_id_uidx (unique), ride_ratings_rider_id_idx, ride_ratings_user_id_idx
   Columns: stars (int), comment, hidden (bool), deleted_at, deleted_by, created_at

9. ride_bids (already covered in #3)

10. ride_notified_riders (lib/db/src/schema/ride_notified_riders.ts)
    Records which riders were notified for each ride to prevent double-dispatch.
    FK: ride_id → rides.id CASCADE, rider_id → users.id CASCADE

Acceptance: `drizzle-kit push` runs clean (no missing columns).
            All FK constraints enforced (cascade/set-null verified).
```

---

### ═══ PROMPT 4 — Admin Panel — Rider Management Complete Map ═══

```
Task: Document all admin pages that control rider data, with permissions and API calls.

File: artifacts/api-server/src/routes/admin/rides.ts
      artifacts/api-server/src/routes/admin/fleet/ (rides.ts, zones.ts)
      artifacts/api-server/src/routes/admin/finance.ts
      artifacts/api-server/src/routes/admin/system.ts

Admin Rider Pages:

1. /admin/riders — Rider list + detail
   Permission: fleet.rides.view
   API: GET /api/admin/riders
        GET /api/admin/riders/:id
        PATCH /api/admin/riders/:id/ban
        PATCH /api/admin/riders/:id/unban
        POST /api/admin/riders/:id/penalty
        DELETE /api/admin/riders/:id/penalty/:penaltyId
   What admin can do:
     - View all riders with online status, vehicle type, earnings
     - Ban / unban rider (sets is_banned=true, revokes sessions)
     - Add manual penalty (type, amount, reason)
     - Remove penalty
     - View KYC documents (ID front/back, selfie, driving license)

2. /admin/kyc — KYC verification queue
   Permission: finance.kyc.view
   API: GET /api/admin/kyc (riders with pending_kyc status)
        PATCH /api/admin/kyc/:userId/approve
        PATCH /api/admin/kyc/:userId/reject
   What admin can do:
     - Approve KYC → rider status becomes approved, can go online
     - Reject KYC with reason → rider sees rejection message on login

3. /admin/rides — Ride management
   Permission: fleet.rides.view
   API: GET /api/admin/rides  (latest 200 rides)
        PATCH /api/admin/rides/:id/status
        GET /api/admin/rides/:id  (full detail with parcel, OTP, timeline)
   What admin can do:
     - Override ride status (cancel, complete)
     - Assign/reassign rider manually
     - View full event timeline (requested/accepted/arrived/started/completed)
     - View OTP status (Verified/Pending with code)
     - View parcel info (receiver name/phone, package type)

4. /admin/live-riders-map — Fleet map
   Permission: fleet.rides.view
   API: Socket.io admin-fleet room
        GET /api/maps/config  (tile provider + token)
        GET /api/admin/riders/locations
   What admin can do:
     - See all online riders in real-time (updates every 5 s)
     - Click rider to see: name, vehicle, status, active trip ID
     - History playback: scrub through GPS route for any rider (date picker)
     - Riders with active trip show pulsing red rings
     - Labels toggle: show/hide username pills above markers
     - Offline riders (>5 min stale) auto-removed from map

5. /admin/finance/deposits — Deposit approval
   Permission: finance.deposits.review
   API: GET /api/admin/deposits
        PATCH /api/admin/deposits/:id/verify
        PATCH /api/admin/deposits/:id/reject
   What admin can do:
     - Approve deposit → credits rider wallet + creates wallet_transaction
     - Reject with reason → rider notified

6. /admin/finance/withdrawals — Withdrawal processing
   Permission: finance.withdrawals.view
   API: GET /api/admin/withdrawals
        PATCH /api/admin/withdrawals/:id/process
   What admin can do:
     - Mark withdrawal as processed (bank transfer confirmed)

7. /admin/finance/transactions — Rider wallet audit
   Permission: finance.transactions.view
   API: GET /api/admin/transactions?userId=
   What admin can do:
     - View all wallet transactions for a rider
     - Filter by type (credit/debit/withdrawal/deposit)

Acceptance:
  - Every admin rider page loads without blank screen
  - KYC approve/reject changes rider approvalStatus in DB
  - Penalty add shows in rider's /penalty-history immediately
  - Live map shows rider going offline after 5 min heartbeat timeout
```

---

### ═══ PROMPT 5 — Slow Network & Offline Resilience ═══

```
Task: Verify and document all slow-network + offline handling systems.

Files:
  artifacts/rider-app/src/lib/gpsQueue.ts
  artifacts/rider-app/src/lib/offline/queueManager.ts
  artifacts/rider-app/src/hooks/useNetworkQuality.ts
  artifacts/rider-app/src/lib/api.ts
  artifacts/rider-app/src/lib/socket.tsx
  artifacts/rider-app/src/App.tsx

1. Network Quality Adaptive Polling (useNetworkQuality.ts)
   Uses navigator.connection (NetworkInformation API):
   | effectiveType | tier   | polling interval |
   |---------------|--------|-----------------|
   | slow-2g / 2g  | slow   | 10,000 ms       |
   | 3g            | medium | 7,500 ms        |
   | 4g            | fast   | 5,000 ms        |

   Used in: Home.tsx (getRequests polling interval adapts to tier)

2. GPS Queue (gpsQueue.ts — IndexedDB store: ajkmart_gps_queue)
   Store: "pings" (keyPath: id, index: timestamp)
   Max size: 500 pings (setGpsQueueMax — updated from platform_settings)
   Dismissed TTL: 90 s (setDismissedRequestTtlSec)
   Validation: validateGpsPing() — rejects speed > 200 km/h or mock GPS
   Drain: batchDrainGpsQueue() → POST /riders/location/batch
   Trigger: socket reconnect, window online event

3. Offline Action Queue (queueManager.ts — IndexedDB: ajkmart_action_queue)
   Stores: accept_order, accept_ride, update_order, update_ride,
           complete_trip, board_passenger
   Dead-letter store: v2 — actions that fail after MAX_RETRIES moved here
   Drain (syncQueue): called on socket connect and window online event
   Idempotency: each replayed action sends X-Idempotency-Key header (5-min TTL)

4. API Client (api.ts — ResilientFetcher)
   Circuit breaker: failureThreshold=3, cooldownMs=30,000
   Request timeout: 30,000 ms (setApiTimeoutMs to override)
   Retry: global retry=1 (App.tsx QueryClient defaultOptions)
   networkMode: "offlineFirst" — queries use cache while offline
   Token refresh: mutex-guarded single in-flight refresh promise

5. React Query Retry Config (per-query overrides)
   All non-critical queries: retry=1 (global default)
   Critical slow-network queries with exponential backoff:
     - Earnings: retry=2, retryDelay=(attempt) => min(1000 * 2^attempt, 30_000)
     - Reviews: retry=2, retryDelay=(attempt) => min(1000 * 2^attempt, 30_000)
     - PenaltyHistory: retry=2, retryDelay=(attempt) => min(1000 * 2^attempt, 30_000)

6. Skeleton Loaders (pages with isLoading states)
   | Page | Skeleton Component |
   |------|--------------------|
   | Home | <SkeletonHome /> |
   | Active | <SkeletonActive /> |
   | Notifications | <SkeletonNotifications /> |
   | Earnings | pulse divs (inline) |
   | History | pulse divs (inline) |
   | Reviews | pulse divs (inline) |
   | PenaltyHistory | pulse divs (inline) |
   | Wallet | pulse divs (inline) |

7. Offline Visual Feedback
   - App.tsx: window offline event → offlineHint state → yellow banner shown
   - Active.tsx: AbortController per-request; "You're offline — queued for retry" toast
   - Home.tsx: network tier shown as icon (Wifi for fast, AlertTriangle for slow)

8. Splash Timeout (App.tsx)
   SPLASH_DEADLINE_MS = 15,000 ms
   If loading=true after 15 s → splashTimedOut=true → shows retry CTA button

Acceptance:
  - Disable network → accept a ride → action queued → re-enable → verify replay
  - GPS queue drains correctly after network restore (batch endpoint receives pings)
  - Slow network simulation (Chrome DevTools: Slow 3G) → polling switches to 7500ms
  - Splash retry button appears within 15 s on mock slow load
```

---

### ═══ PROMPT 6 — Real-Time Socket.io Integration ═══

```
Task: Document all Socket.io events, rooms, and reconnection behavior.

File: artifacts/rider-app/src/lib/socket.tsx (SocketProvider)
      artifacts/api-server/src/lib/socketio.ts

Connection Setup:
  Origin: VITE_API_BASE_URL (Capacitor) or window.location.origin (web)
  Path: /api/socket.io
  Auth: { token: accessToken } — resent on every reconnect
  Options:
    transports: ["websocket", "polling"]
    reconnectionDelay: 2,000 ms
    reconnectionDelayMax: 30,000 ms
    reconnectionAttempts: 20
    withCredentials: true  (HttpOnly refresh cookie on polling)

On connect:  syncQueue() — drains offline action queue
On disconnect: setConnected(false) — pages show stale-data UX
On token refresh: socket is destroyed and recreated with new token

GPS Heartbeat (socket.tsx):
  Interval: dynamic from platform_settings (default 5 s)
  Slow-GPS mode: Active.tsx calls setSlowGps(true) on low battery (<20%)
  Position: fed by watchPosition callbacks in Home.tsx / Active.tsx via setRiderPosition()
  Emits: rider:location { lat, lng, batteryLevel, vehicleType, tripId?, action? }
  Min distance: 25 m (haversine) — prevents duplicate sends when stationary

Server Rooms:
  rider:{userId}     — personal notifications, OTP, ride assignments
  ride:{rideId}      — ride updates visible to customer + rider + admin
  admin-fleet        — all rider:location events broadcast here

Incoming Events (rider client listens):
  | Event              | Emitted By Server | Action in Client |
  |--------------------|-------------------|-----------------|
  | ride:assigned      | broadcastRide()   | Show request card + sound |
  | rider:new_request  | order dispatch    | Show order card + sound |
  | ride:otp           | emitRideOtp()     | Display OTP in Active.tsx |
  | order:update       | order status change | Refresh active task |
  | admin:chat         | admin chat send   | Append message in Chat.tsx |
  | comm:message       | platform message  | Chat.tsx incoming |
  | comm:typing        | admin typing      | Typing indicator in Chat |
  | call:incoming      | voice call init   | Incoming call modal |
  | call:signal        | WebRTC signal     | SDP/ICE exchange |

Outgoing Events (rider client emits):
  | Event          | Emitted From     | Payload |
  |----------------|------------------|---------|
  | rider:location | socket heartbeat | { lat, lng, batteryLevel, slowGps } |
  | rider:typing   | Chat.tsx         | { isTyping: bool } |
  | call:signal    | Chat.tsx         | WebRTC SDP/ICE |

Ghost Rider Cleanup (server-side, socketio.ts):
  Interval: every 5 minutes
  Action: Query live_locations WHERE updated_at < NOW() - 5min
          → emit rider:offline to admin-fleet for each stale rider
          → set users.is_online = false
          → delete stale live_locations rows

Acceptance:
  - Rider accepts ride → customer receives notification within 2 s
  - Admin fleet map updates rider position within 5 s
  - Socket reconnects after 2 s on network drop (verify in DevTools Network tab)
  - Ghost rider removed from admin map within 5 min of going offline
  - OTP emitted to rider socket immediately on accept
```

---

### ═══ PROMPT 7 — Auth & Registration Flow ═══

```
Task: Document complete auth flow, registration wizard, and security settings.

Files:
  artifacts/rider-app/src/pages/Login.tsx
  artifacts/rider-app/src/pages/Register.tsx
  artifacts/rider-app/src/pages/ForgotPassword.tsx
  artifacts/rider-app/src/pages/SecuritySettings.tsx
  artifacts/rider-app/src/lib/rider-auth.tsx
  artifacts/rider-app/src/lib/api.ts (auth methods)
  artifacts/rider-app/src/lib/biometric.ts

1. Login Flow (/login)
   Login methods (all route to role=rider):
   a) Phone OTP: sendOtp(phone) → verifyOtp(phone, otp, role:"rider")
   b) Email OTP: sendEmailOtp(email) → verifyEmailOtp(email, otp, role:"rider")
   c) Username+Password: loginUsername(identifier, password, role:"rider")
   d) Google OAuth: socialGoogle({ idToken, role:"rider" })
   e) Facebook OAuth: socialFacebook({ accessToken, role:"rider" })
   f) Magic Link: sendMagicLink(email) → /auth/magic-link/verify (deep link)
   g) Biometric: loadBiometricCreds() → loginUsername with stored credentials

   On success: storeTokens(accessToken, refreshToken) → storeCsrfToken() → navigate("/")
   2FA pending: verifyTotpCode(code, phone) or twoFactorRecovery(backupCode)

2. Registration Wizard (/register)
   Steps:
   Step 1 — Phone Verify: sendOtp(phone) → verifyOtp → phone stored
   Step 2 — Personal Details: name, CNIC, username, password (strength meter)
   Step 3 — Vehicle Info: vehicleType, vehiclePlate, vehicleRegistration, drivingLicense
   Step 4 — Documents: vehicle photo, DL photo, ID front/back
             Upload: uploadRegistrationDocWithProgress(file, token, onProgress)
             Progress bar via XHR upload events (0–100%)
             Token: getRegistrationUploadToken() (single-use, auto-refreshed on 401/403)
   Step 5 — Success: registerRider(data) or emailRegisterRider(data) → account created
             Status: pending KYC approval
             Rider sees: "Account created — awaiting admin review"

3. Token Storage
   Access token: @capacitor/preferences (key: ajkmart_rider_token)
   Refresh token: in-memory (localSet/localGet)
   CSRF token: @capacitor/preferences (key: ajkmart_rider_csrf_token)
   Cold-start guard: tokenStoreReady promise — all requests wait for Preferences.get()

4. Token Refresh
   Trigger: 401 response from any endpoint
   Mutex: all concurrent refresh callers share one in-flight promise
   Endpoint: POST /auth/refresh
   On failure (non-transient): triggerLogout("session_expired")

5. Forced Logout (403 auth denial)
   Codes that trigger logout: AUTH_REQUIRED, ROLE_DENIED, TOKEN_INVALID,
                              TOKEN_EXPIRED, ACCOUNT_BANNED
   Phrases: "access denied", "forbidden", "unauthorized", etc.
   Does NOT trigger logout: APPROVAL_PENDING, APPROVAL_REJECTED (business codes)

6. Biometric Auth (biometric.ts — Capacitor native only)
   Storage: @capacitor/preferences (ajkmart_rider_biometric_creds)
   Enrolls: after successful password login, stores encrypted credentials
   On resume: loadBiometricCreds() → biometric prompt → loginUsername

7. SecuritySettings (/security)
   Sections:
   a) 2FA Setup: twoFactorSetup() → QR + secret → twoFactorEnable(code)
   b) 2FA Disable: twoFactorDisable(code)
   c) Backup codes shown after setup (one-time display)
   d) Password Change: POST /auth/set-password { currentPassword, password }
      Strength meter: weak/fair/good/strong (regex checks)

8. ForgotPassword (/forgot-password)
   Phone: forgotPassword({ method:"phone", phone }) → verifyOtp → resetPassword
   Email: forgotPassword({ method:"email", email }) → verifyEmailOtp → resetPassword
   resetPassword({ phone?, email?, otp, newPassword, totpCode? })

Acceptance:
  - Phone OTP login succeeds with correct OTP
  - Registration wizard completes 5 steps with photo upload showing progress bar
  - Biometric enrolls after first password login (native only)
  - 2FA setup shows scannable QR code, backup codes displayed once
  - Token refresh happens silently (no UI flicker)
  - ACCOUNT_BANNED code shows error, not blank screen
```

---

### ═══ PROMPT 8 — Wallet, Earnings & COD Flow ═══

```
Task: Document complete wallet, earnings, and COD remittance flows.

Files:
  artifacts/rider-app/src/pages/Wallet.tsx
  artifacts/rider-app/src/pages/Earnings.tsx
  artifacts/rider-app/src/components/wallet/DepositModal.tsx
  artifacts/rider-app/src/components/wallet/WithdrawModal.tsx
  artifacts/rider-app/src/components/wallet/RemittanceModal.tsx

1. Wallet Page (/wallet)
   Data:
     - Balance: from getWalletPage() response.balance
     - Transactions: cursor-paginated (limit=50, nextCursor for next page)
     - Deposits: getDeposits() → list with status badges (pending/verified/rejected)
     - COD summary: getCodSummary() → collected cash + pending remittance
     - Min balance: getMinBalance() → warning if balance < threshold

   Deposit flow (DepositModal):
     submitDeposit({ amount, paymentMethod, transactionId, accountNumber?, note? })
     Payment methods: EasyPaisa / JazzCash / Bank Transfer
     Pending admin verification → status shows "Pending"

   Withdrawal flow (WithdrawModal):
     withdrawWallet({ amount, bankName, accountNumber, accountTitle, paymentMethod?, note? })
     Validates: amount > 0, amount <= balance, amount >= minBalance limit

   COD Remittance flow (RemittanceModal):
     submitCodRemittance({ amount, paymentMethod, accountNumber, transactionId?, note? })
     Triggers when rider has collected cash-on-delivery orders
     Admin processes + clears COD balance

2. Earnings Page (/earnings)
   Tabs: Today | This Week | This Month
   Data per tab: { earnings, deliveries, breakdown: { food, parcel, rides } }
   Daily goal: personalDailyGoal (from rider profile) or adminDailyGoal (from platform_settings)
   Goal edit: updateProfile({ dailyGoal }) → PATCH /riders/profile
   Progress bar: todayEarnings / dailyGoal * 100
   Career stats from user.stats: totalDeliveries, totalEarnings, rating

3. Rider Earnings Calculation (server-side, admin/rides.ts)
   On ride completion:
     riderEarning = fare × (rider_keep_pct / 100)
     Default rider_keep_pct: 80% (from platform_settings)
     Transaction: credit to rider wallet + wallet_transaction row

4. Query config (slow-network resilience):
   Earnings: staleTime=30s, retry=2, retryDelay=exponential
   Wallet: staleTime=30s, refetchInterval=off
   Deposits: staleTime=60s

Acceptance:
  - Deposit form submits correctly, status shows "Pending"
  - Withdrawal form validates balance, shows error if insufficient
  - Earnings tab switches update breakdown immediately (no refetch needed)
  - Daily goal progress bar animates correctly
  - COD summary shows non-zero amount when rider has COD orders
```

---

### ═══ PROMPT 9 — Van Driver Module ═══

```
Task: Document the VanDriver page for pool ride / van route management.

File: artifacts/rider-app/src/pages/VanDriver.tsx
      artifacts/api-server/src/routes/van/ (driver endpoints)

1. Van Driver Page (/van)
   Visible to: riders with vehicleType=van or bus
   Tabs: Today's Schedules → Passengers for selected schedule → Live map

2. Schedule view
   API: GET /van/driver/today → VanSchedule[]
   Each schedule: routeName, routeFrom, routeTo, departureTime, returnTime,
                  totalSeats, bookedCount, bookedSeats[], date, vanCode

3. Passenger view
   API: GET /van/driver/schedules/:id/passengers → Passenger[]
   Each passenger: seatNumbers, seatTiers (window/aisle/economy),
                   status (booked/boarded/cancelled),
                   passengerName, passengerPhone, paymentMethod, fare

4. Boarding action
   API: POST /van/driver/board { scheduleId, seatNumber, passengerId }
   Offline-queued as: board_passenger action in queueManager
   On success: passenger.boardedAt set, status → boarded

5. Complete trip
   API: PATCH /van/driver/schedules/:id/complete
   Offline-queued as: complete_trip action in queueManager
   Admin notified via push notification

6. Live map
   Uses react-leaflet MapContainer
   Shows rider's current GPS position (watchPosition)
   Route polyline from routeFrom → routeTo coordinates

Acceptance:
  - Today's schedules load within 3 s on 4G
  - Boarding a passenger updates seat count in real-time
  - Offline board action queues and replays on reconnect
  - Map updates rider position as watchPosition fires
```

---

### ═══ PROMPT 10 — Notifications & Push ═══

```
Task: Document notification inbox, FCM push, and tap routing.

Files:
  artifacts/rider-app/src/pages/Notifications.tsx
  artifacts/rider-app/src/lib/push.ts
  artifacts/rider-app/src/lib/firebase.ts
  artifacts/api-server/src/lib/webpush.ts

1. Notification Inbox (/notifications)
   API: GET /riders/notifications → { notifications[] }
   Each: id, title, body, type, data, isRead, createdAt
   Actions:
     - PATCH /riders/notifications/read-all (markAllRead)
     - PATCH /riders/notifications/:id/read (markOneRead)
   Skeleton loader on isLoading
   Pull-to-refresh: invalidates ["rider-notifications"] query

2. FCM Push (web — firebase.ts + push.ts)
   Init: Firebase app with VITE_FIREBASE_* env vars
   Token registration: POST /api/riders/push-token { fcmToken, platform:"web" }
   Permission: Notification.requestPermission() called once per session
   Foreground: onMessage handler → custom toast shown for 4 s
   Background: service worker handles → tap opens app

3. Native Push (@capacitor/push-notifications)
   Registration: PushNotifications.register() → token sent to server
   Foreground: PushNotifications.addListener("pushNotificationReceived") → custom toast
   Tap: PushNotifications.addListener("pushNotificationActionPerformed") → navigate

4. Notification Tap Routing (App.tsx registerPush callback)
   | type                              | Route |
   |-----------------------------------|-------|
   | ride_request / new_ride           | /active |
   | order_request / new_order         | /active |
   | wallet_credit / wallet_debit      | /wallet |
   | chat / support / admin_message    | /chat |
   | ai_response                       | /chat?tab=ai |
   | penalty / review                  | /penalty-history or /reviews |

5. Admin Broadcast
   Admin: /admin/broadcasts → POST /api/admin/notifications/broadcast
   Sends to: all online riders, specific rider, all riders in zone

6. Unread Count
   BottomNav: badge on notification tab icon
   Source: data?.notifications?.filter(n => !n.isRead).length

Acceptance:
  - Push permission requested once per session (not on every login)
  - FCM token registered after permission granted
  - Tap on ride notification → navigates to /active
  - Tap on wallet notification → navigates to /wallet
  - Inbox marks all as read → badge clears immediately
```

---

### ═══ PROMPT 11 — Penalties, Reviews & Chat ═══

```
Task: Document penalty history, rider reviews, and chat/AI pages.

Files:
  artifacts/rider-app/src/pages/PenaltyHistory.tsx
  artifacts/rider-app/src/pages/Reviews.tsx
  artifacts/rider-app/src/pages/Chat.tsx

1. PenaltyHistory (/penalty-history)
   API: GET /riders/penalty-history → { penalties[], total_deducted }
   Each penalty: id, type, amount, reason, createdAt
   Types: cancellation, late_delivery, customer_complaint, misconduct
   Total deducted: sum of all penalty amounts (shown in header)
   Slow-network: staleTime=60s, retry=2, retryDelay=exponential
   Admin: /admin/riders/:id → add/remove penalty → rider sees immediately

2. Reviews (/reviews)
   API: GET /riders/reviews → { reviews[], avgRating, total }
   Each review: rideId, stars (1-5), comment, createdAt
   Displayed: star count, comment text, formatted date (Asia/Karachi timezone)
   avgRating: shown as X.X / 5.0 in header
   Slow-network: staleTime=60s, retry=2, retryDelay=exponential
   Admin: /admin/rides/:id → hide review (sets hidden=true in ride_ratings)

3. Chat (/chat)
   Tabs: Chats | Requests | Search | AI
   
   Chats tab:
     API: GET /riders/chat/conversations
     Socket: comm:message → append to conversation
             comm:typing → show typing indicator
     Send: POST /riders/chat/message { conversationId, content }
   
   Requests tab:
     Incoming communication requests from other users
     Accept/decline → updates conversation list
   
   Search tab:
     Search by AJK-ID: POST /api/comm/search { ajkId }
     Start conversation: POST /api/comm/conversations
   
   AI tab:
     Opened by: ?tab=ai query param OR setAiTabActive() from push.ts
     API: POST /riders/ai-chat { message, history[] }
     History: maintained in aiMessages state (role: user|assistant)
     Streaming: not implemented — single response per request
   
   Voice call (WebRTC):
     Incoming: comm:call:incoming → IncomingCallModal shown
     Signal: comm:call:signal → SDP/ICE exchange
     Mute/end: local stream management

   Socket events in Chat:
     Listens: admin:chat, comm:message, comm:typing, comm:call:incoming, comm:call:signal
     Emits: rider:typing { isTyping }, comm:call:signal (WebRTC SDP)

Acceptance:
  - Penalty list loads and shows correct total
  - Reviews show star rating and comment correctly
  - Chat sends message and receives admin reply within 2 s
  - AI chat returns response, added to history
  - ?tab=ai URL param opens AI tab directly (push notification tap)
```

---

### ═══ PROMPT 12 — Bug Fixes & Missing Wiring ═══

```
Task: Apply all fixes found during Phase 0 audit. Each fix is a discrete change.

Files modified in this audit:

FIX-01: Wallet.tsx — Typed deposit list (DONE)
  File: artifacts/rider-app/src/pages/Wallet.tsx
  Problem: any[] + (dep: any) on deposit list
  Fix: Added DepositItem interface { id, status, method?, createdAt, note?, amount }
       Replaced any[] → DepositItem[] in both cast sites
  Verification: pnpm tsc --noEmit → 0 errors

FIX-02: Earnings.tsx — Add staleTime + exponential retry (DONE)
  File: artifacts/rider-app/src/pages/Earnings.tsx
  Problem: useQuery had no staleTime; on 3G, stale renders caused excessive refetches
  Fix: staleTime: 30_000, retry: 2, retryDelay: (attempt) => min(1000 * 2^attempt, 30_000)
  Verification: Network tab shows backoff (1s → 2s → 4s) on simulated failures

FIX-03: Reviews.tsx — Add exponential retry (DONE)
  File: artifacts/rider-app/src/pages/Reviews.tsx
  Problem: No retry config — single failure shows error screen on slow network
  Fix: retry: 2, retryDelay: (attempt) => min(1000 * 2^attempt, 30_000)
  Verification: Throttle network → query retries twice before showing error

FIX-04: PenaltyHistory.tsx — Add staleTime + exponential retry (DONE)
  File: artifacts/rider-app/src/pages/PenaltyHistory.tsx
  Problem: No staleTime (always refetches) + no retry config
  Fix: staleTime: 60_000, retry: 2, retryDelay: (attempt) => min(1000 * 2^attempt, 30_000)
  Verification: Second visit within 60 s uses cache; slow network retries twice

Items verified as ALREADY CORRECT (no fix needed):
  - Global QueryClient: retry=1, networkMode="offlineFirst" — correct baseline
  - Home.tsx useQuery: staleTime=60s on both getRequests and getActive
  - Wallet.tsx: staleTime=30s on wallet, 60s on COD summary
  - Profile.tsx: staleTime=30s on notifications, 5min on cities
  - Reviews.tsx: staleTime=60_000 was present — added retry on top
  - Offline action queue: idempotency keys implemented (no fix needed)
  - GPS queue: batch drain implemented (no fix needed)
  - Socket reconnect: 2s delay, 30s max, 20 attempts (no fix needed)
  - CSRF token: Preferences-backed + X-CSRF-Token header (no fix needed)
  - apiFetch 403 auth-denial guard: implemented (no fix needed)

TypeScript verification:
  cd artifacts/rider-app && pnpm tsc --noEmit → 0 errors (confirmed after all fixes)

Acceptance:
  - pnpm tsc --noEmit runs clean in rider-app workspace
  - Earnings page does not flicker-refetch on tab switch within 30 s
  - PenaltyHistory shows cached data on revisit within 60 s
  - Wallet deposit list renders without TypeScript errors
```

---

### ═══ PROMPT 13 — Performance Optimization ═══

```
Task: Verify and document all performance optimizations in the rider app.

1. React Query Stale Time Inventory
   | Page | Query Key | staleTime | refetchInterval |
   |------|-----------|-----------|-----------------|
   | Home (requests) | rider-requests | 60,000 | adaptive (5/7.5/10 s) |
   | Home (active) | rider-active | 60,000 | adaptive |
   | Profile (notifications) | rider-notif-settings | 30,000 | off |
   | Profile (cities) | popular-cities | 300,000 | off |
   | Wallet | rider-wallet | 30,000 | off |
   | Wallet (COD) | rider-cod-summary | 60,000 | off |
   | Earnings | rider-earnings | 30,000 | 60,000 |
   | Reviews | rider-my-reviews-full | 60,000 | off |
   | PenaltyHistory | rider-penalty-history | 60,000 | off |

2. Code Splitting (Vite)
   Vite default: each route is lazily imported via React.lazy (verify each page import in App.tsx)
   Verify: No page is eagerly imported at bundle root
   Tool: ANALYZE=1 pnpm build → bundle-stats.html (rollup-plugin-visualizer)

3. GPS Ping Deduplication
   Min distance: 25 m (haversine check in gpsQueue.ts before enqueue)
   Result: No duplicate pings when rider is stationary
   Verify: Open GPS queue in DevTools IndexedDB → confirm no back-to-back identical lat/lng

4. Socket Reconnect Backoff
   reconnectionDelay: 2,000 → 4,000 → 8,000 → ... → 30,000 ms (capped)
   reconnectionAttempts: 20 (then no retry — user must reload)
   Result: No rapid reconnect storms on poor network

5. Image Lazy Loading
   Profile photo: <img loading="lazy"> on request card thumbnails
   Delivery proof: loaded only when order status = delivered
   Verify: Network tab shows images load on scroll/interaction, not eagerly

6. Bundle Size Check
   Command: cd artifacts/rider-app && ANALYZE=1 pnpm build
   Target: main bundle < 500 KB gzipped
   Key dependencies that inflate bundle:
     - leaflet + react-leaflet: ~130 KB — only loaded on pages with maps (MiniMap, VanDriver)
     - socket.io-client: ~80 KB
     - firebase: ~180 KB — conditional on VITE_FIREBASE_API_KEY

7. XHR Upload Progress
   uploadRegistrationDocWithProgress: uses XMLHttpRequest (not fetch)
   Progress events fire per byte — no fake progress bar
   Verify: Network tab shows chunked upload progress in registration Step 4

Acceptance:
  - Bundle stats show no page > 500 KB gzipped
  - Leaflet only loaded on /van and Home pages (MiniMap)
  - GPS queue has no duplicate entries after stationary 60 s period
  - Socket reconnect shows exponential delay in browser DevTools
```

---

### ═══ PROMPT 14 — Full E2E Verification Checklist ═══

```
Task: Run through every critical rider flow end-to-end and verify each works.

Environment needed:
  - API server running on port 5000
  - Rider app running on port 3002
  - Admin panel running on port 3000
  - Test rider account (pending approval or approved)
  - Test customer account (for ride booking)

AUTH CHECKS:
  [ ] Phone OTP login: enter test phone → receive OTP → verify → lands on /
  [ ] Username+Password login: enter credentials → lands on /
  [ ] Registration: complete all 5 steps → account created → status shows pending
  [ ] Forgot password: phone method → OTP → reset → login with new password
  [ ] 2FA setup: enable → scan QR → enter code → verified → backup codes shown
  [ ] Token refresh: manually expire token (DevTools) → verify silent refresh
  [ ] Force logout: ACCOUNT_BANNED 403 → redirected to /login with message
  [ ] Splash timeout: block network → retry button appears within 15 s

HOME CHECKS:
  [ ] Online toggle: click → verify is_online=true in DB
  [ ] Service zone warning: go online outside zone → toast shown
  [ ] New ride request: customer books ride → card appears within polling interval
  [ ] 30-second countdown: accept countdown timer counts down correctly
  [ ] Sound: new request triggers notification sound (unlock audio first)
  [ ] Silence mode: toggle → no sound on new request
  [ ] Dismiss request: card disappears, stays dismissed for 90 s
  [ ] Counter-bid: enter custom fare + note → submitted to server
  [ ] Adaptive polling: throttle DevTools to 3G → confirm polling slows to 7.5 s

ACTIVE TRIP CHECKS:
  [ ] Accept delivery order → status changes to accepted
  [ ] Mark picked_up → delivered → proof photo uploaded
  [ ] Accept ride → arrived → OTP modal appears
  [ ] Enter correct OTP → in_transit status unlocked
  [ ] Complete ride → completed status, earnings credited
  [ ] Offline: disable network → update status → re-enable → verify replay
  [ ] Parcel ride: receiver name/phone/package type shown correctly
  [ ] Event timeline: verify arrivedAt / startedAt / completedAt timestamps set

WALLET CHECKS:
  [ ] Balance displays correctly
  [ ] Transaction list loads with cursor pagination (scroll to next page)
  [ ] Deposit form: submit EasyPaisa deposit → status shows Pending
  [ ] Admin approves deposit → balance increases → transaction appears
  [ ] Withdrawal form: enter amount, bank details → submitted
  [ ] Min balance: attempt withdraw below min → error shown
  [ ] COD remittance: submit → COD summary clears

EARNINGS CHECKS:
  [ ] Today / Week / Month tabs switch correctly
  [ ] Breakdown shows food / parcel / rides breakdown per period
  [ ] Daily goal: set via pencil icon → progress bar updates
  [ ] staleTime: switch tabs within 30 s → no network refetch (confirm in Network tab)

HISTORY CHECKS:
  [ ] First page loads 20 items
  [ ] "Load More" loads next 20 (infinite scroll)
  [ ] Delivery proof thumbnail visible for delivered orders
  [ ] Distance / duration shown for completed rides

PROFILE CHECKS:
  [ ] Edit name → saved via PATCH /riders/profile
  [ ] Profile photo upload shows progress bar (0–100%)
  [ ] KYC status badge shows correct state (pending/approved/rejected)
  [ ] "Request Review" button triggers POST /rider/kyc/request

ADMIN CHECKS:
  [ ] /admin/riders → rider list loads
  [ ] Click rider → detail opens → KYC documents visible
  [ ] Approve KYC → rider can now go online
  [ ] Add penalty → shows in rider's /penalty-history
  [ ] /admin/live-riders-map → rider position updates within 5 s
  [ ] /admin/rides → open active ride → OTP status + timeline visible
  [ ] /admin/finance/deposits → pending deposit visible → approve it

OFFLINE CHECKS:
  [ ] Disable network → attempt ride accept → queued in IndexedDB
  [ ] Open DevTools Application → ajkmart_action_queue → verify entry
  [ ] Re-enable network → socket reconnects → syncQueue() fires → action replayed
  [ ] GPS queue: enable network back → batch location sent to /riders/location/batch

PUSH NOTIFICATION CHECKS:
  [ ] Permission prompt appears on first load (not on subsequent loads)
  [ ] FCM token registered in DB (check /api/admin/riders/:id push tokens)
  [ ] Tap ride notification → /active
  [ ] Tap wallet notification → /wallet
  [ ] Tap chat notification → /chat?tab=ai

SLOW NETWORK CHECKS:
  [ ] Chrome DevTools: Slow 3G → polling interval switches to 7,500 ms
  [ ] Earnings query: fail network → retry 1 s → 2 s → 4 s → error state shown
  [ ] Skeleton loader visible during slow load (not blank screen)
  [ ] Offline banner appears immediately when network goes down
  [ ] Active page: status update queued offline, toast shows "queued for retry"

SOCKET CHECKS:
  [ ] rider:location emitted every 5 s (Network tab WebSocket frames)
  [ ] ride:otp received after accept → OTP shown in Active.tsx modal
  [ ] Socket reconnects after DevTools offline→online toggle
  [ ] admin:chat received → appears in Chat.tsx without page refresh

Acceptance: All checklist items pass with no console errors and no blank screens.
```

---

## 📎 Appendices

### Rider App Route Registry

| Route | Page | Auth Required | BottomNav |
|-------|------|--------------|-----------|
| `/` | Home.tsx | ✅ | 🏠 Home |
| `/active` | Active.tsx | ✅ | — |
| `/wallet` | Wallet.tsx | ✅ | 💰 Wallet |
| `/earnings` | Earnings.tsx | ✅ | 📊 (Profile nav) |
| `/history` | History.tsx | ✅ | — |
| `/profile` | Profile.tsx | ✅ | 👤 Profile |
| `/van` | VanDriver.tsx | ✅ | — |
| `/chat` | Chat.tsx | ✅ | — |
| `/notifications` | Notifications.tsx | ✅ | — |
| `/penalty-history` | PenaltyHistory.tsx | ✅ | — |
| `/reviews` | Reviews.tsx | ✅ | — |
| `/security` | SecuritySettings.tsx | ✅ | — |
| `/guest` | GuestLanding.tsx | ❌ | — |
| `/login` | Login.tsx | ❌ | — |
| `/register` | Register.tsx | ❌ | — |
| `/forgot-password` | ForgotPassword.tsx | ❌ | — |

---

### Admin Panel — Rider Route Registry

| Admin Route | Permission | Controls |
|-------------|-----------|---------|
| `/admin/riders` | `fleet.rides.view` | Rider list, ban/unban, detail view |
| `/admin/kyc` | `finance.kyc.view` | KYC approve/reject |
| `/admin/rides` | `fleet.rides.view` | Ride management, OTP, timeline |
| `/admin/live-riders-map` | `fleet.rides.view` | Real-time fleet map + history playback |
| `/admin/finance/deposits` | `finance.deposits.review` | Deposit approval |
| `/admin/finance/withdrawals` | `finance.withdrawals.view` | Withdrawal processing |
| `/admin/finance/transactions` | `finance.transactions.view` | Wallet audit |
| `/admin/broadcasts` | `support.broadcast.send` | Push to all riders |
| `/admin/settings` | `system.settings.view` | rider_keep_pct, GPS intervals, platform |

---

### Environment Variables — Rider App

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | ✅ | Vite dev server port |
| `BASE_PATH` | ✅ | Vite base path |
| `VITE_API_BASE_URL` | Capacitor only | Absolute API base for native builds |
| `VITE_API_PROXY_TARGET` | Dev only | Proxy target port (default: 5000) |
| `VITE_CAPACITOR` | Optional | `"true"` for native Capacitor build |
| `VITE_FIREBASE_API_KEY` | Optional | Enables FCM push notifications |
| `VITE_FIREBASE_AUTH_DOMAIN` | Optional | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Optional | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Optional | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Optional | Firebase sender ID |
| `VITE_FIREBASE_APP_ID` | Optional | Firebase app ID |

---

### Security Notes

| Area | Implementation | File |
|------|---------------|------|
| JWT auth | requireRole("rider") middleware | middleware/security.ts |
| CSRF protection | X-CSRF-Token header on all mutations | lib/api.ts |
| CSRF storage | @capacitor/preferences (not localStorage) | lib/api.ts |
| Token refresh | Mutex-guarded single in-flight promise | api-client-react |
| GPS spoofing | gpsAntiSpoofMiddleware + validateGpsPing() | gpsSpoof.ts + gps/validation.ts |
| OTP brute force | 5 attempts/min per rider (otpLimiter) | rider/index.ts |
| Ride accept spam | 10 accepts/min per rider (rideAcceptLimiter) | rider/index.ts |
| Offline replay | X-Idempotency-Key (5-min TTL) | rider/index.ts + queueManager.ts |
| Wallet deposit | Rate limited: 10 req/15 min per IP+userId | wallet.ts |
| 403 auth denial | AUTO force-logout on AUTH_DENY_CODES | lib/api.ts |
| Admin ghost rider | Heartbeat cleanup: is_online=false after 5 min | socketio.ts |

---

### Execution Order & Time Estimates

| Prompt | Task | Est. Time |
|--------|------|-----------|
| PROMPT 1 | Page Inventory | 2 h |
| PROMPT 2 | Backend API Route Map | 3 h |
| PROMPT 3 | Database Schema | 1 h |
| PROMPT 4 | Admin Panel Map | 2 h |
| PROMPT 5 | Slow Network Resilience | 3 h |
| PROMPT 6 | Socket.io Integration | 2 h |
| PROMPT 7 | Auth & Registration | 2 h |
| PROMPT 8 | Wallet, Earnings & COD | 2 h |
| PROMPT 9 | Van Driver Module | 1 h |
| PROMPT 10 | Notifications & Push | 2 h |
| PROMPT 11 | Penalties, Reviews & Chat | 2 h |
| PROMPT 12 | Bug Fixes & Missing Wiring | 4 h |
| PROMPT 13 | Performance Optimization | 2 h |
| PROMPT 14 | E2E Verification | 3 h |
| **Total** | | **31 h** |
