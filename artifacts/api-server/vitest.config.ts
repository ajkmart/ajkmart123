import { defineConfig } from "vitest/config";

// Placeholder value that satisfies the ≥32-character minimum enforced by
// resolveAdminSecret() and similar guards in admin-shared.ts / admin-jwt.ts.
// These are NEVER used in production — they exist only so the module-level
// secret resolution code (which calls process.exit(1) in NODE_ENV=production)
// does not abort the test process.
const TEST_SECRET = "vitest_placeholder_secret_min32chars!!";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 30000,
    include: ["src/tests/**/*.test.ts", "src/__tests__/**/*.test.ts"],
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json"],
      thresholds: { lines: 80, functions: 80, branches: 70 },
      exclude: [
        "src/**/index.ts",
        "src/**/*.d.ts",
        "src/routes/**",
        "src/lib/socketio.ts",
        "src/lib/redis.ts",
      ],
    },
    // Override NODE_ENV so production-fatal guards (process.exit calls) are
    // skipped during test runs — Replit sets NODE_ENV=production globally.
    env: {
      NODE_ENV: "test",
      TOTP_ENCRYPTION_KEY: TEST_SECRET,
      // Secrets required by module-level resolveAdminSecret() calls in
      // admin-shared.ts and admin-jwt.ts.  Tests that need these values use
      // the same resolution logic so their signed tokens always match.
      ADMIN_ACCESS_TOKEN_SECRET: TEST_SECRET,
      ADMIN_REFRESH_TOKEN_SECRET: TEST_SECRET,
      ADMIN_REFRESH_SECRET: TEST_SECRET,
      ADMIN_JWT_REFRESH_SECRET: TEST_SECRET,
      ADMIN_JWT_SECRET: TEST_SECRET,
      ADMIN_SECRET: TEST_SECRET,
      ADMIN_CSRF_SECRET: TEST_SECRET,
      JWT_SECRET: TEST_SECRET,
      VENDOR_JWT_SECRET: TEST_SECRET,
      RIDER_JWT_SECRET: TEST_SECRET,
      ERROR_REPORT_HMAC_SECRET: TEST_SECRET,
      ENCRYPTION_MASTER_KEY: TEST_SECRET,
    },
  },
});
