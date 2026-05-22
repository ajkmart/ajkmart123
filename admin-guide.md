# AJKMart — Admin Panel Complete Guide & Production Readiness Plan

## Overview

AJKMart Admin Panel ek comprehensive web dashboard hai jo React + Vite + TypeScript se bana hai.
Yeh `/admin` prefix par run hota hai aur role-based access control (RBAC) implement karta hai.

**Base URL:** `http://localhost:3000/admin`
**Router:** Wouter (`base="/admin"`)
**Auth:** JWT-based admin session (separate from customer/rider/vendor auth)
**API:** All requests go through `/api/admin/*` endpoints

---

## Project Structure

```
artifacts/admin/
├── src/
│   ├── App.tsx                        # Root router — ALL routes registered here
│   ├── components/
│   │   ├── layout/
│   │   │   └── AdminLayout.tsx        # Sidebar + header shell
│   │   ├── MobileDrawer.tsx           # Mobile sidebar drawer
│   │   ├── CommandPalette.tsx         # Cmd+K search across all nav items
│   │   ├── PullToRefresh.tsx          # Pull-to-refresh wrapper (blue accent)
│   │   ├── ErrorBoundary.tsx          # React error boundary
│   │   └── ui/                        # Radix UI components (Button, Dialog, etc.)
│   ├── hooks/
│   │   ├── usePermissions.ts          # has(permission) helper from JWT claims
│   │   ├── useVersionCheck.ts         # Auto-reload on new deploy
│   │   └── useAdminFetcher.ts         # Authenticated fetch wrapper
│   ├── lib/
│   │   ├── adminAuthContext.tsx       # Admin JWT state, login/logout, token refresh
│   │   ├── adminFetcher.ts            # Fetch interceptor — attaches Bearer token
│   │   ├── navConfig.ts               # ALL nav groups, items, icons, permissions
│   │   ├── envValidation.ts           # VITE_* env var audit on startup
│   │   ├── logger.ts                  # Pino-style frontend logger
│   │   ├── sentry.ts                  # Sentry init (from platform_settings)
│   │   └── useAccessibilitySettings.ts
│   └── pages/                         # One file per page/route
```

---

## Authentication

### Admin Auth Flow
1. Admin visits `/admin` → redirected to `/admin/login`
2. Submits username + password (+ optional TOTP)
3. API: `POST /api/admin/v2/login` → returns `{ accessToken, admin }`
4. Token stored in `AdminAuthContext` (memory) + refresh via `POST /api/admin/v2/refresh-token`
5. All subsequent requests include `Authorization: Bearer <token>`

### Auth API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/v2/login` | POST | Login with username + password |
| `/api/admin/v2/logout` | POST | Invalidate session |
| `/api/admin/v2/me` | GET | Current admin profile |
| `/api/admin/v2/check-session` | GET | Validate token still active |
| `/api/admin/v2/forgot-password` | POST | Send reset link |
| `/api/admin/v2/reset-password` | POST | Set new password with token |
| `/api/admin/v2/mfa/status` | GET | Check if TOTP is enabled |
| `/api/admin/v2/mfa/setup` | POST | Initialize TOTP setup |
| `/api/admin/v2/mfa/verify` | POST | Complete TOTP setup |
| `/api/admin/v2/sessions` | GET | All active admin sessions |
| `/api/admin/v2/sessions/:id` | DELETE | Revoke specific session |

---

## Permission System (RBAC)

### How It Works
- Each admin has a `permissions` array in their JWT payload
- `usePermissions().has("permission.key")` checks if a permission exists
- `ProtectedRoute` component redirects to `/403` if permission missing
- Permissions are managed via `/admin/roles-permissions`

### Permission Keys Reference

| Permission Key | Controls Access To |
|---------------|-------------------|
| `dashboard.view` | Dashboard |
| `orders.view` | Orders, Order management |
| `fleet.rides.view` | Rides, Van, Live Map, Riders, SOS Alerts |
| `fleet.pharmacy.view` | Pharmacy orders |
| `fleet.parcel.view` | Parcel deliveries |
| `vendors.view` | Vendors, Delivery Access, Inventory Settings |
| `users.view` | Users management |
| `finance.kyc.view` | KYC verification |
| `finance.transactions.view` | Transactions, Wallet Transfers, Analytics |
| `finance.withdrawals.view` | Withdrawals page |
| `finance.deposits.review` | Deposit Requests |
| `content.products.view` | Products, Categories, Reviews, Banners, Popups, FAQs, Deep Links, QR Codes, Wishlist Insights |
| `promotions.view` | Promotions, Promo Codes, Flash Deals, Loyalty |
| `support.broadcast.send` | Communications, Broadcast, SMS Gateways |
| `support.chat.view` | Support Chat, Chat Monitor |
| `system.settings.view` | Settings, App Management, Health, Error Monitor, Business Rules, Webhooks, WhatsApp Log, Experiments, Search Analytics |
| `system.settings.edit` | Auth Methods, Auth Control, OTP Control |
| `system.audit.view` | Audit Logs, Consent Log |
| `system.roles.manage` | Roles & Permissions |
| `system.maintenance` | Launch Control |

---

## All Routes — Complete Reference

### Auth Routes (no login required)
| Route | Page File | Description |
|-------|-----------|-------------|
| `/admin/login` | `login.tsx` | Admin login form |
| `/admin/forgot-password` | `forgot-password.tsx` | Password reset request |
| `/admin/reset-password` | `reset-password.tsx` | Reset with OTP token |
| `/admin/set-new-password` | `set-new-password.tsx` | Set new password after reset |

### Dashboard
| Route | Page File | Permission | API Endpoints |
|-------|-----------|-----------|---------------|
| `/admin/dashboard` | `dashboard.tsx` | `dashboard.view` | `GET /api/admin/dashboard/stats`, `GET /api/stats` |

### Operations Group
| Route | Page File | Permission | API Endpoints |
|-------|-----------|-----------|---------------|
| `/admin/orders` | `orders/index.tsx` | `orders.view` | `GET /api/admin/orders`, `PATCH /api/admin/orders/:id`, `GET /api/admin/orders/stats` |
| `/admin/rides` | `rides.tsx` | `fleet.rides.view` | `GET /api/admin/rides`, `PATCH /api/admin/rides/:id`, `POST /api/admin/rides/:id/cancel` |
| `/admin/van` | `van.tsx` | `fleet.rides.view` | `GET /api/admin/routes`, `GET /api/admin/vehicles`, `GET /api/admin/schedules`, `GET /api/admin/drivers`, `GET /api/admin/bookings` |
| `/admin/pharmacy` | `pharmacy.tsx` | `fleet.pharmacy.view` | `GET /api/pharmacy/orders`, `PATCH /api/admin/orders/:id` |
| `/admin/parcel` | `parcel.tsx` | `fleet.parcel.view` | `GET /api/parcel/my-bookings`, `PATCH /api/admin/orders/:id` |
| `/admin/delivery-access` | `delivery-access.tsx` | `vendors.view` | `GET /api/admin/delivery-access`, `PUT /api/admin/delivery-access/mode`, `GET /api/admin/delivery-access/requests`, `PATCH /api/admin/delivery-access/requests/:id` |

### People Group
| Route | Page File | Permission | API Endpoints |
|-------|-----------|-----------|---------------|
| `/admin/users` | `users.tsx` | `users.view` | `GET /api/admin/users`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/ban` |
| `/admin/riders` | `riders.tsx` | `fleet.rides.view` | `GET /api/admin/riders`, `PATCH /api/admin/riders/:id/status`, `POST /api/admin/riders/:id/bonus` |
| `/admin/vendors` | `vendors.tsx` | `vendors.view` | `GET /api/admin/vendors`, `PATCH /api/admin/vendors/:id/status` |
| `/admin/kyc` | `kyc.tsx` | `finance.kyc.view` | `GET /api/admin/kyc`, `PATCH /api/admin/kyc/:id` |

### Catalog Group
| Route | Page File | Permission | API Endpoints |
|-------|-----------|-----------|---------------|
| `/admin/products` | `products.tsx` | `content.products.view` | `GET /api/admin/products`, `POST /api/admin/products`, `PATCH /api/admin/products/:id`, `DELETE /api/admin/products/:id`, `PATCH /api/admin/products/:id/approve` |
| `/admin/categories` | `categories.tsx` | `content.products.view` | `GET /api/admin/categories/tree`, `POST /api/admin/categories`, `PATCH /api/admin/categories/:id`, `DELETE /api/admin/categories/:id` |
| `/admin/reviews` | `reviews.tsx` | `content.products.view` | `GET /api/reviews/vendor/:id`, `GET /api/reviews/product/:id` |
| `/admin/vendor-inventory-settings` | `vendor-inventory-settings.tsx` | `vendors.view` | `GET /api/admin/inventory-settings`, `PUT /api/admin/inventory-settings` |

### Finance Group
| Route | Page File | Permission | API Endpoints |
|-------|-----------|-----------|---------------|
| `/admin/transactions` | `transactions.tsx` | `finance.transactions.view` | `GET /api/admin/transactions` |
| `/admin/withdrawals` | `Withdrawals.tsx` | `finance.withdrawals.view` | `GET /api/admin/withdrawal-requests` |
| `/admin/deposit-requests` | `DepositRequests.tsx` | `finance.deposits.review` | `GET /api/admin/deposit-requests` |
| `/admin/wallet-transfers` | `wallet-transfers.tsx` | `finance.transactions.view` | `GET /api/admin/wallet-transfers` |
| `/admin/loyalty` | `loyalty.tsx` | `promotions.view` | `GET /api/admin/loyalty/campaigns`, `GET /api/admin/loyalty/rewards`, `GET /api/admin/loyalty/stats` |

### Marketing Group
| Route | Page File | Permission | API Endpoints |
|-------|-----------|-----------|---------------|
| `/admin/promotions` | `promotions-hub.tsx` | `promotions.view` | `GET /api/admin/promo-codes`, `POST /api/admin/promo-codes` |
| `/admin/promo-codes` | `promo-codes.tsx` | `promotions.view` | `GET /api/admin/promo-codes`, `POST /api/admin/promo-codes`, `PATCH /api/admin/promo-codes/:id` |
| `/admin/flash-deals` | `flash-deals.tsx` | `promotions.view` | `GET /api/admin/flash-deals`, `POST /api/admin/flash-deals`, `PATCH /api/admin/flash-deals/:id` |
| `/admin/banners` | `banners.tsx` | `content.products.view` | `GET /api/admin/banners`, `POST /api/admin/banners`, `PATCH /api/admin/banners/:id`, `PATCH /api/admin/banners/reorder` |
| `/admin/popups` | `popups.tsx` | `content.products.view` | `GET /api/admin/popups`, `POST /api/admin/popups`, `PATCH /api/admin/popups/:id` |

### Communications Group
| Route | Page File | Permission | API Endpoints |
|-------|-----------|-----------|---------------|
| `/admin/communications` | `communication.tsx` | `support.broadcast.send` | `GET /api/admin/communication/dashboard`, `POST /api/admin/broadcast`, `GET /api/admin/broadcasts` |
| `/admin/broadcast` | `broadcast.tsx` | `support.broadcast.send` | `POST /api/admin/broadcast`, `GET /api/admin/broadcasts` |
| `/admin/support-chat` | `support-chat.tsx` | `support.chat.view` | `GET /api/admin/support-chat`, `POST /api/admin/support-chat/:id/reply` |
| `/admin/faq-management` | `faq-management.tsx` | `content.products.view` | `GET /api/admin/faq`, `POST /api/admin/faq`, `PATCH /api/admin/faq/:id`, `DELETE /api/admin/faq/:id` |
| `/admin/sms-gateways` | `sms-gateways.tsx` | `support.broadcast.send` | `GET /api/admin/sms-gateways`, `POST /api/admin/sms-gateways`, `POST /api/admin/sms-gateways/test` |

### Analytics Group
| Route | Page File | Permission | API Endpoints |
|-------|-----------|-----------|---------------|
| `/admin/analytics` | `analytics.tsx` | `finance.transactions.view` | `GET /api/stats`, `GET /api/admin/analytics` |
| `/admin/revenue-analytics` | `revenue-analytics.tsx` | `finance.transactions.view` | `GET /api/stats/metrics` |
| `/admin/search-analytics` | `search-analytics.tsx` | `system.settings.view` | `GET /api/admin/search-analytics`, `GET /api/admin/search-analytics/trending` |
| `/admin/wishlist-insights` | `wishlist-insights.tsx` | `content.products.view` | `GET /api/admin/wishlist-analytics` |
| `/admin/qr-codes` | `qr-codes.tsx` | `content.products.view` | `GET /api/admin/qr-codes`, `POST /api/admin/qr-codes` |
| `/admin/experiments` | `experiments.tsx` | `system.settings.view` | `GET /api/admin/experiments`, `POST /api/admin/experiments` |

### Security Group
| Route | Page File | Permission | API Endpoints |
|-------|-----------|-----------|---------------|
| `/admin/security` | `security.tsx` | `system.settings.view` | `GET /api/admin/security/audit-logs`, `GET /api/admin/security/active-sessions`, `POST /api/admin/security/block-ip` |
| `/admin/audit-logs` | `audit-logs.tsx` | `system.audit.view` | `GET /api/admin/security/audit-logs` |
| `/admin/consent-log` | `consent-log.tsx` | `system.audit.view` | `GET /api/legal/consent-log` |
| `/admin/roles-permissions` | `roles-permissions.tsx` | `system.roles.manage` | `GET /api/admin/role-presets`, `POST /api/admin/role-presets`, `PUT /api/admin/role-presets/:id` |
| `/admin/sos-alerts` | `sos-alerts.tsx` | `fleet.rides.view` | `GET /api/sos/alerts`, `PATCH /api/sos/alerts/:id/acknowledge`, `PATCH /api/sos/alerts/:id/resolve` |

### Health & Monitoring Group
| Route | Page File | Permission | API Endpoints |
|-------|-----------|-----------|---------------|
| `/admin/health-dashboard` | `health-dashboard.tsx` | `system.settings.view` | `GET /api/health`, `GET /api/health/schema-drift` |
| `/admin/error-monitor` | `error-monitor.tsx` | `system.settings.view` | `GET /api/error-reports`, `PATCH /api/error-reports/:id`, `POST /api/error-reports/:id/resolve` |
| `/admin/live-riders-map` | `live-riders-map.tsx` | `fleet.rides.view` | `GET /api/admin/riders` + Socket.io `rider:location` events |
| `/admin/chat-monitor` | `chat-monitor.tsx` | `support.chat.view` | `GET /api/admin/chat-monitor/conversations`, `GET /api/admin/chat-monitor/reports` |

### Configuration Group
| Route | Page File | Permission | API Endpoints |
|-------|-----------|-----------|---------------|
| `/admin/settings` | `settings.tsx` | `system.settings.view` | `GET /api/settings`, `PUT /api/settings` |
| `/admin/app-management` | `app-management.tsx` | `system.settings.view` | `GET /api/admin/launch/settings`, `PATCH /api/admin/launch/feature/:id` |
| `/admin/auth-methods` | `auth-methods.tsx` | `system.settings.edit` | `GET /api/admin/auth/methods`, `PATCH /api/admin/auth/methods` |
| `/admin/auth-control` | `auth-control.tsx` | `system.settings.edit` | `GET /api/admin/auth/events`, `GET /api/admin/auth/locked-users`, `POST /api/admin/auth/broadcast-logout` |
| `/admin/launch-control` | `launch-control.tsx` | `system.maintenance` | `GET /api/admin/launch/settings`, `POST /api/admin/launch/mode` |
| `/admin/otp-control` | `otp-control.tsx` | `system.settings.edit` | `GET /api/admin/otp/status`, `POST /api/admin/otp/disable`, `GET /api/admin/whitelist` |
| `/admin/business-rules` | `business-rules.tsx` | `system.settings.view` | `GET /api/business-rules`, `POST /api/business-rules`, `PUT /api/business-rules/:id` |
| `/admin/deep-links` | `deep-links.tsx` | `content.products.view` | `GET /api/admin/deep-links`, `POST /api/admin/deep-links`, `DELETE /api/admin/deep-links/:id` |
| `/admin/webhooks` | `webhook-manager.tsx` | `system.settings.view` | `GET /api/admin/webhooks`, `POST /api/admin/webhooks`, `PATCH /api/admin/webhooks/:id` |
| `/admin/whatsapp-delivery-log` | `whatsapp-delivery-log.tsx` | `system.settings.view` | `GET /api/admin/whatsapp/delivery-log` |
| `/admin/account-conditions` | `account-conditions.tsx` | `system.settings.view` | `GET /api/admin/conditions`, `POST /api/admin/conditions` |
| `/admin/condition-rules` | `condition-rules.tsx` | `system.settings.view` | `GET /api/admin/condition-rules`, `POST /api/admin/condition-rules` |
| `/admin/accessibility` | `accessibility.tsx` | `system.settings.view` | Local settings only |

### Error Pages
| Route | Page File | Description |
|-------|-----------|-------------|
| `/admin/403` | `forbidden.tsx` | Permission denied |
| `/admin/404` | `not-found.tsx` | Page not found |
| `*` (catch-all) | `not-found.tsx` | Unknown routes |

---

## Settings Sub-Sections

The `/admin/settings` page has multiple tabs, each loading a sub-component:

| Tab Key | Sub-Component | What It Configures |
|---------|--------------|-------------------|
| `general` | `settings-general.tsx` | App name, contact info, default language, timezone |
| `payment` | `settings-payment.tsx` | Payment gateways, wallet limits, payout rules |
| `integrations` | `settings-integrations.tsx` | Maps (OSM/Mapbox/Google), SMS, WhatsApp, Sentry, Firebase |
| `security` | `settings-security.tsx` | Session TTL, JWT secret rotation, IP allowlist |
| `system` | `settings-system.tsx` | DB pool, caching, maintenance mode |
| `weather` | `settings-weather.tsx` | Weather API provider + location |
| `compliance` | `settings-compliance.tsx` | GDPR, data retention, AML thresholds |
| `branding` | `settings-branding.tsx` | Logo, colors, app store metadata |

---

## Real-Time Features

### Live Riders Map (`/admin/live-riders-map`)
- Connects to Socket.io room: `admin-fleet`
- Listens to: `rider:location`, `rider:offline`, `rider:online`
- Displays: real-time GPS markers, active trip indicators (pulsing red), vehicle type badges
- Features: username labels toggle, offline dimming, history playback slider, map provider switching

### Order Real-Time Updates
- Admin orders page listens to Socket.io `order:status` events
- No polling — push-based updates

### SOS Alerts (`/admin/sos-alerts`)
- Listens to `sos:new` Socket.io events
- Mobile notification badge on nav item when new SOS arrives

---

## Environment Variables (Admin App)

| Variable | Required | Purpose |
|---------|----------|---------|
| `VITE_API_BASE_URL` | Optional | Override API server URL (defaults to same origin) |
| `VITE_SENTRY_DSN` | Optional | Frontend error tracking |
| `VITE_APP_VERSION` | Optional | Version shown in footer, used by version check hook |

---

## Running the Admin App

```bash
# Development
cd artifacts/admin && pnpm dev        # Starts on port 3000

# TypeScript check
cd artifacts/admin && pnpm tsc --noEmit

# Build for production
cd artifacts/admin && pnpm build
```

---

---

# 🚀 Admin Panel — Production Readiness Prompt Plan

## Yeh Plan Kya Hai?

Yeh document AJKMart Admin Panel ko **fully production-ready** banane ka step-by-step prompt plan hai.
Har prompt ek independent kaam hai — sequentially execute karna hai.
Is plan ko implement karne ke baad Admin Panel mein **koi bug nahi hoga**, sab pages kaam karein ge,
aur panel production deploy ke liye tayar hoga.

Har prompt ke baad Admin Panel better hota jata hai. Koi bhi prompt skip mat karo.

---

## 🔍 Current State — Kya Theek Hai, Kya Theek Nahi

### Jo Pehle Se Complete Hai

| Area | Status |
|------|--------|
| React + Vite + TypeScript setup | ✅ Complete |
| Wouter routing with `/admin` base | ✅ Complete |
| AdminAuthContext (in-memory JWT, auto-refresh) | ✅ Complete |
| adminFetcher (Bearer token + CSRF) | ✅ Complete |
| RBAC / usePermissions hook | ✅ Complete |
| PullToRefresh on all data pages | ✅ Complete |
| Socket.io client (adminSocket.ts) | ✅ Complete |
| Live Riders Map (Leaflet + pulsing markers) | ✅ Complete |
| Categories tree with drag-reorder | ✅ Complete |
| CommandPalette (Cmd+K) | ✅ Complete |
| ErrorBoundary + SafeImage fallback | ✅ Complete |
| Pino-style frontend logger | ✅ Complete |
| 50+ page files registered | ✅ Complete |

### Jo Fix Karna Hai (Is Plan Ka Maqsad)

| Area | Problem |
|------|---------|
| Legacy `api.ts` bridge | `@deprecated` functions still used in some components — migrate to `adminFetcher` |
| `legacyToken` warning | Old JWTs without `perms` claim cause silent permission bypass |
| Error Monitor page | Broken loading state when API returns empty array |
| CORS warnings in logs | `ALLOWED_ORIGINS` not set — Replit fallback, not production-safe |
| Settings tabs | Some sub-tabs don't save correctly (missing PUT body) |
| Finance pages | Deposit/Withdrawal approve actions not fully wired |
| Bulk actions | No confirmation dialog before bulk status changes |
| Socket.io reconnect | No visual reconnecting state shown to admin user |
| Production build | Bundle not split — single large chunk slows first load |
| TypeScript strictness | `any` types and missing return types in page files |
| Missing API endpoints | Some pages call endpoints not yet defined in backend |
| Print/Export | CSV export broken for transactions and audit logs |

---

## ⚙️ Key Files Reference

### Admin Frontend
| File | Purpose |
|------|---------|
| `artifacts/admin/src/App.tsx` | Root router — all routes registered here |
| `artifacts/admin/src/lib/adminAuthContext.tsx` | JWT state, login/logout, auto-refresh |
| `artifacts/admin/src/lib/adminFetcher.tsx` | Authenticated fetch with CSRF |
| `artifacts/admin/src/lib/api.ts` | Legacy bridge (deprecated — migration target) |
| `artifacts/admin/src/lib/navConfig.ts` | Nav groups, permissions, icons |
| `artifacts/admin/src/hooks/usePermissions.ts` | Permission checks from JWT |
| `artifacts/admin/src/components/UniversalMap.tsx` | Leaflet map component |

### API Backend (Admin Routes)
| File | Purpose |
|------|---------|
| `artifacts/api-server/src/routes/admin.ts` | Barrel file — mounts sub-routers |
| `artifacts/api-server/src/routes/admin/auth.ts` | Login, logout, session |
| `artifacts/api-server/src/routes/admin/users.ts` | User management |
| `artifacts/api-server/src/routes/admin/orders.ts` | Order management |
| `artifacts/api-server/src/routes/admin/rides.ts` | Ride management |
| `artifacts/api-server/src/routes/admin/finance.ts` | Payouts, withdrawals |
| `artifacts/api-server/src/routes/admin/content.ts` | Banners, FAQs, categories |
| `artifacts/api-server/src/routes/admin/system.ts` | Settings, notifications, audit |
| `artifacts/api-server/src/routes/admin-shared.ts` | Shared: adminAuth, AdminRequest type |

---

## 📋 IMPLEMENTATION PLAN — Step by Step Prompts

---

### ═══ PROMPT 1 — Legacy API Bridge Migration ═══

```
Task: api.ts mein jo @deprecated functions hain unhe sab pages se hata do aur
      seedha adminFetcher use karo. Legacy sessionStorage auth bilkul khatam karo.

Problem:
- artifacts/admin/src/lib/api.ts has getToken() returning null (deprecated)
- Some components still import from api.ts instead of adminFetcher
- legacyToken flag in usePermissions.ts causes silent permission bypass on old JWTs

Files to check and fix:
1. artifacts/admin/src/lib/api.ts
   - Remove all @deprecated functions that return null/empty values
   - Keep only re-exports that point to adminFetcher equivalents:
     export { fetchAdmin as apiFetch } from "./adminFetcher";
     export { fetchAdmin as adminGet } from "./adminFetcher";
   - Remove getToken(), setToken(), removeToken() entirely
   - Remove ADMIN_TOKEN_KEY constant

2. Search all files that import from api.ts:
   Pattern: import { ... } from "@/lib/api"
   For each import:
   - Replace apiFetch → fetchAdmin from "@/lib/adminFetcher"
   - Replace getToken() calls → useAdminAuth().state.accessToken

3. artifacts/admin/src/hooks/usePermissions.ts
   - When legacyToken is true (no perms claim in JWT), call
     /api/admin/v2/me and refresh token immediately
   - Never silently bypass — if perms missing after refresh, force logout
   - Update has() to return false (not bypass) when legacyToken is true
     unless isSuper is also true

4. artifacts/admin/src/components/StockNotificationBell.tsx
   - Line 112: legacyToken check — replace with proper permission check
   - if (!isSuper && !has("inventory.view")) return null;
   - Remove legacyToken dependency entirely

Acceptance:
- grep -r "from \"@/lib/api\"" artifacts/admin/src/ → 0 results
- grep -r "getToken()" artifacts/admin/src/ → 0 results
- legacyToken never causes silent permission grant
- pnpm tsc --noEmit → 0 errors in admin workspace
```

---

### ═══ PROMPT 2 — Admin Auth System: Session Expiry & Refresh Hardening ═══

```
Task: Admin ka JWT refresh system aur session expiry fully robust banao.
      Token expire hone par blank white screen na aaye — proper logout flow ho.

Files:
- artifacts/admin/src/lib/adminAuthContext.tsx
- artifacts/admin/src/lib/adminFetcher.tsx

PART A — Proactive Token Refresh:

adminAuthContext.tsx mein check karo ki refresh timer set hai ya nahi.
Agar nahi hai to add karo:

useEffect(() => {
  if (!state.accessToken) return;
  // Decode JWT expiry
  const payload = JSON.parse(atob(state.accessToken.split(".")[1]));
  const expiresIn = (payload.exp * 1000) - Date.now();
  // Refresh 60 seconds before expiry
  const refreshTimer = setTimeout(() => {
    refreshAccessToken();
  }, Math.max(expiresIn - 60_000, 0));
  return () => clearTimeout(refreshTimer);
}, [state.accessToken]);

PART B — Refresh Failure Handling:

When refreshAccessToken() fails (network error or 401):
- Clear all auth state
- Show toast: "Session expired. Please log in again."
- Redirect to /admin/login
- Do NOT show blank white screen

PART C — adminFetcher 401 Handling:

In adminFetcher.tsx, when any API request returns 401:
- Attempt ONE token refresh automatically
- If refresh succeeds → retry original request with new token
- If refresh fails → call logout() from adminAuthContext → redirect to /admin/login
- Never queue multiple refresh requests (use a flag: isRefreshing + queue)

PART D — Session Check on Tab Focus:

Add visibility change listener:
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    checkSession(); // GET /api/admin/v2/check-session
  }
});

If checkSession() returns 401 → force logout.

PART E — "Session About to Expire" Warning:

5 minutes before token expires, show a dismissable banner:
"Your session expires in 5 minutes. Click to extend."
Click → calls refreshAccessToken().

Acceptance:
- Token auto-refreshes 60s before expiry (no manual action needed)
- 401 from any API → 1 retry with fresh token → if still 401 → logout
- Tab focus after long idle → session check runs
- No blank white screen on session expiry
- pnpm tsc --noEmit → 0 errors
```

---

### ═══ PROMPT 3 — Error States: Sab Pages Par Proper Loading/Error/Empty States ═══

```
Task: Har admin page par loading, error aur empty state sahi se handle karo.
      Koi bhi page "blank white screen" ya infinite spinner nahi dikhana chahiye.

Common Pattern (apply to ALL pages listed below):

Pattern A — Standard page data fetch:
const { data, isLoading, isError, error, refetch } = useQuery({
  queryKey: ["admin", "page-key"],
  queryFn: () => fetchAdmin("/api/admin/endpoint"),
  retry: 2,
  staleTime: 30_000,
});

if (isLoading) return <LoadingState rows={5} />;
if (isError) return (
  <ErrorRetry
    variant="page"
    message={errorParser(error)}
    onRetry={refetch}
  />
);
if (!data || data.length === 0) return <EmptyState message="No items found." />;

Pages to fix (apply Pattern A to each):

1. artifacts/admin/src/pages/error-monitor.tsx
   Problem: When /api/error-reports returns [] (empty array),
            page stays in loading state forever.
   Fix: Add explicit empty array check after isLoading resolves.
   if (!isLoading && Array.isArray(data) && data.length === 0) show EmptyState.

2. artifacts/admin/src/pages/transactions.tsx
   Problem: Amount column shows "undefined" when API omits amount field.
   Fix: Use nullish coalescing: {(row.amount ?? 0).toLocaleString("en-PK")}
   Add type guard: const amount = typeof row.amount === "number" ? row.amount : 0;

3. artifacts/admin/src/pages/audit-logs.tsx
   Problem: "Load more" button disappears if first page is empty.
   Fix: Show "No audit logs found" EmptyState with filter-reset button.

4. artifacts/admin/src/pages/DepositRequests.tsx
   Problem: Page crashes if depositRequests is undefined (API down).
   Fix: Default to empty array: const items = data?.requests ?? [];

5. artifacts/admin/src/pages/Withdrawals.tsx
   Problem: Same as DepositRequests — undefined crash.
   Fix: Default to empty array: const items = data?.withdrawals ?? [];

6. artifacts/admin/src/pages/wallet-transfers.tsx
   Problem: Table renders with wrong column keys.
   Fix: Map API response fields correctly:
   { id, senderId, receiverId, amount, createdAt } → match backend field names.

7. artifacts/admin/src/pages/search-analytics.tsx
   Problem: Chart crashes when trending array is empty.
   Fix: Guard: if (!data?.trending?.length) show EmptyState.

8. artifacts/admin/src/pages/consent-log.tsx
   Problem: /api/legal/consent-log returns 404 → page shows raw error object.
   Fix: Catch error properly. Show "No consent records found." on 404.

9. artifacts/admin/src/pages/chat-monitor.tsx
   Problem: Conversations list undefined on first load.
   Fix: const conversations = data?.conversations ?? [];

10. artifacts/admin/src/pages/notifications.tsx
    Problem: Badge count goes to NaN when count is undefined.
    Fix: const count = Number(data?.unreadCount ?? 0);

Global fix in artifacts/admin/src/lib/errorParser.ts:
- Export parseApiError(error: unknown): string
- Handle: Error objects, fetch Response errors, { message } objects, strings
- Default: "Something went wrong. Please try again."

Acceptance:
- All 10 pages load without crash even when API returns empty/null
- No "undefined" or "NaN" visible in any table cell
- pnpm tsc --noEmit → 0 errors
- Every page has loading spinner, error retry, and empty state
```

---

### ═══ PROMPT 4 — Finance Pages: Approve/Reject Actions Fully Wire Karo ═══

```
Task: Deposit requests aur withdrawal requests ke approve/reject buttons
      backend se properly connected karo. Action ke baad list auto-refresh ho.

Files:
- artifacts/admin/src/pages/DepositRequests.tsx
- artifacts/admin/src/pages/Withdrawals.tsx
- artifacts/api-server/src/routes/admin/finance.ts

PART A — Deposit Requests Page:

1. Verify API endpoints exist in finance.ts:
   - GET  /api/admin/deposit-requests?status=pending&page=1&limit=20
   - PATCH /api/admin/deposit-requests/:id
     Body: { status: "approved" | "rejected", adminNote?: string }

2. In DepositRequests.tsx add mutation:
   const approveMut = useMutation({
     mutationFn: (id: string) =>
       fetchAdmin(`/api/admin/deposit-requests/${id}`, {
         method: "PATCH",
         body: JSON.stringify({ status: "approved" }),
       }),
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["admin", "deposit-requests"] });
       toast.success("Deposit approved successfully");
     },
     onError: (err) => toast.error(parseApiError(err)),
   });

3. Add confirmation dialog before approve/reject:
   <ConfirmDialog
     title="Approve Deposit?"
     description={`Approve PKR ${selectedItem?.amount} deposit for ${selectedItem?.userName}?`}
     onConfirm={() => approveMut.mutate(selectedItem.id)}
   />

4. Add admin note field in rejection dialog:
   <Textarea placeholder="Reason for rejection (sent to user)" />
   PATCH body: { status: "rejected", adminNote: noteText }

PART B — Withdrawal Requests Page:

1. Verify API: PATCH /api/admin/withdrawal-requests/:id
   Body: { status: "approved" | "rejected", transactionId?: string }

2. For approve: show dialog asking for transactionId (bank reference number)
3. For reject: show dialog asking for rejection reason
4. On success: invalidate query, show toast, update row badge in-place

PART C — Wallet Adjust (from Users page):

Verify WalletAdjustModal.tsx sends:
- POST /api/admin/users/:id/wallet-adjust
- Body: { amount: number, type: "credit" | "debit", note: string }
- If endpoint missing in finance.ts → add it

PART D — Backend: Missing Endpoint Guard

In artifacts/api-server/src/routes/admin/finance.ts:
- If PATCH /deposit-requests/:id is missing → add it
- Validate status field with Zod: z.enum(["approved", "rejected"])
- On approval: credit user wallet, mark request as approved, log to audit_logs
- On rejection: mark as rejected, send notification to user

Acceptance:
- Approve button → ConfirmDialog → API call → toast → list refreshes
- Reject button → dialog with note → API call → toast → row updates
- No "Cannot read properties of undefined" errors on Finance pages
- All mutations have loading state (button shows spinner while in progress)
- pnpm tsc --noEmit → 0 errors
```

---

### ═══ PROMPT 5 — Bulk Actions: Confirmation Dialogs + Undo ═══

```
Task: Har bulk action se pehle confirmation dialog dikhao.
      Galti se select sab users/orders delete na ho jayen.

Files:
- artifacts/admin/src/pages/users.tsx
- artifacts/admin/src/pages/riders.tsx
- artifacts/admin/src/pages/vendors.tsx
- artifacts/admin/src/pages/orders/index.tsx
- artifacts/admin/src/pages/products.tsx
- artifacts/admin/src/components/ConfirmDialog.tsx

PART A — Bulk Action Pattern (apply to all pages above):

Step 1: Add selectedIds state:
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<string | null>(null);

Step 2: Add checkbox column to DataTable:
  { id: "select", cell: (row) => (
    <Checkbox
      checked={selectedIds.includes(row.id)}
      onCheckedChange={(v) => setSelectedIds(prev =>
        v ? [...prev, row.id] : prev.filter(id => id !== row.id)
      )}
    />
  )}

Step 3: ActionBar with bulk controls:
  {selectedIds.length > 0 && (
    <ActionBar count={selectedIds.length}>
      <Button onClick={() => setBulkAction("ban")}>Ban Selected</Button>
      <Button onClick={() => setBulkAction("export")}>Export CSV</Button>
    </ActionBar>
  )}

Step 4: ConfirmDialog for destructive actions:
  <ConfirmDialog
    open={bulkAction === "ban"}
    title={`Ban ${selectedIds.length} Users?`}
    description="These users will be blocked from the platform immediately."
    confirmLabel="Ban All"
    confirmVariant="destructive"
    onConfirm={() => bulkBanMutation.mutate(selectedIds)}
    onCancel={() => setBulkAction(null)}
  />

PART B — Users Page Bulk Actions:
- Ban selected users: POST /api/admin/users/bulk-ban { ids: string[] }
- Export selected as CSV (client-side, no API needed)

PART C — Orders Page Bulk Actions:
- Mark as fulfilled: PATCH /api/admin/orders/bulk-status { ids, status: "fulfilled" }
- Export selected orders as CSV

PART D — Products Page Bulk Actions:
- Approve all selected: POST /api/admin/products/bulk-approve { ids }
- Delete selected: DELETE /api/admin/products/bulk { ids }
- Both require ConfirmDialog

PART E — Backend: Add Bulk Endpoints

In artifacts/api-server/src/routes/admin/users.ts:
  POST /api/admin/users/bulk-ban
  Body: { ids: string[] }
  Validate: z.object({ ids: z.array(z.string()).min(1).max(100) })
  Action: Set is_banned=true for all ids, log to audit_logs

In artifacts/api-server/src/routes/admin/orders.ts:
  PATCH /api/admin/orders/bulk-status
  Body: { ids: string[], status: string }
  Validate: z.object({ ids: z.array(z.string()).min(1).max(100), status: z.string() })

In artifacts/api-server/src/routes/admin/content.ts:
  POST /api/admin/products/bulk-approve
  DELETE /api/admin/products/bulk

PART F — ConfirmDialog Enhancement:

In artifacts/admin/src/components/ConfirmDialog.tsx:
- Add confirmVariant prop: "default" | "destructive"
- Destructive variant: red button, warning icon
- Add loading state: disabled + spinner when mutation is pending

Acceptance:
- No bulk action executes without ConfirmDialog confirmation
- Bulk ban 50 users → ConfirmDialog → API → all 50 banned → toast
- Checkbox select-all works in header row
- ActionBar only visible when ≥1 item selected
- pnpm tsc --noEmit → 0 errors
```

---

### ═══ PROMPT 6 — Settings Pages: Sab Tabs Save Theek Karo ═══

```
Task: /admin/settings ke sab tabs (general, payment, integrations, security,
      system, compliance, branding) properly save karein aur errors show karein.

Files:
- artifacts/admin/src/pages/settings-general.tsx
- artifacts/admin/src/pages/settings-payment.tsx
- artifacts/admin/src/pages/settings-integrations.tsx
- artifacts/admin/src/pages/settings-security.tsx
- artifacts/admin/src/pages/settings-compliance.tsx
- artifacts/admin/src/pages/settings-branding.tsx
- artifacts/api-server/src/routes/admin/system.ts

PART A — Settings Save Pattern (apply to all tabs):

Each settings tab must:
1. Load: GET /api/settings → populate form with current values
2. Save: PUT /api/settings → send ONLY changed fields (partial update)
3. Show success toast: "Settings saved successfully"
4. Show error toast with specific message on failure
5. Disable Save button while mutation is pending (show spinner)
6. Mark form as dirty when any field changes (unsaved changes indicator)
7. Confirm before navigating away with unsaved changes (NavigationGuard)

const saveMut = useMutation({
  mutationFn: (payload: Partial<PlatformSettings>) =>
    fetchAdmin("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  onSuccess: () => {
    toast.success("Settings saved successfully");
    setIsDirty(false);
    queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
  },
  onError: (err) => toast.error(parseApiError(err)),
});

PART B — General Settings:
- Fields: appName, contactEmail, contactPhone, defaultLanguage, timezone, currency
- Validate: email format, phone format
- On save: PUT /api/settings with { general: { appName, contactEmail, ... } }

PART C — Payment Settings:
- Fields: walletMinDeposit, walletMaxDeposit, walletMaxBalance,
         platformFeePercent, payoutMinAmount, payoutSchedule
- Validate: all must be positive numbers, platformFeePercent <= 100
- walletMaxDeposit must be > walletMinDeposit

PART D — Integration Settings:
- Maps tab already has provider selector (verify saves to platform_settings)
- SMS: twilio/africas-talking/custom selector + API key field
- When API key field is masked (●●●●), do NOT re-send masked value on save
- Only send key if user has typed a new value (track: hasNewValue boolean)

PART E — Security Settings:
- Fields: sessionTtlMinutes, refreshTtlDays, maxFailedLogins, lockoutDurationMinutes
- Validate: sessionTtlMinutes between 5 and 1440
- Warning banner if sessionTtlMinutes < 15 (security risk)

PART F — Compliance Settings:
- Fields: dataRetentionDays, amlThresholdAmount, gdprEnabled, consentRequired
- amlThresholdAmount: must be positive integer (PKR amount)
- gdprEnabled toggle: when enabled, show GDPR features in app

PART G — Branding Settings:
- Fields: logoUrl, faviconUrl, primaryColor, secondaryColor
- Logo/favicon: show current image preview + upload new via /api/admin/uploads/admin
- Color fields: use HTML color picker input type="color"
- primaryColor: validate is valid hex (#RRGGBB)

PART H — Backend: PUT /api/settings

In artifacts/api-server/src/routes/admin/system.ts:
- Verify PUT /api/settings accepts partial updates (merge with existing)
- If field is missing in body → keep existing value (don't null it out)
- Validate using Zod schema per section
- Log change to audit_logs with: { adminId, changedFields, before, after }

Acceptance:
- Each tab saves independently (changing General doesn't affect Payment)
- API keys are never re-sent as masked values
- NavigationGuard warns on unsaved changes
- All 8 tabs load and save without errors
- pnpm tsc --noEmit → 0 errors
```

---

### ═══ PROMPT 7 — Socket.io: Reconnection State + Admin Notifications ═══

```
Task: Socket.io disconnect/reconnect properly handle karo.
      Admin ko real-time disconnect pata chale. SOS alert notification badge kaam kare.

Files:
- artifacts/admin/src/lib/adminSocket.ts
- artifacts/admin/src/components/layout/AdminLayout.tsx
- artifacts/admin/src/pages/sos-alerts.tsx
- artifacts/admin/src/components/AdminNotificationBell.tsx

PART A — Socket.io Connection State:

In adminSocket.ts, add connection state tracking:

type SocketStatus = "connected" | "disconnected" | "reconnecting";

export const socketStatus$ = {
  value: "disconnected" as SocketStatus,
  listeners: new Set<(s: SocketStatus) => void>(),
  set(s: SocketStatus) {
    this.value = s;
    this.listeners.forEach((fn) => fn(s));
  },
};

socket.on("connect", () => socketStatus$.set("connected"));
socket.on("disconnect", () => socketStatus$.set("disconnected"));
socket.on("reconnect_attempt", () => socketStatus$.set("reconnecting"));
socket.on("reconnect", () => socketStatus$.set("connected"));

PART B — Connection Banner in AdminLayout:

Add to AdminLayout.tsx:
const [socketStatus, setSocketStatus] = useState(socketStatus$.value);

useEffect(() => {
  const handler = (s: SocketStatus) => setSocketStatus(s);
  socketStatus$.listeners.add(handler);
  return () => socketStatus$.listeners.delete(handler);
}, []);

{socketStatus === "disconnected" && (
  <div className="bg-red-500 text-white text-center py-1 text-xs">
    ⚡ Disconnected from real-time server. Some data may be stale.
  </div>
)}
{socketStatus === "reconnecting" && (
  <div className="bg-yellow-500 text-white text-center py-1 text-xs">
    🔄 Reconnecting to real-time server...
  </div>
)}

PART C — SOS Alerts Badge:

In AdminNotificationBell.tsx or SOS section of navConfig:
- Listen to socket event: "sos:new"
- Increment badge count on each new SOS
- Store count in localStorage key "ajkmart_sos_unread"
- Reset badge when admin visits /admin/sos-alerts
- Show red pulsing badge on sidebar SOS nav item

In adminSocket.ts:
socket.on("sos:new", (alert) => {
  const count = parseInt(localStorage.getItem("ajkmart_sos_unread") ?? "0") + 1;
  localStorage.setItem("ajkmart_sos_unread", String(count));
  window.dispatchEvent(new CustomEvent("sos:badge:update", { detail: { count } }));
});

In AdminLayout.tsx sidebar nav item for SOS:
Listen to "sos:badge:update" event and show badge overlay on nav item.

PART D — Order Status Real-Time Updates:

In artifacts/admin/src/pages/orders/index.tsx:
- Connect to socket room: "admin-orders"
- Listen to "order:status" event
- When order status changes: update that row in-place using queryClient.setQueryData
- Show a subtle "Updated just now" indicator on changed rows

PART E — Socket Room Joining:

In adminSocket.ts, after successful connection:
socket.emit("admin:join", { token: accessToken });
Server response joins admin to: "admin-fleet", "admin-orders", "admin-support"

Verify server side in artifacts/api-server/src/lib/socketio.ts handles "admin:join" event.

Acceptance:
- Disconnect WiFi → red banner appears within 3 seconds
- Reconnect WiFi → green "Connected" briefly → banner disappears
- New SOS → badge number appears on nav item without page refresh
- Visit /sos-alerts → badge resets to 0
- Order status change → row updates in-place on orders page
```

---

### ═══ PROMPT 8 — Products & KYC: Image Preview + Document Viewer ═══

```
Task: Products page par image preview theek karo.
      KYC page par ID documents properly viewer mein khulo.

Files:
- artifacts/admin/src/pages/products.tsx
- artifacts/admin/src/pages/kyc.tsx
- artifacts/admin/src/components/ui/SafeImage.tsx
- artifacts/admin/src/components/ui/ImageLightbox.tsx (create if missing)

PART A — SafeImage Component Enhancement:

Current SafeImage shows <ImageOff> icon on broken image.
Enhancement:
1. Add onClick prop: when clicked, open full-screen lightbox
2. Add loading="lazy" to all images by default
3. Add blurhash placeholder (gray shimmer) while loading
4. Support both absolute URLs and relative paths:
   - If src starts with "http" → use as-is
   - If src starts with "/" → prepend window.location.origin

PART B — ImageLightbox Component:

Create artifacts/admin/src/components/ui/ImageLightbox.tsx:
Props: { src: string; alt: string; isOpen: boolean; onClose: () => void }

Features:
- Full-screen overlay (fixed inset-0 z-50 bg-black/90)
- Image centered with max-w-[90vw] max-h-[90vh] object-contain
- Close button (X) top-right
- Keyboard: Escape closes
- Download button: <a href={src} download> "Download"
- Next/Prev if multiple images passed (optional)

PART C — Products Page Image Fix:

In products.tsx:
1. Product thumbnail in table: use <SafeImage> with onClick lightbox
2. Product detail modal: show image gallery (if product has multiple images)
3. Image upload in create/edit dialog:
   - Show preview immediately after file selected (URL.createObjectURL)
   - Upload to /api/admin/uploads/admin on form submit
   - Show upload progress bar using UploadProgress component

PART D — KYC Document Viewer:

In kyc.tsx, KYC detail modal:
1. Show three documents with SafeImage + lightbox:
   - Front ID photo (idFront / frontIdPhoto)
   - Back ID photo (idBack / backIdPhoto)
   - Selfie (selfie / selfiePhoto)
2. Handle multiple field name aliases (API may return any of these names)
3. Add zoom controls in lightbox for ID documents
4. "View Full Size" button opens image in new tab

PART E — KYC Actions Fix:

Approve/Reject buttons in kyc.tsx must:
1. Show confirmation dialog before action
2. Call PATCH /api/admin/kyc/:id { status: "approved" | "rejected", note?: string }
3. On approval: send notification to user (fire-and-forget)
4. Refresh KYC list after action
5. Show "Pending: X" / "Approved today: Y" stat cards at top

Acceptance:
- Click any product thumbnail → lightbox opens
- Download button works in lightbox
- KYC page shows all 3 document photos
- Approve/Reject requires confirmation
- SafeImage never shows broken img tag — always shows fallback
- pnpm tsc --noEmit → 0 errors
```

---

### ═══ PROMPT 9 — Analytics & Charts: Sab Graphs Kaam Karein ═══

```
Task: Analytics, revenue, search analytics pages par sab charts properly
      render hon. Empty/loading states sahi hon. Chart library consistent ho.

Files:
- artifacts/admin/src/pages/analytics.tsx
- artifacts/admin/src/pages/revenue-analytics.tsx
- artifacts/admin/src/pages/search-analytics.tsx
- artifacts/admin/src/pages/wishlist-insights.tsx
- artifacts/admin/src/lib/analytics.ts

Check what charting library is currently installed:
  cat artifacts/admin/package.json | grep -E "recharts|chart.js|@nivo|victory|tremor"

If multiple chart libraries installed → standardize on ONE:
  Preferred: recharts (most common in React + Tailwind projects)
  Remove others: pnpm remove chart.js @nivo/core victory

PART A — Analytics Page (analytics.tsx):

Charts needed:
1. Orders over time (LineChart): x=date, y=orderCount
   API: GET /api/admin/analytics?period=30d&metric=orders
2. Revenue by category (BarChart): x=categoryName, y=revenue
   API: GET /api/admin/analytics?metric=revenue_by_category
3. User growth (AreaChart): x=date, y=newUsers
   API: GET /api/stats/users/growth?days=30
4. Platform overview stats (4x StatCard): users, orders, revenue, activeRiders
   API: GET /api/stats

Each chart:
- Loading: skeleton shimmer (same height as chart)
- Empty: "No data for selected period" message centered in chart area
- Error: ErrorRetry inline component

Date range selector (DateRangePicker):
- Options: Last 7 days, Last 30 days, Last 90 days, This year
- Changes queryKey → React Query re-fetches

PART B — Revenue Analytics (revenue-analytics.tsx):

Charts needed:
1. Daily revenue (BarChart): gross vs net (after commission)
2. Commission breakdown (PieChart): platform vs vendor vs rider
3. Top earning vendors (HorizontalBarChart): vendor name + revenue
4. Revenue trend vs previous period (LineChart with comparison line)

API: GET /api/stats/metrics?from=2024-01-01&to=2024-12-31

PART C — Search Analytics (search-analytics.tsx):

Fix crash when trending array is empty:
  const trending = data?.trending ?? [];
  if (!trending.length) return <EmptyState message="No search data yet." />;

Charts:
1. Top search terms table (with click count badge)
2. Zero-result searches (queries that found nothing)
3. Search volume over time (LineChart)

PART D — Wishlist Insights (wishlist-insights.tsx):

Charts needed:
1. Most wishlisted products (top 10 horizontal bar chart)
2. Wishlist conversion rate (wishlisted → purchased %)
3. Category wishlist distribution (PieChart)

API: GET /api/admin/wishlist-analytics

PART E — Backend: Verify Analytics Endpoints Exist

Check artifacts/api-server/src/routes/admin/system.ts:
If GET /api/admin/analytics is missing → add stub returning mock data structure:
{
  orders: [{ date: "2024-01-01", count: 42 }, ...],
  revenue: [{ category: "Grocery", amount: 150000 }, ...],
}

Acceptance:
- All 4 analytics pages load without crash
- Charts render with actual data from API
- Date range selector changes the chart data
- Empty period → "No data" message (not blank/crash)
- Single chart library used across all pages
- pnpm tsc --noEmit → 0 errors
```

---

### ═══ PROMPT 10 — CSV Export: Transactions, Users, Orders Download Karo ═══

```
Task: Admin ko CSV export deta karo har major listing page par.
      Client-side export for small datasets, server-side streaming for large ones.

Files:
- artifacts/admin/src/pages/transactions.tsx
- artifacts/admin/src/pages/users.tsx
- artifacts/admin/src/pages/orders/index.tsx
- artifacts/admin/src/pages/audit-logs.tsx
- artifacts/admin/src/lib/csvExport.ts (create)
- artifacts/api-server/src/routes/admin/finance.ts
- artifacts/api-server/src/routes/admin/users.ts

PART A — Client-Side CSV Export Utility:

Create artifacts/admin/src/lib/csvExport.ts:

type CsvRow = Record<string, string | number | boolean | null | undefined>;

export function exportToCsv(filename: string, rows: CsvRow[]): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? "";
          const str = String(val);
          // Escape: wrap in quotes if contains comma/newline/quote
          return str.includes(",") || str.includes("\n") || str.includes('"')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

PART B — Transactions Page Export:

In transactions.tsx:
- "Export CSV" button in page header (only visible with finance.transactions.view permission)
- For small exports (≤ 500 rows): use client-side exportToCsv() with current filtered data
- For large exports (> 500 rows): call GET /api/admin/transactions?export=csv
  - This returns a CSV file directly (Content-Type: text/csv)
  - Use: window.location.href = `/api/admin/transactions?export=csv&${currentFilters}`

Columns to export: id, date, userId, userName, type, amount, status, reference

PART C — Users Page Export:

Columns: ajkId, name, phone, email, role, status, createdAt, walletBalance, city

In users.tsx:
- Export only filtered/searched results (respects current search/filter)
- Maximum 1000 rows per export (show warning if more)

PART D — Orders Page Export:

Columns: orderId, date, customerId, customerName, vendorName, items, total, status, deliveredAt

PART E — Audit Logs Export:

Columns: timestamp, adminId, adminName, action, targetType, targetId, ipAddress, details

PART F — Backend: Export Endpoints

In artifacts/api-server/src/routes/admin/finance.ts, add:
GET /api/admin/transactions?export=csv
- Only allowed with finance.transactions.view permission
- Streams CSV response with appropriate headers:
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="transactions_${Date.now()}.csv"`);
- Limit: 10,000 rows max

PART G — Export Button Component:

Create artifacts/admin/src/components/ExportButton.tsx:
Props: { filename: string; data?: CsvRow[]; apiUrl?: string; permission?: string }
- If data provided: client-side export
- If apiUrl provided: redirect to download URL
- Shows loading spinner while generating
- Shows toast: "Downloading transactions_2024-01-15.csv"

Acceptance:
- Transactions page: Export CSV → file downloads with correct columns
- Users page: Export respects active search filter
- Audit logs: Export with date range filter
- Backend export endpoint streams correctly (no memory spike)
- Export button disabled if user lacks required permission
- pnpm tsc --noEmit → 0 errors
```

---

### ═══ PROMPT 11 — Roles & Permissions: Admin RBAC Management ═══

```
Task: /admin/roles-permissions page fully work karo.
      Naye roles create karo, permissions assign karo, admins ko roles deo.

Files:
- artifacts/admin/src/pages/roles-permissions.tsx
- artifacts/api-server/src/routes/admin/auth.ts
- artifacts/api-server/src/routes/admin/users.ts

PART A — Roles List:

GET /api/admin/role-presets → returns existing role presets:
[
  { id: "super", name: "Super Admin", permissions: ["*"] },
  { id: "manager", name: "Manager", permissions: ["users.view", "orders.view", ...] },
  { id: "finance", name: "Finance", permissions: ["finance.transactions.view", ...] },
]

Display as card grid:
- Each role card: name, permission count, assigned admin count
- Edit button: opens edit dialog
- Delete button (only if no admins assigned): shows ConfirmDialog

PART B — Create/Edit Role Dialog:

Fields:
1. Role name (text input)
2. Role slug (auto-generated from name, read-only after creation)
3. Permissions checklist (grouped by category):
   - Operations: orders.view, fleet.rides.view, fleet.pharmacy.view, fleet.parcel.view
   - People: users.view, finance.kyc.view, vendors.view
   - Finance: finance.transactions.view, finance.withdrawals.view, finance.deposits.review
   - Content: content.products.view, promotions.view
   - Communications: support.broadcast.send, support.chat.view
   - System: system.settings.view, system.settings.edit, system.audit.view, system.maintenance, system.roles.manage
4. "Select All" / "Deselect All" per category

On save: POST /api/admin/role-presets { name, slug, permissions: string[] }
On edit: PUT /api/admin/role-presets/:id { name, permissions }

PART C — Admin Users List:

Second section on same page: "Admin Accounts"
GET /api/admin/users?role=admin → list of admin accounts

Columns: name, username, role, lastLoginAt, status (active/suspended)

Actions per row:
- Change role: select dropdown → PATCH /api/admin/users/:id { role: newRole }
- Suspend: PATCH /api/admin/users/:id { status: "suspended" }
- Revoke sessions: POST /api/admin/users/:id/revoke-sessions
- Delete (ConfirmDialog required): DELETE /api/admin/users/:id

PART D — First Login Credentials:

FirstLoginCredentialsDialog.tsx already exists.
Verify it triggers when admin logs in for the first time (no password set yet).
After password set → dialog closes → normal dashboard loads.

PART E — Backend Changes:

In artifacts/api-server/src/routes/admin/auth.ts or system.ts:
Add:
- GET  /api/admin/role-presets
- POST /api/admin/role-presets { name, slug, permissions }
- PUT  /api/admin/role-presets/:id { name, permissions }
- DELETE /api/admin/role-presets/:id (block if assigned admins exist)
- GET  /api/admin/admins (list all admin-role users)
- PATCH /api/admin/admins/:id { role, status }
- POST  /api/admin/admins/:id/revoke-sessions

All endpoints require system.roles.manage permission.

Acceptance:
- Create new "Support" role with only support.chat.view permission
- Assign that role to an admin user
- That admin logs in → only sees support chat nav item
- Delete role → fails if admins assigned (shows error message)
- pnpm tsc --noEmit → 0 errors
```

---

### ═══ PROMPT 12 — Health Dashboard: Sab Checks Green Karein ═══

```
Task: /admin/health-dashboard sab system checks show kare aur sab green hon.
      Missing checks add karo, broken endpoints fix karo.

Files:
- artifacts/admin/src/pages/health-dashboard.tsx
- artifacts/api-server/src/routes/index.ts (health endpoint)

PART A — Health Dashboard Page:

Current health check cards (verify all load correctly):
1. Database Connection: GET /api/health → checks.database.status
2. API Response Time: measure time of /api/health call itself
3. Active Users (online): GET /api/admin/stats/active-users
4. Socket.io Connections: GET /api/admin/stats/socket-connections
5. Storage Usage: GET /api/admin/stats/storage
6. Email/SMS Gateway: GET /api/health → checks.smtp.status, checks.sms.status
7. Pending Queue Jobs: GET /api/admin/stats/queue

For each check card:
- Green: service working normally
- Yellow: degraded (high latency, partial failure)
- Red: service down / unreachable
- Gray: not configured (API key missing)
- Auto-refresh every 30 seconds (setInterval)
- Manual "Refresh All" button

PART B — Health API Endpoint:

In artifacts/api-server/src/routes/index.ts, verify GET /api/health returns:
{
  status: "ok" | "degraded" | "error",
  timestamp: string,
  uptime: number,
  checks: {
    database: { status: "ok" | "error", latencyMs: number },
    redis: { status: "ok" | "error" | "not_configured" },
    smtp: { status: "ok" | "error" | "not_configured" },
    sms: { status: "ok" | "error" | "not_configured" },
    storage: { status: "ok" | "error", usedMb: number, totalMb: number }
  },
  version: string,
  nodeVersion: string,
  environment: string
}

If any check is missing → add it (wrap in try/catch, never crash health endpoint).

PART C — Schema Drift Detection:

GET /api/health/schema-drift → compare DB tables vs Drizzle schema:
Response: {
  status: "ok" | "drift_detected",
  missingTables: string[],
  extraColumns: { table: string, columns: string[] }[],
  missingColumns: { table: string, columns: string[] }[]
}

In health-dashboard.tsx, show schema drift section:
- Green check: "Schema is in sync"
- Warning: List mismatched tables/columns with "Run Migration" button

PART D — Error Monitor Fix:

In artifacts/admin/src/pages/error-monitor.tsx:
Current bug: page stays loading when /api/error-reports returns [].
Fix (from PROMPT 3) should already be applied by this point.

Additional features:
- Filter by: status (open/resolved), severity (error/warning/info)
- Mark as resolved: PATCH /api/error-reports/:id { status: "resolved" }
- Group by error message (collapse duplicates with count badge)
- Show stack trace in expandable code block (monospace font)

PART E — Performance Metrics:

Add to health-dashboard.tsx a "Performance" section:
- Average API response time (last 100 requests)
- Slowest endpoints (top 5)
- DB query count per minute
- Active DB connections

These stats come from: GET /api/admin/stats/performance

If endpoint missing in backend → add it returning sensible defaults.

Acceptance:
- Health page loads without error
- All 7 check cards show status (not blank)
- Empty /api/error-reports → EmptyState shown (not infinite spinner)
- Schema drift section shows "In sync" on fresh migration
- Auto-refresh works (check timestamps update every 30s)
- pnpm tsc --noEmit → 0 errors
```

---

### ═══ PROMPT 13 — Admin Panel: Production Build Optimize Karo ═══

```
Task: Admin panel ka production build optimize karo. Bundle split karo.
      First load time 3 seconds se kam karo.

Files:
- artifacts/admin/vite.config.ts
- artifacts/admin/package.json
- artifacts/admin/src/App.tsx (verify all lazy imports)

PART A — Verify All Page Imports Are Lazy:

In App.tsx, EVERY page import must use React.lazy:
  const Dashboard = lazy(() => import("@/pages/dashboard"));
  const Users = lazy(() => import("@/pages/users"));
  // ... every single page

BAD (will include in main bundle):
  import Dashboard from "@/pages/dashboard";  // ← WRONG

Wrap entire router in Suspense:
  <Suspense fallback={<div className="flex items-center justify-center h-screen">
    <Loader2 className="animate-spin" />
  </div>}>
    <Switch>...</Switch>
  </Suspense>

PART B — Vite Bundle Splitting:

In artifacts/admin/vite.config.ts, add manual chunks:

build: {
  chunkSizeWarningLimit: 1000,
  rollupOptions: {
    output: {
      manualChunks: {
        // Vendor chunks (rarely change)
        "vendor-react": ["react", "react-dom"],
        "vendor-query": ["@tanstack/react-query"],
        "vendor-router": ["wouter"],
        "vendor-radix": [
          "@radix-ui/react-dialog",
          "@radix-ui/react-dropdown-menu",
          "@radix-ui/react-select",
          "@radix-ui/react-tabs",
          "@radix-ui/react-toast",
        ],
        "vendor-charts": ["recharts"],
        "vendor-map": ["leaflet", "react-leaflet"],
        "vendor-icons": ["lucide-react"],

        // Feature chunks (change with feature work)
        "pages-operations": [
          "./src/pages/orders/index.tsx",
          "./src/pages/rides.tsx",
          "./src/pages/pharmacy.tsx",
        ],
        "pages-finance": [
          "./src/pages/transactions.tsx",
          "./src/pages/Withdrawals.tsx",
          "./src/pages/DepositRequests.tsx",
        ],
        "pages-analytics": [
          "./src/pages/analytics.tsx",
          "./src/pages/revenue-analytics.tsx",
          "./src/pages/search-analytics.tsx",
        ],
      },
    },
  },
}

PART C — Asset Optimization:

Add to vite.config.ts:

plugins: [
  react(),
  // Split CSS per chunk
  {
    name: "split-css",
    apply: "build",
  },
],

build: {
  cssCodeSplit: true,
  minify: "esbuild",
  sourcemap: false,          // Disable in production (reduces bundle size)
  target: "es2020",
}

PART D — Bundle Analysis:

Add to artifacts/admin/package.json:
  "analyze": "vite build --mode analyze && npx vite-bundle-visualizer"

Install: pnpm add -D rollup-plugin-visualizer

Add plugin to vite.config.ts (only in analyze mode):
  import { visualizer } from "rollup-plugin-visualizer";
  plugins: [
    react(),
    process.env.ANALYZE && visualizer({ open: true, filename: "bundle-stats.html" }),
  ].filter(Boolean)

PART E — Leaflet Asset Fix:

Confirm UniversalMap.tsx Leaflet icon fix is production-safe:
  import L from "leaflet";
  import iconUrl from "leaflet/dist/images/marker-icon.png";
  import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
  import shadowUrl from "leaflet/dist/images/marker-shadow.png";
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

This MUST use Vite's asset import (not string paths) for production builds.
If currently using string paths like "/leaflet/..." → fix to import syntax.

PART F — Preload Critical Routes:

In App.tsx, after initial render, preload high-traffic pages:
  useEffect(() => {
    // Preload most-visited pages in background
    const preload = () => {
      import("@/pages/orders/index");
      import("@/pages/users");
      import("@/pages/dashboard");
    };
    // Delay 2s so initial render is not blocked
    const t = setTimeout(preload, 2000);
    return () => clearTimeout(t);
  }, []);

Acceptance:
- pnpm build → 0 errors, 0 warnings about chunk sizes
- Initial bundle < 300KB gzipped (main chunk only)
- All pages load via lazy import (check Network tab — separate chunks)
- Leaflet map renders correctly in production build
- pnpm analyze → bundle-stats.html shows clean split
```

---

### ═══ PROMPT 14 — TypeScript Strict Mode: Zero Any Types ═══

```
Task: Admin panel mein TypeScript strict mode enable karo.
      Sab any types hato, missing return types add karo.

Files:
- artifacts/admin/tsconfig.json
- artifacts/admin/src/ (all .ts and .tsx files)

PART A — tsconfig.json Strict Mode:

Update artifacts/admin/tsconfig.json:
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "forceConsistentCasingInFileNames": true,
    "useUnknownInCatchVariables": true
  }
}

PART B — Fix any Types in Key Files:

1. artifacts/admin/src/lib/adminFetcher.tsx:
   Replace: catch (e: any) → catch (e: unknown)
   Add: if (e instanceof Error) { message = e.message; }

2. artifacts/admin/src/lib/adminAuthContext.tsx:
   Replace: any in state type definitions
   Define: AdminUser interface with all required fields
   interface AdminUser {
     id: string;
     username: string;
     name: string;
     role: string;
     permissions: string[];
     email?: string;
   }

3. artifacts/admin/src/lib/api.ts:
   All remaining functions should have explicit return types
   (This file should be mostly empty after PROMPT 1)

4. artifacts/admin/src/pages/*.tsx:
   Add explicit types for:
   - useState: useState<string>("") not useState("")
   - API response types: import from adminApiTypes.ts
   - Event handlers: (e: React.ChangeEvent<HTMLInputElement>) => void

5. artifacts/admin/src/lib/adminApiTypes.ts:
   Verify ALL API response types are defined here.
   Missing types to add:
   interface AdminStats {
     totalUsers: number;
     totalOrders: number;
     totalRevenue: number;
     activeRiders: number;
     pendingWithdrawals: number;
   }
   interface AdminOrder {
     id: string;
     customerId: string;
     customerName: string;
     vendorId: string;
     vendorName: string;
     status: string;
     total: number;
     createdAt: string;
     items: AdminOrderItem[];
   }
   // Add for: AdminUser, AdminRider, AdminVendor, AdminTransaction,
   //          AdminKycRecord, AdminWithdrawal, AdminDepositRequest

PART C — React Component Return Types:

All page components must have explicit return type:
  export default function Dashboard(): JSX.Element { ... }
  // NOT: export default function Dashboard() { ... }

All hook functions:
  function usePermissions(): PermissionContext { ... }

PART D — Drizzle Any Type Exceptions:

For Drizzle dynamic query patterns that legitimately need any:
Add eslint-disable comment with explanation:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: SQL<unknown>[] = []; // Drizzle dynamic where conditions

PART E — Run TypeCheck:

After all fixes:
  cd artifacts/admin && pnpm tsc --noEmit 2>&1 | tail -20

Target: 0 errors.

Acceptance:
- pnpm tsc --noEmit in artifacts/admin → 0 errors
- No catch (e: any) in any file
- All useState have explicit type annotations
- All page exports have return type JSX.Element
- All API responses typed via adminApiTypes.ts
```

---

### ═══ PROMPT 15 — CORS & Environment: Production Config Fix ═══

```
Task: CORS warning fix karo. ALLOWED_ORIGINS set karo.
      Admin panel aur API server dono production mein theek kaam karein.

Files:
- artifacts/api-server/src/app.ts
- .env (or Replit environment secrets)

PART A — CORS Issue:

Current warning in logs:
"[SECURITY:CORS] ALLOWED_ORIGINS is not set — using localhost-only whitelist"

Fix: ALLOWED_ORIGINS environment variable set karo.

In Replit environment secrets (use environment-secrets skill):
Key: ALLOWED_ORIGINS
Value: https://YOUR-REPLIT-DOMAIN.replit.dev,http://localhost:3000,http://localhost:5000

For Replit deployment (production):
Value: https://YOUR-APP.replit.app,https://YOUR-APP-admin.replit.app

PART B — Admin App API Base URL:

In artifacts/admin/src/lib/adminFetcher.tsx:
Current: uses window.location.origin (same-origin assumption)
Problem: In production, admin (port 3000) and API (port 5000) are different origins.

Fix:
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
// Empty string = same origin (reverse proxy handles it)
// Set VITE_API_BASE_URL only when admin and API are on different domains

In Replit: both run behind same reverse proxy → empty string is correct.
In external production: set VITE_API_BASE_URL=https://api.yourdomain.com

PART C — Verify Replit Reverse Proxy:

In artifacts/api-server/src/app.ts, verify the reverse proxy routing for admin:
- Requests to /*.replit.dev:5000/admin/* → served by admin Vite app
- Requests to /*.replit.dev:5000/api/* → handled by Express API

If admin is served via separate port 3000:
- ALLOWED_ORIGINS must include the admin origin
- In dev: http://localhost:3000 must be in ALLOWED_ORIGINS

PART D — Environment Validation:

In artifacts/admin/src/lib/envValidation.ts, verify these are checked on startup:
- VITE_API_BASE_URL: optional, if set must be valid URL
- VITE_SENTRY_DSN: optional
- VITE_APP_VERSION: optional, defaults to package.json version

In artifacts/api-server/src/index.ts, on startup:
Log: { allowedOrigins, nodeEnv, port, dbConnected } as startup summary
Never log raw secret values — only log that they're present: jwtSecret: "SET" | "MISSING"

PART E — Production Safety Checklist:

Add startup check in artifacts/api-server/src/index.ts:
const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET"];
const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  logger.fatal({ missingVars }, "Missing required environment variables");
  process.exit(1);
}

// Warn about optional-but-recommended vars
const recommendedVars = ["ALLOWED_ORIGINS", "SENTRY_DSN", "REDIS_URL"];
const missingRecommended = recommendedVars.filter((v) => !process.env[v]);
if (missingRecommended.length > 0) {
  logger.warn({ missingRecommended }, "Recommended env vars not set — some features disabled");
}

Acceptance:
- No CORS warning in API server logs
- Admin panel makes API calls without CORS error in browser console
- Missing JWT_SECRET → server exits with clear error (not silent fail)
- pnpm tsc --noEmit → 0 errors in api-server workspace
```

---

### ═══ PROMPT 16 — Final Verification: Full Admin Panel Production Checklist ═══

```
Task: Sab prompts (1-15) ke baad admin panel ka complete verification karo.
      Har feature manually test karo. Sab kuch production-ready confirm karo.

─── A. AUTH & SESSION CHECKS ───

1. /admin/login → login screen loads correctly
2. Wrong password → error message appears (not blank)
3. Correct credentials → dashboard loads
4. Wait 15 minutes → auto-refresh token (no logout)
5. Open new tab → session shared (no re-login needed)
6. Logout → redirected to /admin/login, token cleared
7. Back button after logout → /admin/login (not dashboard)
8. Incorrect TOTP (if enabled) → error, not login

─── B. RBAC & PERMISSIONS CHECKS ───

9. Super admin → all nav items visible
10. Finance-role admin → only finance pages visible
11. Visit /admin/users with no users.view permission → 403 page
12. ProtectedRoute component blocks unauthorized access
13. Create new role "Support" → assign support.chat.view → login → only chat visible
14. legacyToken = false for all new logins (perms claim in JWT)

─── C. OPERATIONS PAGES ───

15. /admin/orders → table loads with pagination
16. Order detail modal → all fields filled (no "undefined")
17. PATCH order status → toast → row updates in-place
18. /admin/rides → table loads with OTP status, parcel badge
19. /admin/riders → table loads with status badges
20. /admin/kyc → 3 document photos load (ID front/back + selfie)
21. KYC approve → ConfirmDialog → API call → status updates
22. /admin/live-riders-map → map renders, markers visible

─── D. FINANCE PAGES ───

23. /admin/transactions → table loads with correct amount values (no NaN)
24. Export CSV → file downloads with correct columns
25. /admin/deposit-requests → approve → ConfirmDialog → API → status updates
26. /admin/withdrawals → reject with note → toast → row updates
27. /admin/wallet-transfers → table loads correctly

─── E. SETTINGS PAGES ───

28. /admin/settings → all 8 tabs load
29. Change app name → Save → toast "Settings saved"
30. Change payment limits → Save → API call made → toast
31. API key field → shows masked value → type new key → saves new key (not masked)
32. NavigationGuard → unsaved changes → navigate away → "You have unsaved changes" dialog

─── F. REAL-TIME FEATURES ───

33. Disconnect network → red banner appears in AdminLayout
34. Reconnect network → banner disappears
35. New SOS → badge number on SOS nav item increments
36. Visit /admin/sos-alerts → badge resets to 0
37. Order status change → row updates on /admin/orders without page refresh

─── G. ERROR & LOADING STATES ───

38. /admin/error-monitor with no errors → EmptyState shown (not infinite spinner)
39. API server down → all pages show ErrorRetry component (not blank)
40. Click "Retry" on ErrorRetry → re-fetches data
41. /admin/health-dashboard → all check cards show status (not blank)
42. Network error on save → toast shows specific error message

─── H. BULK ACTIONS ───

43. Users page: select 5 users → ActionBar appears → "Ban Selected"
44. ConfirmDialog → "Ban 5 Users?" → confirm → API call → toast
45. Orders page: select 3 orders → "Export CSV" → file downloads
46. Cancel bulk action → deselects all, ActionBar disappears

─── I. PRODUCTION BUILD ───

47. cd artifacts/admin && pnpm build → exits 0, no errors
48. Build output: multiple chunks (no single 5MB bundle)
49. Initial bundle < 300KB gzipped
50. Leaflet icons load correctly in production build (not broken images)

─── J. TYPESCRIPT CHECKS ───

51. cd artifacts/admin && pnpm tsc --noEmit → 0 errors
52. cd artifacts/api-server && pnpm tsc --noEmit → 0 errors
53. grep -r "from \"@/lib/api\"" artifacts/admin/src/ → 0 results (legacy bridge gone)
54. grep -r "catch (e: any)" artifacts/admin/src/ → 0 results

─── K. BROWSER CONSOLE CHECKS ───

55. Open /admin/dashboard → Browser DevTools console → 0 red errors
56. No "Radix UI" aria warnings in console
57. No "Cannot update state on unmounted component" warnings
58. No "Each child should have unique key" warnings
59. No failed network requests (all API calls succeed or show error UI)
60. No CORS errors in Network tab

─── L. MOBILE RESPONSIVENESS ───

61. Open admin on 375px width (iPhone SE) → sidebar collapses to drawer
62. MobileDrawer opens/closes on hamburger click
63. Tables scroll horizontally on small screens
64. Dialogs are centered and not cut off on mobile

─── FINAL STATUS ───

After all 64 checks pass:
- Admin Panel is fully production-ready ✅
- Zero bugs on any tested flow ✅
- All 50+ pages load and work correctly ✅
- Real-time features work (Socket.io connected) ✅
- TypeScript 0 errors in all workspaces ✅
```

---

## 🚀 Execution Order

| Step | Prompt | Area | Priority | Est. Time |
|------|--------|------|----------|-----------|
| 1 | Legacy API Bridge Migration | Auth / DX | 🔴 High | 30 min |
| 2 | Auth Session Hardening | Security | 🔴 High | 40 min |
| 3 | Error/Loading States (all pages) | UX / Bugs | 🔴 High | 60 min |
| 4 | Finance: Approve/Reject Actions | Feature | 🔴 High | 45 min |
| 5 | Bulk Actions + Confirmations | UX | 🟡 Medium | 45 min |
| 6 | Settings Tabs: Save All | Feature | 🔴 High | 50 min |
| 7 | Socket.io Reconnection + Badges | Real-time | 🟡 Medium | 40 min |
| 8 | Products & KYC Image Viewer | UX | 🟡 Medium | 35 min |
| 9 | Analytics Charts | Feature | 🟡 Medium | 50 min |
| 10 | CSV Export | Feature | 🟡 Medium | 45 min |
| 11 | Roles & Permissions RBAC | Feature | 🟡 Medium | 60 min |
| 12 | Health Dashboard | Monitoring | 🟡 Medium | 40 min |
| 13 | Production Build Optimization | Performance | 🟡 Medium | 35 min |
| 14 | TypeScript Strict Mode | Code Quality | 🟢 Low | 50 min |
| 15 | CORS & Environment Config | Security | 🔴 High | 20 min |
| 16 | Final Verification Checklist | All | — | 45 min |

**Total estimated time: ~9.5 hours**

---

## ⚠️ Important Notes

1. **artifacts/ajkmart/** — READ ONLY. Is folder mein koi bhi changes mat karo.

2. **artifacts/api-server/src/routes/auth.ts** — DO NOT MODIFY.
   All auth changes go to `admin/auth.ts` or new files only.

3. **Drizzle ORM `as any`** — Drizzle ke dynamic query patterns legitimately need `any`.
   Add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with explanation.
   Mass-disable mat karo.

4. **Settings API Keys** — Never re-send masked values (`●●●●`) to backend.
   Track `hasNewValue: boolean` for each sensitive field.
   Only send if user typed a new value.

5. **Socket.io Room Names** — Consistent room names:
   - Admin fleet: `"admin-fleet"`
   - Admin orders: `"admin-orders"`
   - Admin support: `"admin-support"`
   - User room: `"user:${userId}"`

6. **CSV Export Limit** — Client-side: max 500 rows. Server-side: max 10,000 rows.
   Show warning if user tries to export more.

7. **Confirmation Dialogs** — Every destructive action (delete, ban, bulk-ban, reject)
   must have ConfirmDialog. Non-destructive (approve, export) may skip dialog.

8. **Toast Notifications** — All mutations must show:
   - Success: green toast with action description
   - Error: red toast with specific error message (not generic "error occurred")

9. **ALLOWED_ORIGINS** — In production, set this to your actual domain.
   Never leave it as localhost in production environment.

10. **Test After Each Prompt** — Har prompt ke baad ye manually verify karo:
    - Page loads without crash
    - pnpm tsc --noEmit → 0 errors
    - No red errors in browser console
    Then proceed to next prompt.

---

## 🔐 Security Summary (Admin Panel Specific)

| Protection | Implementation |
|-----------|---------------|
| In-memory JWT (no localStorage) | adminAuthContext.tsx stores token in memory only |
| HTTP-only cookie for refresh | Server sets `httpOnly; SameSite=Strict` on refresh token |
| CSRF protection | X-CSRF-Token header on all mutations |
| Auto token refresh | 60s before expiry, proactive refresh |
| Session check on tab focus | Detects externally revoked sessions |
| Permission gating | `ProtectedRoute` + `PermissionGate` + backend `requirePermission` |
| Confirmation dialogs | All destructive actions require explicit confirm |
| Audit logging | All admin mutations logged with adminId + IP |
| Rate limiting | Admin action limiter: 100/10min per adminId |
| CORS lockdown | ALLOWED_ORIGINS whitelist — no wildcard |
