import { defineConfig } from "vitest/config";

const TEST_SECRET = "vitest_placeholder_secret_min32chars!!";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 45000,
    include: ["src/__tests__/integration/**/*.test.ts"],
    exclude: ["src/__tests__/unit/**"],
    reporters: ["verbose"],
    setupFiles: ["./src/__tests__/integration/helpers/setup.ts"],
    pool: "forks",
    singleFork: true,
    env: {
      NODE_ENV: "test",
      TOTP_ENCRYPTION_KEY: TEST_SECRET,
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
      HMAC_OTP_SECRET: TEST_SECRET,
    },
  },
});
