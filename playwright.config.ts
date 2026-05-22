import { defineConfig, devices } from "@playwright/test";
import path from "path";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? process.env.ADMIN_SEED_PASSWORD ?? "Admin@123";

export { ADMIN_PASSWORD, ADMIN_USERNAME };

// In CI (GitHub Actions) PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is unset — Playwright
// resolves its own installed chromium.  On Replit the nix-store path is used as a
// fallback so the dev environment keeps working without a separate `playwright install`.
const REPLIT_NIX_CHROMIUM =
  "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium-browser";

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  : process.env.CI
    ? undefined
    : REPLIT_NIX_CHROMIUM;

const CHROMIUM_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];

const ADMIN_STATE = path.join(__dirname, "e2e/state/admin-auth.json");

const BROWSER_OPTS = {
  ...devices["Desktop Chrome"],
  launchOptions: {
    ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
    args: CHROMIUM_ARGS,
  },
};

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/artifacts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [["list"], ["html", { outputFolder: "e2e/reports", open: "never" }]],

  use: {
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    // ── API-level tests (no browser) ──────────────────────────────────────────
    {
      name: "api",
      use: {
        baseURL: "http://localhost:5000",
        extraHTTPHeaders: { "Content-Type": "application/json" },
      },
      testMatch: "e2e/*.spec.ts",
    },

    // ── Admin auth setup (runs once, saves state to file) ─────────────────────
    {
      name: "admin-setup",
      use: { ...BROWSER_OPTS, baseURL: "http://localhost:3000" },
      testMatch: "e2e/setup/admin-auth.setup.ts",
    },

    // ── Admin browser tests (reuse saved auth state) ──────────────────────────
    {
      name: "admin",
      use: {
        ...BROWSER_OPTS,
        baseURL: "http://localhost:3000",
        storageState: ADMIN_STATE,
      },
      dependencies: ["admin-setup"],
      testMatch: "e2e/admin/**/*.spec.ts",
    },

    // ── Vendor browser tests (auth mocked via page.route) ─────────────────────
    {
      name: "vendor",
      use: { ...BROWSER_OPTS, baseURL: "http://localhost:3001" },
      testMatch: "e2e/vendor/**/*.spec.ts",
    },

    // ── Rider browser tests (auth mocked via page.route) ──────────────────────
    {
      name: "rider",
      use: { ...BROWSER_OPTS, baseURL: "http://localhost:3002" },
      testMatch: "e2e/rider/**/*.spec.ts",
    },
  ],

  webServer: [
    {
      command: "PORT=3000 BASE_PATH=/admin pnpm --filter @workspace/admin dev",
      port: 3000,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "PORT=3001 BASE_PATH=/vendor pnpm --filter @workspace/vendor-app dev",
      port: 3001,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "PORT=3002 BASE_PATH=/rider pnpm --filter @workspace/rider-app dev",
      port: 3002,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
