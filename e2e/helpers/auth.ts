import type { Page } from "@playwright/test";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? process.env.ADMIN_SEED_PASSWORD ?? "Admin@123";

/**
 * Log in to the Admin panel with username + password.
 * Navigates to /admin, fills the credential form, and waits for the dashboard.
 */
export async function loginAdmin(page: Page, opts: { username?: string; password?: string } = {}) {
  const username = opts.username ?? ADMIN_USERNAME;
  const password = opts.password ?? ADMIN_PASSWORD;

  const bypassSecret = process.env.E2E_BYPASS_SECRET ?? "e2e-playwright-bypass-2024";

  await page.route("**/api/admin/auth/login", async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        "x-e2e-bypass": bypassSecret,
      },
    });
  });

  await page.goto("/admin/login");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector('input[placeholder="admin@example.com"]', { timeout: 30_000 });

  await page.fill('input[placeholder="admin@example.com"]', username);
  await page.fill('input[placeholder="Enter your password"]', password);
  await page.click('button:has-text("Sign In")');

  await page.waitForURL(/\/admin/, { timeout: 25_000 });
}

/**
 * Log in to the Vendor app via Phone OTP.
 * Navigates to /vendor, switches to Phone tab, enters phone, then OTP.
 * Requires ALLOW_DEV_OTP=true on the API server to work end-to-end.
 */
export async function loginVendor(page: Page, opts: { phone: string; otp: string }) {
  await page.goto("/vendor/login");
  await page.waitForSelector("text=AJKMart Vendor", { timeout: 15_000 });

  const phoneTab = page.locator("button", { hasText: "Phone" }).first();
  await phoneTab.click();

  await page.fill('input[placeholder="03XXXXXXXXX"]', opts.phone);
  await page.click('button:has-text("Send OTP")');

  await page.waitForSelector("text=Verify & Sign In", { timeout: 10_000 });

  for (let i = 0; i < opts.otp.length; i++) {
    const box = page.locator(`input[data-index="${i}"], input.otp-box`).nth(i);
    await box.fill(opts.otp[i]!);
  }

  await page.click('button:has-text("Verify & Sign In")');
  await page.waitForURL(/\/vendor\/?$|\/vendor\/dashboard/, { timeout: 20_000 });
}

/**
 * Log in to the Rider app via Phone OTP.
 * Navigates to /rider/login, enters phone, then OTP.
 * Requires ALLOW_DEV_OTP=true on the API server to work end-to-end.
 */
export async function loginRider(page: Page, opts: { phone: string; otp: string }) {
  await page.goto("/rider/login");
  await page.waitForSelector("text=Deliver with AJKMart", { timeout: 15_000 });

  const phoneTab = page.locator("button", { hasText: "Phone" }).first();
  await phoneTab.click();

  await page.fill('input[placeholder="03XXXXXXXXX"]', opts.phone);
  await page.click('button:has-text("Send OTP")');

  await page.waitForSelector("text=Verify & Sign In", { timeout: 10_000 });

  for (let i = 0; i < opts.otp.length; i++) {
    const box = page.locator(`input[data-index="${i}"], input.otp-box`).nth(i);
    await box.fill(opts.otp[i]!);
  }

  await page.click('button:has-text("Verify & Sign In")');
  await page.waitForURL(/\/rider\/?$/, { timeout: 20_000 });
}
