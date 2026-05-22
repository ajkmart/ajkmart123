# AJKMart — Complete Quality, Performance & Production Readiness Plan

## Overview
Yeh document AJKMart Super App ke **Testing**, **Developer Experience**, **Performance**,
**Security**, **Observability**, **Feature Completeness**, aur **Code Quality** ke liye
ek mukammal improvement plan hai.

Har prompt ek independent kaam hai — sequentially execute karna hai.
Is plan ko implement karne ke baad app production-grade ban jati hai.

---

## 🔍 Current State — Project Structure

### Monorepo Layout

```
/
├── artifacts/
│   ├── api-server/          # Express 5 + TypeScript backend (port 5000)
│   ├── admin/               # React + Vite admin panel (port 3000)
│   ├── vendor-app/          # React + Vite vendor portal (port 3001)
│   ├── rider-app/           # React + Vite rider app (port 3002)
│   └── ajkmart/             # Expo React Native customer app (port 3003) ← READ ONLY
├── lib/
│   ├── db/                  # Drizzle ORM schema + migrations (@workspace/db)
│   ├── i18n/                # Multi-language support (@workspace/i18n)
│   ├── auth-utils/          # Shared auth helpers (@workspace/auth-utils)
│   ├── auth-react/          # Shared React auth components (@workspace/auth-react)
│   ├── api-client-react/    # API client + React Query hooks (@workspace/api-client-react)
│   └── ui/                  # Shared Radix UI components (@workspace/ui)
└── package.json             # pnpm workspace root
```

### Tech Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| **Backend** | Express 5 + TypeScript | Express 5.x |
| **Database** | PostgreSQL + Drizzle ORM | Drizzle 0.30+ |
| **Mobile** | Expo React Native + NativeWind | Expo SDK 52 |
| **Web Apps** | React 19 + Vite 6 | React 19 |
| **State** | TanStack Query (React Query) | v5 |
| **Validation** | Zod | v3 |
| **Auth** | JWT + OTP + TOTP + Social | Custom |
| **Realtime** | Socket.io | v4 |
| **Logging** | Pino | v9 |
| **Testing** | — (not yet set up) | — |

### What Is Already Complete

| Area | Status |
|------|--------|
| Auth system (OTP, JWT, TOTP, Magic Link, Social) | ✅ Complete |
| DB schema (105+ tables, all exported) | ✅ Complete |
| TypeScript (0 errors across all 10 workspaces) | ✅ Complete |
| Role-based middleware (customerAuth, riderAuth, vendorAuth, adminAuth) | ✅ Complete |
| Rate limiting on auth routes | ✅ Complete |
| Structured logging with Pino | ✅ Complete |
| Pull-to-refresh on all web apps | ✅ Complete |
| Ride OTP + parcel support + event timestamps | ✅ Complete |
| Categories (dynamic, DB-driven) | ✅ Complete |
| Wishlist + Product Reviews + Image Gallery | ✅ Complete |

### What This Plan Covers

| Section | Area | Priority |
|---------|------|----------|
| A | Testing Layer | 🔴 High |
| B | Developer Experience (DX) | 🟡 Medium |
| C | Performance & Production Readiness | 🔴 High |
| D | Security Enhancements | 🔴 High |
| E | Observability | 🟡 Medium |
| F | Feature Completeness | 🟡 Medium |
| G | Code Quality Automation | 🟢 Low |

---

## ⚙️ Key Files & Entry Points

### API Server

| File | Purpose |
|------|---------|
| `artifacts/api-server/src/index.ts` | Server entry — port binding, graceful shutdown |
| `artifacts/api-server/src/app.ts` | Express app setup — middleware chain |
| `artifacts/api-server/src/routes/index.ts` | Root router — mounts all sub-routers |
| `artifacts/api-server/src/middleware/security.ts` | JWT verify, requireRole, rate limits |
| `artifacts/api-server/src/lib/logger.ts` | Pino logger instance |
| `artifacts/api-server/src/lib/socketio.ts` | Socket.io server + room management |

### Shared Libraries

| Package | Key Exports |
|---------|------------|
| `@workspace/db` | `db` instance, all table exports from schema/index.ts |
| `@workspace/db/schema` | 105+ table definitions (Drizzle pgTable) |
| `@workspace/i18n` | `t()`, `tDual()`, `isRTL()`, translation keys |
| `@workspace/auth-utils` | JWT helpers, captcha, magic-link, 2FA components |
| `@workspace/auth-react` | OtpInput, PhoneInput, OtpTimer, SharedAuthProvider |
| `@workspace/ui` | Button, Input, Dialog, Sheet, Card, Badge, etc. |

---

## 📋 IMPLEMENTATION PLAN — Step by Step Prompts

---

### ═══ PROMPT 1 — Testing: Unit Tests for Core Services ═══

```
Task: Set up Vitest and write unit tests for core backend services.

Setup:
- Package: vitest, @vitest/coverage-v8, supertest, @types/supertest
- Config: artifacts/api-server/vitest.config.ts
- Test folder: artifacts/api-server/src/__tests__/unit/

Files to test:

1. artifacts/api-server/src/lib/fireAndForget.ts
   Tests:
   - fireAndForget executes async function
   - fireAndForget catches errors without throwing (non-fatal)
   - fireAndForget logs error with correct code label
   - fireAndForget with null logger (no crash)

2. artifacts/api-server/src/services/password.ts
   Tests:
   - hashPassword() returns bcrypt hash (60-char $2b$ prefix)
   - verifyPassword() returns true for correct password
   - verifyPassword() returns false for wrong password
   - validatePasswordStrength() rejects password < 8 chars
   - validatePasswordStrength() rejects no uppercase
   - validatePasswordStrength() rejects no number
   - validatePasswordStrength() accepts strong password
   - generateSecureOtp() returns 6 digits
   - generateSecureOtp() is always numeric string

3. artifacts/api-server/src/services/auth/tokenRotation.ts
   Tests:
   - rotateRefreshToken() returns new token + marks old as used
   - invalidateTokenFamily() revokes all tokens in a family
   - invalidateTokenFamily() returns count of invalidated tokens

4. artifacts/api-server/src/middleware/security.ts
   Tests:
   - signAccessToken() returns valid JWT
   - verifyUserJwt() returns payload for valid token
   - verifyUserJwt() returns null for expired token
   - verifyUserJwt() returns null for tampered signature
   - hashRefreshToken() is deterministic (same input → same output)
   - blacklistJti() prevents reuse of the same JTI

5. artifacts/api-server/src/lib/id.ts
   Tests:
   - generateId() returns non-empty string
   - generateId() is unique across 10,000 calls (no collision)
   - generateId() matches expected format (timestamp36 + 16 hex chars)

vitest.config.ts:
{
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json"],
      thresholds: { lines: 80, functions: 80, branches: 70 }
    }
  }
}

package.json scripts:
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"

Acceptance: `pnpm test` passes. Coverage report generated. 0 failing tests.
```

---

### ═══ PROMPT 2 — Testing: Integration Tests for Auth Endpoints ═══

```
Task: Write integration tests for all critical auth endpoints using supertest.

Setup:
- Package: supertest, @types/supertest (already in PROMPT 1)
- Test DB: Use separate TEST_DATABASE_URL env var
- Test folder: artifacts/api-server/src/__tests__/integration/auth/

Test helper (test-app.ts):
- Import Express app (without starting server)
- Run migrations on test DB before all tests
- Truncate relevant tables between tests
- Export: { app, db, closeDb }

Integration tests to write:

1. phone.routes.test.ts — POST /auth/send-otp
   - Returns 200 + { channel } for valid phone
   - Returns 400 for invalid phone format (abc, 12345)
   - Returns 429 after > 5 requests in window (rate limit)
   - OTP stored in otp_tokens table (hashed, not plaintext)
   - devCode NOT present in response (ALLOW_DEV_OTP not set)

2. phone.routes.test.ts — POST /auth/verify-otp
   - Returns 200 + { accessToken, user } for correct OTP
   - Returns 422 for wrong OTP
   - Returns 422 for expired OTP (manually expire row)
   - Returns 422 for already-used OTP (replay attack)
   - OTP marked as used_at after first successful verify

3. password.test.ts — POST /auth/forgot-password
   - Returns 200 (same message) for UNKNOWN identifier (anti-enumeration)
   - Returns 200 for valid phone/email
   - OTP row created in otp_tokens with type="reset"
   - Returns 429 after rate limit exceeded

4. password.test.ts — POST /auth/reset-password
   - Returns 200 after valid OTP verify → reset flow
   - Returns 401 for already-used resetToken (single-use JWT JTI)
   - Returns 401 for expired resetToken
   - tokenVersion incremented in users table after reset
   - All refresh_tokens for user revoked after reset

5. magic-link.test.ts — POST /auth/magic-link/send + verify
   - Token stored as SHA-256 hash in magic_link_tokens (not plaintext)
   - Verify returns 200 + accessToken
   - Second verify of same token returns 401 (single-use)
   - Expired token returns 401

6. register.test.ts — POST /auth/register
   - Creates user with AJK-XXXXXX format ajkId
   - rider role creates row in rider_profiles table
   - vendor role creates row in vendor_profiles table
   - Duplicate phone returns 409
   - Weak password returns 400 with strength message

Environment variables for tests:
  TEST_DATABASE_URL=postgresql://...
  JWT_SECRET=test-secret-minimum-32-characters-here
  ALLOW_DEV_OTP=false
  NODE_ENV=test

Acceptance: All integration tests pass against test DB.
            otp_tokens never contains plaintext OTPs.
```

---

### ═══ PROMPT 3 — Testing: React Component Tests ═══

```
Task: Set up React Testing Library for Admin and Vendor App component tests.

Setup:
- Packages: @testing-library/react, @testing-library/user-event,
            @testing-library/jest-dom, vitest, jsdom
- Config: artifacts/admin/vitest.config.ts (environment: "jsdom")
- Test folder: artifacts/admin/src/__tests__/

Components to test:

1. artifacts/admin/src/components/PullToRefresh.tsx
   - Renders children correctly
   - Shows spinner on pull gesture (simulate touchstart/touchmove/touchend)
   - Calls onRefresh when pulled far enough (>60px threshold)
   - "Last updated" timestamp is visible after refresh

2. artifacts/admin/src/components/ui/dialog.tsx
   - Dialog opens when trigger is clicked
   - Dialog closes when X button is clicked
   - aria-label="Close dialog" present on close button
   - aria-describedby={undefined} → no Radix console warning

3. artifacts/admin/src/pages/categories.tsx (shallow)
   - Renders category tree when API returns data
   - Shows "No categories" empty state when list is empty
   - Type filter tabs (mart/food/pharmacy) are clickable
   - Add Category button renders

4. artifacts/vendor-app/src/components/PullToRefresh.tsx
   - Renders children
   - Orange accent color applied (vendor theme)

Mock setup (src/__tests__/setup.ts):
  import "@testing-library/jest-dom";
  vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
  vi.mock("../lib/api", () => ({ apiFetch: vi.fn() }));

vitest.config.ts for React apps:
{
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/__tests__/setup.ts"],
    css: false
  }
}

Acceptance: All component tests pass. No real API calls in tests (mocked).
            Coverage for components > 60%.
```

---

### ═══ PROMPT 4 — Testing: E2E Tests with Playwright ═══

```
Task: Set up Playwright for E2E tests covering critical user flows.

Setup:
- Package: @playwright/test (root devDependency)
- Config: playwright.config.ts (root level)
- Test folder: e2e/

playwright.config.ts:
{
  projects: [
    { name: "admin",  use: { baseURL: "http://localhost:3000/admin"  } },
    { name: "vendor", use: { baseURL: "http://localhost:3001/vendor"  } },
    { name: "rider",  use: { baseURL: "http://localhost:3002/rider"   } }
  ],
  webServer: [
    { command: "pnpm --filter artifacts/admin dev",      port: 3000 },
    { command: "pnpm --filter artifacts/vendor-app dev", port: 3001 },
    { command: "pnpm --filter artifacts/rider-app dev",  port: 3002 }
  ],
  use: {
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure"
  }
}

E2E test files:

1. e2e/admin/login.spec.ts
   - Load /admin → login screen renders
   - Submit wrong password → error message appears
   - Submit correct credentials → dashboard loads
   - Click "Forgot Password" → forgot screen appears
   - Dashboard has sidebar navigation visible

2. e2e/admin/dashboard.spec.ts
   - Stats cards render (Total Users, Orders, Revenue, Riders)
   - Navigation to /admin/users → users table loads
   - Navigation to /admin/orders → orders table loads
   - Pull-to-refresh: drag page down → spinner → content refreshes

3. e2e/vendor/login.spec.ts
   - Load /vendor → login screen renders
   - Tab to "Phone OTP" → phone input visible
   - Tab to "Password" → identifier + password inputs visible
   - Successful login → dashboard loads
   - Logout → redirected to /vendor login

4. e2e/vendor/orders.spec.ts
   - Orders page loads with tabs (Pending/Active/Completed)
   - Filter by tab → list updates
   - Order card shows: ID, amount, customer name, status badge

5. e2e/rider/login.spec.ts
   - Load /rider → login screen renders
   - Phone OTP tab shows phone input
   - Home screen loads after login (map/available toggle visible)

6. e2e/admin/categories.spec.ts
   - /admin/categories → category tree renders
   - Click "Add Category" → dialog opens
   - Fill name + select type → Save → new category appears in tree
   - Delete category → confirmation dialog → item removed

Shared test helpers (e2e/helpers/auth.ts):
  async function loginAdmin(page, { username, secret })
  async function loginVendor(page, { phone, otp })
  async function loginRider(page, { phone, otp })

Acceptance: All E2E tests pass against local dev servers.
            Screenshots stored in e2e/artifacts/ on failure.
```

---

### ═══ PROMPT 5 — DX: Pre-commit Hooks (Husky + lint-staged) ═══

```
Task: Set up pre-commit hooks to prevent broken code from being committed.

Packages to install (root devDependencies):
  husky, lint-staged

Setup steps:

1. package.json (root) — add scripts:
   {
     "prepare": "husky",
     "lint-staged": {
       "artifacts/api-server/src/**/*.ts": [
         "node_modules/.bin/tsc -p artifacts/api-server/tsconfig.json --noEmit",
         "node_modules/.bin/eslint --max-warnings 0"
       ],
       "artifacts/admin/src/**/*.{ts,tsx}": [
         "node_modules/.bin/tsc -p artifacts/admin/tsconfig.json --noEmit",
         "node_modules/.bin/eslint --max-warnings 0"
       ],
       "artifacts/rider-app/src/**/*.{ts,tsx}": [
         "node_modules/.bin/tsc -p artifacts/rider-app/tsconfig.json --noEmit",
         "node_modules/.bin/eslint --max-warnings 0"
       ],
       "artifacts/vendor-app/src/**/*.{ts,tsx}": [
         "node_modules/.bin/tsc -p artifacts/vendor-app/tsconfig.json --noEmit",
         "node_modules/.bin/eslint --max-warnings 0"
       ],
       "lib/**/*.{ts,tsx}": [
         "node_modules/.bin/eslint --max-warnings 0"
       ],
       "**/*.{json,md}": ["prettier --write"]
     }
   }

2. .husky/pre-commit:
   #!/usr/bin/env sh
   . "$(dirname -- "$0")/_/husky.sh"
   npx lint-staged

3. .husky/pre-push:
   #!/usr/bin/env sh
   . "$(dirname -- "$0")/_/husky.sh"
   pnpm typecheck:all

4. Root package.json — typecheck:all script:
   "typecheck:all": "concurrently
     'tsc -p lib/db/tsconfig.json --noEmit'
     'tsc -p lib/i18n/tsconfig.json --noEmit'
     'tsc -p lib/auth-utils/tsconfig.json --noEmit'
     'tsc -p lib/auth-react/tsconfig.json --noEmit'
     'tsc -p lib/api-client-react/tsconfig.json --noEmit'
     'tsc -p artifacts/api-server/tsconfig.json --noEmit'
     'tsc -p artifacts/admin/tsconfig.json --noEmit'
     'tsc -p artifacts/rider-app/tsconfig.json --noEmit'
     'tsc -p artifacts/vendor-app/tsconfig.json --noEmit'"

5. Prettier config (.prettierrc):
   {
     "semi": true,
     "singleQuote": false,
     "tabWidth": 2,
     "trailingComma": "es5",
     "printWidth": 100
   }

Acceptance: `git commit` with TS error → commit blocked.
            `git commit` with clean file → proceeds normally.
            `git push` triggers full typecheck across all workspaces.
```

---

### ═══ PROMPT 6 — DX: Shared Library READMEs + JSDoc ═══

```
Task: Add README.md and JSDoc comments to all shared libraries.

Files to create:

1. lib/db/README.md
   Content sections:
   - Overview: PostgreSQL + Drizzle ORM, 105+ tables
   - Setup: DATABASE_URL env var, drizzle-kit push
   - Schema structure: lib/db/src/schema/ (one file per table)
   - Migration workflow: pnpm db:push, pnpm db:generate, pnpm db:migrate
   - Usage example: import { db, usersTable } from "@workspace/db"
   - Table categories (auth, commerce, rides, wallet, admin, content)
   - Foreign key conventions (onDelete: cascade vs set null)

2. lib/i18n/README.md
   Content sections:
   - Supported languages: English, Urdu, Roman Urdu, Dual modes
   - Usage: t("key", lang), tDual("key", lang), isRTL(lang)
   - Adding new keys: edit lib/i18n/src/index.ts, add to all 3 sections
   - Translation key naming convention (camelCase)

3. lib/auth-utils/README.md
   Content sections:
   - Server helpers: isAuthMethodEnabled(), isAuthMethodEnabledStrict()
   - Web components: TwoFactorSetup, TwoFactorVerify, MagicLinkSender
   - Native (Expo): CaptchaModal, useGoogleLoginNative, useFacebookLoginNative
   - JWT helpers: signAccessToken, verifyUserJwt, sign2faChallengeToken
   - Required env vars: RECAPTCHA_SITE_KEY, GOOGLE_CLIENT_ID, FACEBOOK_APP_ID

4. lib/auth-react/README.md
   Content sections:
   - Components: OtpInput, PhoneInput, OtpTimer
   - Provider: SharedAuthProvider (wraps React Query + AuthContext)
   - Usage across Admin, Vendor, Rider apps

5. lib/api-client-react/README.md
   Content sections:
   - Auto-generated hooks from OpenAPI spec (Orval codegen)
   - Manual additions in discovery.ts (wishlist, reviews, categories)
   - Build step: pnpm build (generates dist/index.d.ts)
   - Usage: import { getWishlist, addToWishlist } from "@workspace/api-client-react"

JSDoc to add (key functions):

artifacts/api-server/src/lib/fireAndForget.ts:
/**
 * Executes an async operation in the background without blocking the caller.
 * Errors are caught and logged — the calling request continues regardless.
 *
 * @param promise - The async operation to execute
 * @param label   - Identifier used in error logs (e.g. "auth:webhook:registered")
 * @param logger  - Pino logger instance
 * @param meta    - Optional metadata added to error log (userId, code, etc.)
 */

artifacts/api-server/src/middleware/security.ts (signAccessToken):
/**
 * Signs a short-lived access JWT for a user.
 *
 * @param userId    - The user's database ID
 * @param phone     - Canonical phone number (for payload identification)
 * @param role      - Primary role: "customer" | "rider" | "vendor"
 * @param roles     - All comma-separated roles the user holds
 * @param tokenVersion - Incremented on password change to invalidate old tokens
 * @returns Signed JWT string (TTL from platform_settings or 15m default)
 */

lib/db/src/schema/index.ts — top-level block comment:
/**
 * @workspace/db schema barrel export.
 * Every table in lib/db/src/schema/ is re-exported here.
 * Import tables: import { usersTable, ordersTable } from "@workspace/db/schema"
 * Import db:     import { db } from "@workspace/db"
 * Total tables: 105+
 */

Acceptance: All 5 READMEs exist. Key functions have JSDoc.
            `pnpm tsc --noEmit` still passes (JSDoc does not break types).
```

---

### ═══ PROMPT 7 — Performance: API Compression + Rate Limiting ═══

```
Task: Add response compression and global rate limiting to the API server.

Files:
- artifacts/api-server/src/app.ts
- artifacts/api-server/src/middleware/rate-limit.ts (already exists — extend)

PART A — Response Compression:

Package: compression, @types/compression

Add to app.ts BEFORE all route middleware:
  import compression from "compression";
  app.use(compression({
    level: 6,                       // zlib level 6 (balanced speed/ratio)
    threshold: 1024,                // Skip compression for < 1KB responses
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    }
  }));

Expected results:
  - JSON API responses compressed ~70% (from ~50KB to ~15KB)
  - Images/binary responses: NOT compressed (already binary)
  - Health check endpoint: skipped (< 1KB)

PART B — Global Rate Limiting:

Extend artifacts/api-server/src/middleware/rate-limit.ts:

// Global fallback limiter — catches any route not covered by specific limiters
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // 15 minutes
  max: 500,                        // 500 requests per IP per 15min
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { success: false, error: "Too many requests. Please slow down." },
  skip: (req) => req.path === "/api/health",
});

// Upload-specific limiter (prevent storage abuse)
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,       // 1 hour
  max: 30,                         // 30 uploads per hour per IP
  message: { success: false, error: "Upload limit reached. Try again in 1 hour." },
});

// Admin action limiter (sensitive mutations)
export const adminActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => (req as AdminRequest).adminId ?? getClientIp(req),
  message: { success: false, error: "Admin action rate limit exceeded." },
});

Add to app.ts:
  import { globalLimiter, uploadLimiter } from "./middleware/rate-limit.js";
  app.use("/api", globalLimiter);                    // all API routes
  app.use("/api/uploads", uploadLimiter);             // upload routes

PART C — Response Caching Headers:

Add to app.ts:
  app.use((req, res, next) => {
    // Public static data — cache for 5 minutes
    if (req.path.startsWith("/api/categories") ||
        req.path.startsWith("/api/banners") ||
        req.path.startsWith("/api/platform-config")) {
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    }
    // Auth endpoints — never cache
    else if (req.path.startsWith("/api/auth")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    }
    // Wallet/orders — private, no cache
    else if (req.path.startsWith("/api/wallet") ||
             req.path.startsWith("/api/orders")) {
      res.setHeader("Cache-Control", "private, no-store");
    }
    next();
  });

Acceptance: curl -H "Accept-Encoding: gzip" → Content-Encoding: gzip in response.
            501st request from same IP in 15min → HTTP 429.
            /api/categories response has Cache-Control: public header.
```

---

### ═══ PROMPT 8 — Performance: Database Connection + Query Optimization ═══

```
Task: Optimize PostgreSQL connection pooling and add slow-query detection.

Files:
- lib/db/src/index.ts (Drizzle DB init)
- artifacts/api-server/src/lib/db-monitor.ts (NEW)

PART A — Connection Pool Tuning:

Current lib/db/src/index.ts likely uses default pool settings.
Update to:

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // max connections in pool
  min: 2,                     // keep at least 2 alive
  idleTimeoutMillis: 30_000,  // close idle connections after 30s
  connectionTimeoutMillis: 5_000, // fail fast if can't connect in 5s
  statement_timeout: 10_000,  // kill queries taking > 10s
});

pool.on("error", (err) => {
  logger.error({ err: err.message }, "[db-pool] Unexpected client error");
});

export const db = drizzle(pool, { schema, logger: false });
export { pool };

PART B — Slow Query Monitor (NEW file: db-monitor.ts):

const SLOW_QUERY_THRESHOLD_MS = 500;

export function wrapDbWithMonitoring(db: DrizzleDb): DrizzleDb {
  // Proxy every query — if it takes > threshold, log a warning
  return new Proxy(db, {
    get(target, prop) {
      const original = target[prop as keyof typeof target];
      if (typeof original !== "function") return original;
      return function (...args: unknown[]) {
        const start = Date.now();
        const result = (original as Function).apply(target, args);
        if (result instanceof Promise) {
          return result.finally(() => {
            const ms = Date.now() - start;
            if (ms > SLOW_QUERY_THRESHOLD_MS) {
              logger.warn({ ms, prop: String(prop) }, "[db] Slow query detected");
            }
          });
        }
        return result;
      };
    },
  });
}

PART C — Database Health in /api/health:

Extend existing health endpoint:

GET /api/health response (already returns db: "ok"):
{
  status: "ok",
  db: "ok",
  dbPoolSize: pool.totalCount,      // currently active connections
  dbIdleCount: pool.idleCount,      // idle connections
  dbWaitingCount: pool.waitingCount, // requests waiting for connection
  dbQueryMs: 63,                    // last health ping latency
  uptime: 1813,
  memoryPct: 96,
  diskPct: 54
}

Add to /api/health handler:
  const poolStats = {
    poolSize: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };

PART D — Vite Bundle Analysis (Frontend):

Add to admin + rider-app + vendor-app:
Package: rollup-plugin-visualizer

vite.config.ts:
  import { visualizer } from "rollup-plugin-visualizer";
  plugins: [
    ...,
    process.env.ANALYZE === "1" && visualizer({
      filename: "dist/bundle-stats.html",
      open: true,
      gzipSize: true,
    })
  ]

scripts: "analyze": "ANALYZE=1 vite build"

Acceptance: DB pool stats visible in /api/health.
            Slow queries (> 500ms) logged with [db] Slow query detected.
            `pnpm analyze` generates dist/bundle-stats.html.
```

---

### ═══ PROMPT 9 — Security: Helmet + CORS + Input Sanitization ═══

```
Task: Add Helmet security headers, proper CORS config, and XSS sanitization.

Files:
- artifacts/api-server/src/app.ts
- artifacts/api-server/src/middleware/sanitize.ts (NEW)

PART A — Helmet.js:

Package: helmet

Add to app.ts (FIRST middleware, before anything else):
  import helmet from "helmet";

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:    ["'self'"],
        scriptSrc:     ["'self'", "https://www.gstatic.com"],
        styleSrc:      ["'self'", "'unsafe-inline'"],
        imgSrc:        ["'self'", "data:", "https:"],
        connectSrc:    ["'self'", "wss:", "https:"],
        frameSrc:      ["'none'"],
        objectSrc:     ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,      // WebSockets need this off
    hsts: {
      maxAge: 31_536_000,                  // 1 year HSTS
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    noSniff: true,                         // X-Content-Type-Options: nosniff
    xssFilter: true,                       // X-XSS-Protection: 1; mode=block
    hidePoweredBy: true,                   // Remove X-Powered-By: Express
  }));

PART B — Proper CORS Configuration:

Current CORS may be wildcard (*). Replace with:
  import cors from "cors";

  const ALLOWED_ORIGINS = [
    process.env["FRONTEND_URL"] ?? "http://localhost:3000",
    process.env["VENDOR_URL"]   ?? "http://localhost:3001",
    process.env["RIDER_URL"]    ?? "http://localhost:3002",
    process.env["CUSTOMER_URL"] ?? "http://localhost:3003",
    // Replit preview URLs (dynamic subdomains)
    /\.replit\.dev$/,
    /\.pike\.replit\.dev$/,
  ];

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);          // Same-origin / curl
      const allowed = ALLOWED_ORIGINS.some(o =>
        typeof o === "string" ? o === origin : o.test(origin)
      );
      if (allowed) cb(null, true);
      else cb(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,                             // Allow cookies (HttpOnly refresh)
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID", "X-RateLimit-Remaining"],
    maxAge: 86_400,                                // Cache preflight for 24h
  }));

PART C — Input Sanitization Middleware:

Package: dompurify, jsdom (for server-side DOMPurify)

New file: artifacts/api-server/src/middleware/sanitize.ts

import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";

const { window } = new JSDOM("");
const purify = DOMPurify(window as unknown as Window);

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return purify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeValue(v)])
    );
  }
  return value;
}

export function sanitizeBody(req: Request, res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  next();
}

Add to app.ts (after body parser, before routes):
  import { sanitizeBody } from "./middleware/sanitize.js";
  app.use(sanitizeBody);

PART D — Dependency Audit:

Run: pnpm audit --fix (auto-fix non-breaking vulnerabilities)
For breaking fixes: review changelog, update manually.

Add to package.json scripts:
  "audit:check": "pnpm audit --audit-level moderate"
  "audit:fix": "pnpm audit --fix"

Acceptance: curl /api/health → response has X-Content-Type-Options: nosniff header.
            CORS from unknown origin → 500 CORS error.
            <script>alert(1)</script> in request body → stripped to empty string.
            `pnpm audit:check` → 0 moderate or high vulnerabilities.
```

---

### ═══ PROMPT 10 — Observability: Structured Logging + Request IDs ═══

```
Task: Enrich all logs with request IDs and user context automatically.

Files:
- artifacts/api-server/src/app.ts
- artifacts/api-server/src/middleware/request-context.ts (NEW)
- artifacts/api-server/src/lib/logger.ts (extend)

PART A — Request ID Middleware:

Package: uuid (already available via crypto.randomUUID)

New file: artifacts/api-server/src/middleware/request-context.ts

import { AsyncLocalStorage } from "async_hooks";

interface RequestContext {
  requestId: string;
  userId?:   string;
  role?:     string;
  ip:        string;
  path:      string;
  method:    string;
  startMs:   number;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string) ?? crypto.randomUUID();
  const ctx: RequestContext = {
    requestId,
    ip:      getClientIp(req),
    path:    req.path,
    method:  req.method,
    startMs: Date.now(),
  };
  res.setHeader("X-Request-ID", requestId);
  requestContext.run(ctx, () => next());
}

export function setRequestUser(userId: string, role: string): void {
  const ctx = requestContext.getStore();
  if (ctx) { ctx.userId = userId; ctx.role = role; }
}

PART B — Context-Aware Logger:

Update lib/logger.ts:

export function getLogger(): Logger {
  const ctx = requestContext.getStore();
  if (!ctx) return baseLogger;
  return baseLogger.child({
    requestId: ctx.requestId,
    userId:    ctx.userId,
    role:      ctx.role,
    ip:        ctx.ip,
  });
}

// Usage in route files:
// const log = getLogger();
// log.info("Order created");
// → { requestId, userId, role, ip, msg: "Order created" }

PART C — Access Log Format:

Pino-HTTP already used. Extend serializer:

pinoHttp({
  logger: baseLogger,
  serializers: {
    req: (req) => ({
      id:        req.id,
      method:    req.method,
      url:       req.url,
      userAgent: req.headers["user-agent"],
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  customSuccessMessage: (req, res) => {
    const ctx = requestContext.getStore();
    return `${req.method} ${req.url} → ${res.statusCode} (${Date.now() - (ctx?.startMs ?? Date.now())}ms)`;
  },
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} → ${res.statusCode} ERROR: ${err.message}`,
})

PART D — Health Check Expansion:

Extend GET /api/health:
{
  status: "ok",
  db: "ok",
  redis: "disabled",
  uptime: 1813,
  timestamp: "2026-05-21T04:09:36Z",
  version: "1.0.0",
  environment: "development",
  dbPoolSize: 5,
  dbIdleCount: 3,
  dbWaitingCount: 0,
  dbQueryMs: 63,
  memoryPct: 96,
  diskPct: 54,
  checks: {
    database:  { status: "ok",      latencyMs: 63 },
    redis:     { status: "skipped", reason: "REDIS_URL not set" },
    storage:   { status: "ok",      freeGb: 45.2 },
    smtp:      { status: "ok",      provider: "smtp.gmail.com" }
  }
}

Acceptance: Every log line includes requestId.
            Auth routes include userId in logs after token validation.
            /api/health returns detailed checks object.
```

---

### ═══ PROMPT 11 — Feature Completeness: generateId() → Real Implementation ═══

```
Task: Improve generateId() and ensure all stub functions have real implementations.

Files:
- artifacts/api-server/src/lib/id.ts
- artifacts/api-server/src/lib/fireAndForget.ts (verify complete)
- artifacts/api-server/src/routes/wallet.ts (ensureWalletP2PColumns stub)

PART A — generateId() Improvement:

Current implementation:
  export function generateId(): string {
    return Date.now().toString(36) + randomBytes(8).toString("hex");
  }

Problem: Timestamp prefix makes IDs semi-predictable.
Better implementation using crypto + base62:

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function toBase62(n: bigint): string {
  if (n === 0n) return "0";
  let result = "";
  const base = BigInt(BASE62.length);
  while (n > 0n) {
    result = BASE62[Number(n % base)]! + result;
    n = n / base;
  }
  return result;
}

export function generateId(): string {
  const bytes = randomBytes(16);
  const bigInt = BigInt("0x" + bytes.toString("hex"));
  return toBase62(bigInt).padStart(22, "0");
}

// Result: 22-char base62 ID — URL-safe, collision-resistant,
// no timestamp leakage, compatible with all existing DB columns (text)
// Example: "0000K8Hs3mXPqVzJ7rNyWc"

PART B — AJK ID Format (verify existing is correct):

Current AJK ID generation in register.ts (lines 688-696):
  ajkId = "AJK-";
  for (let i = 0; i < 6; i++) ajkId += ajkChars.charAt(randomInt(0, ajkChars.length));

This is correct — "AJK-XXXXXX" with 10-attempt collision retry.
No change needed. ✅

PART C — ensureWalletP2PColumns (if stub exists):

Search for any runtime DB-alter calls:
  grep -r "ensureWallet" artifacts/api-server/src/

If found as a stub:
- Remove the runtime ALTER TABLE call
- Create a proper Drizzle migration instead:

File: lib/db/migrations/XXXX_wallet_p2p.sql
  ALTER TABLE wallet_transactions
    ADD COLUMN IF NOT EXISTS receiver_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS receiver_name TEXT,
    ADD COLUMN IF NOT EXISTS p2p_note      TEXT;

  CREATE INDEX IF NOT EXISTS idx_wallet_txn_receiver
    ON wallet_transactions(receiver_id);

- Add columns to lib/db/src/schema/wallet_transactions.ts
- Run: drizzle-kit push (or include in next migration batch)

PART D — ensureComplianceTables (if stub exists):

Search: grep -r "ensureCompliance" artifacts/api-server/src/

If found:
- Create proper schema file: lib/db/src/schema/compliance_checks.ts
- Export from lib/db/src/schema/index.ts
- Create SQL migration stub

compliance_checks table:
  CREATE TABLE compliance_checks (
    id          TEXT PRIMARY KEY,
    user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
    check_type  TEXT NOT NULL,   -- cnic | kyc | pep_screening | aml
    result      TEXT NOT NULL,   -- pass | fail | review
    score       INTEGER,
    details     JSONB,
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checked_by  TEXT            -- "system" or admin ID
  );

Acceptance: generateId() produces 22-char base62 IDs.
            No runtime ALTER TABLE calls in any route file.
            All stubs replaced with proper schema + migrations.
            `pnpm tsc --noEmit` still 0 errors.
```

---

### ═══ PROMPT 12 — Code Quality: ESLint Strict Rules ═══

```
Task: Set up ESLint with TypeScript-strict rules across all workspaces.

Packages to install (root devDependencies):
  eslint@9, @typescript-eslint/eslint-plugin, @typescript-eslint/parser,
  eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-jsx-a11y,
  eslint-import-resolver-typescript, globals

Config file: eslint.config.mjs (root — ESLint flat config format)

import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  // ─── TypeScript files (all workspaces) ────────────────────────────
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.vite/**",
      "**/artifacts/ajkmart/**",   // READ-ONLY — do not lint
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      // Enforce explicit types
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],

      // Catch errors properly
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",

      // Async/await
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "warn",

      // General
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "eqeqeq": ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  // ─── React files (admin, vendor-app, rider-app) ────────────────────
  {
    files: ["artifacts/admin/**/*.tsx", "artifacts/vendor-app/**/*.tsx", "artifacts/rider-app/**/*.tsx"],
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      "react/jsx-key": "error",
      "react/no-unknown-property": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    settings: { react: { version: "detect" } },
  },
];

package.json scripts (root):
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "lint:api": "eslint artifacts/api-server/src",
  "lint:admin": "eslint artifacts/admin/src",
  "lint:check": "eslint . --max-warnings 0"

VSCode settings (.vscode/settings.json):
  {
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": true
    },
    "eslint.validate": ["typescript", "typescriptreact"],
    "typescript.tsdk": "node_modules/typescript/lib"
  }

Acceptance: `pnpm lint` runs across all workspaces.
            `no-explicit-any` catches remaining any types.
            `no-floating-promises` catches fire-and-forget without fireAndForget().
            `pnpm lint:check` used in CI (blocks merge on warnings).
```

---

### ═══ PROMPT 13 — Code Quality: Prettier + Consistent Formatting ═══

```
Task: Add Prettier for consistent code formatting across all workspaces.

Packages (root devDependencies):
  prettier, prettier-plugin-organize-imports, prettier-plugin-tailwindcss

Config files:

1. .prettierrc (root):
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "plugins": [
    "prettier-plugin-organize-imports",
    "prettier-plugin-tailwindcss"
  ],
  "tailwindConfig": "./tailwind.config.js",
  "importOrder": [
    "^(react|react-native)$",
    "<THIRD_PARTY_MODULES>",
    "^@workspace/(.*)$",
    "^[./]"
  ]
}

2. .prettierignore (root):
node_modules/
dist/
.vite/
*.min.js
*.min.css
artifacts/ajkmart/         # READ-ONLY
lib/db/src/migrations/     # SQL files — manual formatting
*.sql
*.md

3. package.json scripts (root):
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "format:api": "prettier --write artifacts/api-server/src",
  "format:admin": "prettier --write artifacts/admin/src"

4. VSCode integration (.vscode/settings.json — add to existing):
  {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "[typescript]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
    "[typescriptreact]": { "editor.defaultFormatter": "esbenp.prettier-vscode" }
  }

5. lint-staged integration (extend PROMPT 5):
  "**/*.{ts,tsx,js,jsx}": ["prettier --write", "eslint --fix"],
  "**/*.{json,yaml,yml}": ["prettier --write"],
  "**/*.md": ["prettier --write"]

Run initial format:
  pnpm format

Then commit: "style: apply Prettier formatting across all workspaces"

Acceptance: `pnpm format:check` exits 0.
            All .ts/.tsx files use consistent quote style, trailing commas, semicolons.
            Import order organized automatically on save.
```

---

### ═══ PROMPT 14 — Final: Full Stack Verification Checklist ═══

```
Task: Verify all improvements from Prompts 1-13 are working end-to-end.

─── A. TESTING CHECKS ───
1. pnpm test (api-server) → all unit tests pass (≥ 80% coverage)
2. pnpm test:integration → auth integration tests pass vs test DB
3. pnpm test (admin) → component tests pass
4. pnpm playwright test → E2E flows complete (login → dashboard → action)
5. Deliberately failing test → CI catches it (non-zero exit code)

─── B. DX CHECKS ───
6. git commit with TS error → pre-commit hook blocks commit
7. git commit with clean code → hook passes, commit succeeds
8. git push → pre-push hook runs typecheck:all, 0 errors
9. lib/db/README.md exists and is accurate
10. getLogger() in route file → log includes requestId and userId

─── C. PERFORMANCE CHECKS ───
11. curl -H "Accept-Encoding: gzip" /api/products → Content-Encoding: gzip
12. curl /api/health → dbPoolSize, dbIdleCount, dbWaitingCount visible
13. pnpm analyze (admin) → bundle-stats.html opens in browser
14. 501st request in 15min from same IP → HTTP 429 with rate limit message
15. Slow DB query (artificial delay > 500ms) → [db] Slow query logged

─── D. SECURITY CHECKS ───
16. curl /api/health → X-Content-Type-Options: nosniff header present
17. curl /api/health → X-Frame-Options: DENY header present
18. curl with Origin: http://malicious.com → CORS error (not 200)
19. POST /api/auth/login body: { identifier: "<script>alert(1)</script>" }
    → input sanitized to empty string (no XSS stored)
20. pnpm audit:check → 0 moderate/high vulnerabilities

─── E. OBSERVABILITY CHECKS ───
21. POST /api/auth/login → pino log includes { requestId, ip }
22. After auth, subsequent logs include { requestId, userId, role }
23. X-Request-ID header returned in every API response
24. GET /api/health → checks.database.latencyMs present
25. GET /api/health → checks.smtp.status present

─── F. FEATURE COMPLETENESS CHECKS ───
26. generateId() → 22-char base62 string (no timestamp leak)
27. 10,000 generateId() calls → 0 collisions
28. POST /auth/register → ajkId format: "AJK-[A-Z0-9]{6}"
29. No runtime ALTER TABLE calls found: grep -r "ALTER TABLE" artifacts/api-server/src/ → 0
30. wallet_transactions has receiver_id column (if P2P transfer used)

─── G. CODE QUALITY CHECKS ───
31. pnpm lint → 0 errors
32. pnpm lint:check → 0 warnings on critical rules
33. pnpm format:check → 0 formatting violations
34. `no-explicit-any` rule fires on test file with any → ESLint error
35. `no-floating-promises` catches: doSomethingAsync(); (no await) → ESLint error

─── RUNTIME VERIFICATION ───
36. API Server: curl /api/health → { status: "ok", db: "ok" }
37. Admin Panel: http://localhost:3000/admin → login screen loads
38. Vendor App: http://localhost:3001/vendor → login screen loads
39. Rider App: http://localhost:3002/rider → login screen loads
40. Customer App: http://localhost:3003 → home screen bundles (Expo Metro)
```

---

## 🚀 Execution Order

| Step | Prompt | Area | Risk | Est. Time |
|------|--------|------|------|-----------|
| 1 | Unit Tests (backend services) | Testing | Low | 45 min |
| 2 | Integration Tests (auth endpoints) | Testing | Low | 60 min |
| 3 | Component Tests (React) | Testing | Low | 30 min |
| 4 | E2E Tests (Playwright) | Testing | Medium | 60 min |
| 5 | Pre-commit Hooks (Husky) | DX | Low | 20 min |
| 6 | README + JSDoc for shared libs | DX | Low | 30 min |
| 7 | Compression + Rate Limiting | Performance | Low | 25 min |
| 8 | DB Pool + Query Monitoring | Performance | Medium | 30 min |
| 9 | Helmet + CORS + Sanitization | Security | Medium | 30 min |
| 10 | Request IDs + Enriched Logging | Observability | Low | 25 min |
| 11 | generateId() + Feature Stubs | Feature | Low | 20 min |
| 12 | ESLint Strict Config | Code Quality | Medium | 25 min |
| 13 | Prettier Formatting | Code Quality | Low | 15 min |
| 14 | Full Verification Checklist | All | — | 30 min |

**Total estimated time: ~7.5 hours**

---

## 🔐 Security Additions Summary (Post-Implementation)

| Addition | Mechanism |
|----------|-----------|
| Security headers | Helmet.js — HSTS, noSniff, xssFilter, hidePoweredBy, CSP |
| CORS lockdown | Allowlist: known origins only (no wildcard) |
| XSS sanitization | DOMPurify server-side on every req.body string |
| Global rate limit | 500 req/15min per IP on all /api/* routes |
| Upload limit | 30 uploads/hour per IP |
| Admin action limit | 100 actions/10min per adminId |
| Dependency audit | pnpm audit runs in CI, blocks on moderate+ vulnerabilities |
| Request tracing | X-Request-ID on every request + response |
| Slow query detection | Queries > 500ms logged with [db] Slow query |

---

## 🧪 Test Coverage Targets

| Workspace | Target Coverage | Test Type |
|-----------|----------------|-----------|
| `artifacts/api-server` | Lines ≥ 80%, Functions ≥ 80% | Unit + Integration |
| `artifacts/admin` | Lines ≥ 60% | Component |
| `artifacts/vendor-app` | Lines ≥ 60% | Component |
| `artifacts/rider-app` | Lines ≥ 60% | Component |
| All 3 web apps | Critical flows ✅ | E2E (Playwright) |
| `lib/db` | Schema compiles ✅ | TypeScript (tsc) |
| `lib/auth-utils` | Helpers tested ✅ | Unit |

---

## ⚠️ Notes

1. **Customer App (artifacts/ajkmart/)** — READ ONLY.
   Tests for mobile app are in Expo's own test setup.
   E2E covers only the 3 web apps (Admin, Vendor, Rider).

2. **auth.ts restriction** — `artifacts/api-server/src/routes/auth.ts` DO NOT MODIFY.
   All new middleware added to `app.ts` or new middleware files.

3. **ESLint `@typescript-eslint/no-explicit-any`** — Some Drizzle ORM dynamic
   query patterns require `as any`. Add `// eslint-disable-next-line` with comment
   explaining why. Do NOT mass-disable the rule.

4. **Prettier initial run** — First `pnpm format` may change many files.
   Commit as a single "style: apply Prettier" commit before further work.
   This keeps git blame clean.

5. **Pre-commit hooks speed** — lint-staged only runs on staged files, so even
   with 10 workspaces, a single-file commit checks only that file's workspace.
   Full typecheck:all runs only on push (slower, but less frequent).

6. **Test DB** — Integration tests need a separate `TEST_DATABASE_URL`.
   Do not run integration tests against the development database.
   Use: `createTestDb()` helper that creates a fresh schema per test run.

7. **Playwright in Replit** — Playwright needs Chromium.
   Install: `pnpm exec playwright install chromium --with-deps`
   For CI: use `--reporter=dot` for compact output.
```

---

## 🖥️ Admin Panel — Complete Structure & Route Map

> Yeh section `admin-guide.md` ki complete information ko cover karta hai.
> Har route, permission, API endpoint aur cross-app connection detail mein hai.

---

### Admin App Architecture

```
artifacts/admin/
├── src/
│   ├── App.tsx                   # Root router — SARI routes yahan register hain
│   ├── components/
│   │   ├── layout/AdminLayout.tsx   # Sidebar + header shell
│   │   ├── MobileDrawer.tsx         # Mobile sidebar drawer
│   │   ├── CommandPalette.tsx       # Cmd+K global search
│   │   └── PullToRefresh.tsx        # Blue accent pull-to-refresh
│   ├── lib/
│   │   ├── adminAuthContext.tsx     # JWT state, login/logout, refresh
│   │   ├── navConfig.ts             # ALL nav groups, items, icons, permissions
│   │   └── adminFetcher.ts          # Authenticated fetch interceptor
│   └── pages/                       # Har page ka alag file
```

**Auth:** Admin ka alag JWT system hai — customer/rider/vendor tokens se bilkul alag.
**Router:** Wouter — `base="/admin"` pe mount hai.
**API Base:** Har request `/api/admin/*` ya `/api/*` pe jati hai.

---

### Admin Auth Endpoints

| Endpoint | Method | Kaam |
|----------|--------|------|
| `/api/admin/v2/login` | POST | Username + password login |
| `/api/admin/v2/logout` | POST | Session khatam karo |
| `/api/admin/v2/me` | GET | Current admin ka profile |
| `/api/admin/v2/check-session` | GET | Token valid hai ya nahi |
| `/api/admin/v2/forgot-password` | POST | Reset link bhejo |
| `/api/admin/v2/reset-password` | POST | Naya password set karo |
| `/api/admin/v2/mfa/status` | GET | TOTP enabled hai ya nahi |
| `/api/admin/v2/sessions` | GET | Active sessions list |

---

### Permission System — RBAC

| Permission Key | Kahan Use Hota Hai |
|---------------|-------------------|
| `dashboard.view` | Dashboard |
| `orders.view` | Orders management |
| `fleet.rides.view` | Rides, Van, Live Map, Riders, SOS |
| `fleet.pharmacy.view` | Pharmacy orders |
| `fleet.parcel.view` | Parcel deliveries |
| `vendors.view` | Vendors, Delivery Access, Inventory |
| `users.view` | Users management |
| `finance.kyc.view` | KYC verification |
| `finance.transactions.view` | Transactions, Analytics |
| `finance.withdrawals.view` | Withdrawals |
| `finance.deposits.review` | Deposit requests |
| `content.products.view` | Products, Categories, Reviews, Banners, FAQs, Deep Links |
| `promotions.view` | Promo Codes, Flash Deals, Loyalty |
| `support.broadcast.send` | Communications, Broadcast, SMS |
| `support.chat.view` | Support Chat, Chat Monitor |
| `system.settings.view` | Settings, Health, Error Monitor, Webhooks |
| `system.settings.edit` | Auth Methods, OTP Control |
| `system.audit.view` | Audit Logs, Consent Log |
| `system.roles.manage` | Roles & Permissions |
| `system.maintenance` | Launch Control |

---

### Complete Route Registry — App.tsx

Yeh sari routes `artifacts/admin/src/App.tsx` mein register hain:

#### Auth Routes (login required nahi)
| Route | Page File |
|-------|-----------|
| `/admin/login` | `login.tsx` |
| `/admin/forgot-password` | `forgot-password.tsx` |
| `/admin/reset-password` | `reset-password.tsx` |
| `/admin/set-new-password` | `set-new-password.tsx` |

#### Operations Group
| Route | Page | Permission | Backend API |
|-------|------|-----------|-------------|
| `/admin/dashboard` | `dashboard.tsx` | `dashboard.view` | `GET /api/stats` |
| `/admin/orders` | `orders/index.tsx` | `orders.view` | `GET /api/admin/orders` |
| `/admin/rides` | `rides.tsx` | `fleet.rides.view` | `GET /api/admin/rides` |
| `/admin/van` | `van.tsx` | `fleet.rides.view` | `GET /api/admin/routes` |
| `/admin/pharmacy` | `pharmacy.tsx` | `fleet.pharmacy.view` | `GET /api/pharmacy/orders` |
| `/admin/parcel` | `parcel.tsx` | `fleet.parcel.view` | `GET /api/parcel/my-bookings` |
| `/admin/delivery-access` | `delivery-access.tsx` | `vendors.view` | `GET /api/admin/delivery-access` |

#### People Group
| Route | Page | Permission | Backend API |
|-------|------|-----------|-------------|
| `/admin/users` | `users.tsx` | `users.view` | `GET /api/admin/users` |
| `/admin/riders` | `riders.tsx` | `fleet.rides.view` | `GET /api/admin/riders` |
| `/admin/vendors` | `vendors.tsx` | `vendors.view` | `GET /api/admin/vendors` |
| `/admin/kyc` | `kyc.tsx` | `finance.kyc.view` | `GET /api/admin/kyc` |

#### Catalog Group
| Route | Page | Permission | Backend API |
|-------|------|-----------|-------------|
| `/admin/products` | `products.tsx` | `content.products.view` | `GET /api/admin/products` |
| `/admin/categories` | `categories.tsx` | `content.products.view` | `GET /api/admin/categories/tree` |
| `/admin/reviews` | `reviews.tsx` | `content.products.view` | `GET /api/reviews/product/:id` |
| `/admin/vendor-inventory-settings` | `vendor-inventory-settings.tsx` | `vendors.view` | `GET /api/admin/inventory-settings` |

#### Finance Group
| Route | Page | Permission | Backend API |
|-------|------|-----------|-------------|
| `/admin/transactions` | `transactions.tsx` | `finance.transactions.view` | `GET /api/admin/transactions` |
| `/admin/withdrawals` | `Withdrawals.tsx` | `finance.withdrawals.view` | `GET /api/admin/withdrawal-requests` |
| `/admin/deposit-requests` | `DepositRequests.tsx` | `finance.deposits.review` | `GET /api/admin/deposit-requests` |
| `/admin/wallet-transfers` | `wallet-transfers.tsx` | `finance.transactions.view` | `GET /api/admin/wallet-transfers` |
| `/admin/loyalty` | `loyalty.tsx` | `promotions.view` | `GET /api/admin/loyalty/campaigns` |

#### Marketing Group
| Route | Page | Permission | Backend API |
|-------|------|-----------|-------------|
| `/admin/promotions` | `promotions-hub.tsx` | `promotions.view` | `GET /api/admin/promo-codes` |
| `/admin/promo-codes` | `promo-codes.tsx` | `promotions.view` | `GET /api/admin/promo-codes` |
| `/admin/flash-deals` | `flash-deals.tsx` | `promotions.view` | `GET /api/admin/flash-deals` |
| `/admin/banners` | `banners.tsx` | `content.products.view` | `GET /api/admin/banners` |
| `/admin/popups` | `popups.tsx` | `content.products.view` | `GET /api/admin/popups` |

#### Communications Group
| Route | Page | Permission | Backend API |
|-------|------|-----------|-------------|
| `/admin/communications` | `communication.tsx` | `support.broadcast.send` | `GET /api/admin/communication/dashboard` |
| `/admin/broadcast` | `broadcast.tsx` | `support.broadcast.send` | `POST /api/admin/broadcast` |
| `/admin/support-chat` | `support-chat.tsx` | `support.chat.view` | `GET /api/admin/support-chat` |
| `/admin/faq-management` | `faq-management.tsx` | `content.products.view` | `GET /api/admin/faq` |
| `/admin/sms-gateways` | `sms-gateways.tsx` | `support.broadcast.send` | `GET /api/admin/sms-gateways` |

#### Analytics Group
| Route | Page | Permission | Backend API |
|-------|------|-----------|-------------|
| `/admin/analytics` | `analytics.tsx` | `finance.transactions.view` | `GET /api/stats` |
| `/admin/revenue-analytics` | `revenue-analytics.tsx` | `finance.transactions.view` | `GET /api/stats/metrics` |
| `/admin/search-analytics` | `search-analytics.tsx` | `system.settings.view` | `GET /api/admin/search-analytics` |
| `/admin/wishlist-insights` | `wishlist-insights.tsx` | `content.products.view` | `GET /api/admin/wishlist-analytics` |
| `/admin/qr-codes` | `qr-codes.tsx` | `content.products.view` | `GET /api/admin/qr-codes` |
| `/admin/experiments` | `experiments.tsx` | `system.settings.view` | `GET /api/admin/experiments` |

#### Security Group
| Route | Page | Permission | Backend API |
|-------|------|-----------|-------------|
| `/admin/security` | `security.tsx` | `system.settings.view` | `GET /api/admin/security/audit-logs` |
| `/admin/audit-logs` | `audit-logs.tsx` | `system.audit.view` | `GET /api/admin/security/audit-logs` |
| `/admin/consent-log` | `consent-log.tsx` | `system.audit.view` | `GET /api/legal/consent-log` |
| `/admin/roles-permissions` | `roles-permissions.tsx` | `system.roles.manage` | `GET /api/admin/role-presets` |
| `/admin/sos-alerts` | `sos-alerts.tsx` | `fleet.rides.view` | `GET /api/sos/alerts` |

#### Health & Monitoring Group
| Route | Page | Permission | Backend API |
|-------|------|-----------|-------------|
| `/admin/health-dashboard` | `health-dashboard.tsx` | `system.settings.view` | `GET /api/health` |
| `/admin/error-monitor` | `error-monitor.tsx` | `system.settings.view` | `GET /api/error-reports` |
| `/admin/live-riders-map` | `live-riders-map.tsx` | `fleet.rides.view` | Socket.io `rider:location` |
| `/admin/chat-monitor` | `chat-monitor.tsx` | `support.chat.view` | `GET /api/admin/chat-monitor/conversations` |

#### Configuration Group
| Route | Page | Permission | Backend API |
|-------|------|-----------|-------------|
| `/admin/settings` | `settings.tsx` | `system.settings.view` | `GET /api/settings` |
| `/admin/app-management` | `app-management.tsx` | `system.settings.view` | `PATCH /api/admin/launch/feature/:id` |
| `/admin/auth-methods` | `auth-methods.tsx` | `system.settings.edit` | `GET /api/admin/auth/methods` |
| `/admin/auth-control` | `auth-control.tsx` | `system.settings.edit` | `GET /api/admin/auth/events` |
| `/admin/launch-control` | `launch-control.tsx` | `system.maintenance` | `POST /api/admin/launch/mode` |
| `/admin/otp-control` | `otp-control.tsx` | `system.settings.edit` | `GET /api/admin/otp/status` |
| `/admin/business-rules` | `business-rules.tsx` | `system.settings.view` | `GET /api/business-rules` |
| `/admin/deep-links` | `deep-links.tsx` | `content.products.view` | `GET /api/admin/deep-links` |
| `/admin/webhooks` | `webhook-manager.tsx` | `system.settings.view` | `GET /api/admin/webhooks` |
| `/admin/whatsapp-delivery-log` | `whatsapp-delivery-log.tsx` | `system.settings.view` | `GET /api/admin/whatsapp/delivery-log` |
| `/admin/account-conditions` | `account-conditions.tsx` | `system.settings.view` | `GET /api/admin/conditions` |
| `/admin/condition-rules` | `condition-rules.tsx` | `system.settings.view` | `GET /api/admin/condition-rules` |
| `/admin/accessibility` | `accessibility.tsx` | `system.settings.view` | Local settings |

#### Error Pages
| Route | Page |
|-------|------|
| `/admin/403` | `forbidden.tsx` |
| `/admin/404` | `not-found.tsx` |
| `*` (catch-all) | `not-found.tsx` |

---

### Admin ↔ Customer App E2E Connection

| Admin Action | Customer App Mein Kya Hota Hai |
|-------------|-------------------------------|
| Products → Approve | Product customer search mein nazar aata hai |
| Banners → Add/Edit | Home screen carousel update hota hai |
| Flash Deals → Manage | Flash deal section update hota hai |
| Promo Codes → Create | Customer checkout mein coupon apply hota hai |
| Auth Methods → Toggle | Customer login screen mein method show/hide hota hai |
| OTP Control → Disable | Customer OTP login block ho jata hai |
| Delivery Access | Customer order area restrict hota hai |
| Categories → CRUD | Customer sidebar categories update hoti hai |

### Admin ↔ Vendor App E2E Connection

| Admin Action | Vendor App Mein Kya Hota Hai |
|-------------|------------------------------|
| Vendors → Approve | Vendor dashboard fully open hota hai |
| Vendors → Suspend | Vendor suspended message dekhta hai |
| Products → Approve | Vendor product customer search mein aata hai |
| Inventory Settings | Vendor low-stock warnings configure hoti hai |

### Admin ↔ Rider App E2E Connection

| Admin Action | Rider App Mein Kya Hota Hai |
|-------------|------------------------------|
| Riders → Approve | Rider online ja sakta hai |
| Rides → Assign | Rider ko dispatch notification milti hai |
| Live Map → View | Admin real-time GPS dekhta hai |
| SOS → Acknowledge | Rider SOS alert marked as seen |
| Finance → Bonus | Rider wallet credit hota hai |

---

### Settings Sub-Sections

`/admin/settings` page multiple tabs mein split hai:

| Tab | Sub-Component | Kya Configure Hota Hai |
|-----|--------------|------------------------|
| `general` | `settings-general.tsx` | App name, language, timezone |
| `payment` | `settings-payment.tsx` | Payment gateways, wallet limits |
| `integrations` | `settings-integrations.tsx` | Maps, SMS, WhatsApp, Sentry, Firebase |
| `security` | `settings-security.tsx` | Session TTL, IP allowlist |
| `system` | `settings-system.tsx` | DB pool, maintenance mode |
| `weather` | `settings-weather.tsx` | Weather API provider |
| `compliance` | `settings-compliance.tsx` | GDPR, data retention |
| `branding` | `settings-branding.tsx` | Logo, colors, app store info |

---

### Real-Time Features

| Feature | Socket Room | Events |
|---------|------------|--------|
| Live Riders Map | `admin-fleet` | `rider:location`, `rider:offline`, `rider:online` |
| SOS Alerts | `admin-sos` | `sos:new` |
| Order Updates | per-order room | `order:status` |

---

### Database Tables Used by Admin

| Admin Section | Main Tables |
|--------------|-------------|
| Users | `users`, `rider_profiles`, `vendor_profiles`, `sessions` |
| Orders | `orders`, `order_items`, `products` |
| Rides | `rides`, `live_locations`, `ride_bids` |
| Finance | `wallet_transactions`, `withdrawal_requests`, `deposit_requests` |
| Marketing | `promo_codes`, `flash_deals`, `banners`, `popups` |
| Settings | `platform_settings` (single-row JSON config) |
| System | `error_reports`, `experiments`, `webhooks`, `deep_links`, `audit_logs` |

---

### Naya Page Add Karne Ka Tariqa

```
1. Page file banao:
   artifacts/admin/src/pages/mera-page.tsx
   export default function MeraPage() { ... }

2. App.tsx mein lazy import karo:
   const MeraPage = lazy(() => import("@/pages/mera-page"));

3. App.tsx ke AppRoutes Switch mein Route add karo:
   <Route path="/mera-route">
     <ProtectedRoute component={MeraPage} requirePermission="permission.key" />
   </Route>

4. navConfig.ts mein nav entry add karo:
   { nameKey: "navMeraPage", href: "/mera-route", icon: SomeIcon, requirePermission: "permission.key" }

5. lib/i18n/src/index.ts mein translation key add karo:
   navMeraPage: "Mera Page"  (English, Urdu, Roman Urdu teeno mein)
```
