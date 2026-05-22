import { expect, test } from "@playwright/test";
import { loginAdmin } from "../helpers/auth";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? process.env.ADMIN_SEED_PASSWORD ?? "Admin@123";

test.describe("Admin Login", () => {
  test("load /admin/login → login screen renders", async ({ page }) => {
    await page.goto("/admin/login");

    await expect(page.locator('input[placeholder="admin@example.com"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('input[placeholder="Enter your password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Sign In")')).toBeVisible();
    await expect(page.locator("text=AJKMart Admin")).toBeVisible();
  });

  test("submit correct credentials → dashboard loads", async ({ page }) => {
    await loginAdmin(page, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
    const sidebarIndicator = page
      .locator(
        'input[aria-label="Filter sidebar items"], [data-sidebar-active], [data-component-name="nav"]'
      )
      .first();
    await expect(sidebarIndicator).toBeAttached({ timeout: 10_000 });
  });

  test("click 'Forgot Password?' → forgot screen appears", async ({ page }) => {
    await page.goto("/admin/login");
    await page.waitForSelector("text=Forgot Password?", { timeout: 15_000 });

    await page.click("text=Forgot Password?");

    await expect(page).toHaveURL(/forgot/, { timeout: 10_000 });
  });

  test("dashboard has sidebar navigation visible after login", async ({ page }) => {
    await loginAdmin(page, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

    await expect(
      page
        .locator("a, button")
        .filter({ hasText: /Dashboard|Operations|Users|Orders|Riders|Vendors/i })
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("submit wrong password → error message appears (mocked)", async ({ page }) => {
    await page.route("**/api/admin/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid credentials" }),
      });
    });

    await page.goto("/admin/login");
    await page.waitForSelector('input[placeholder="admin@example.com"]', { timeout: 15_000 });

    await page.fill('input[placeholder="admin@example.com"]', ADMIN_USERNAME);
    await page.fill('input[placeholder="Enter your password"]', "wrong-password-xyz");
    await page.click('button:has-text("Sign In")');

    const errorLocator = page.locator('[role="alert"], [data-testid="login-error"]');
    await expect(errorLocator.first()).toBeVisible({ timeout: 10_000 });
  });
});
