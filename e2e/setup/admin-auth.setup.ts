import { expect, test as setup } from "@playwright/test";
import path from "path";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? process.env.ADMIN_SEED_PASSWORD ?? "Admin@123";
const AUTH_FILE = path.join(__dirname, "../state/admin-auth.json");

setup("authenticate as admin and save state", async ({ page }) => {
  const bypassSecret = process.env.E2E_BYPASS_SECRET ?? "e2e-playwright-bypass-2024";

  await page.route("**/api/admin/auth/login", async (route) => {
    await route.continue({
      headers: { ...route.request().headers(), "x-e2e-bypass": bypassSecret },
    });
  });

  await page.goto("/admin/login");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector('input[placeholder="admin@example.com"]', { timeout: 30_000 });

  await page.fill('input[placeholder="admin@example.com"]', ADMIN_USERNAME);
  await page.fill('input[placeholder="Enter your password"]', ADMIN_PASSWORD);
  await page.click('button:has-text("Sign In")');

  await page.waitForURL(/\/admin/, { timeout: 25_000 });
  await expect(page).toHaveURL(/\/admin/);

  await page.context().storageState({ path: AUTH_FILE });
  console.log("Admin auth state saved to", AUTH_FILE);
});
