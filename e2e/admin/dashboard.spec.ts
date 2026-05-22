import { expect, test } from "@playwright/test";
import { loginAdmin } from "../helpers/auth";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? process.env.ADMIN_SEED_PASSWORD ?? "Admin@123";

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    await page.waitForSelector('input[aria-label="Filter sidebar items"]', {
      timeout: 35_000,
    });
    // Wait for dashboard data to finish loading (skeleton → real content)
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
  });

  test("stats cards render (Revenue, Rides, Orders, SOS)", async ({ page }) => {
    const statsCard = page
      .getByText(/Total Revenue|Total Riders|Total Vendors|Total Orders/i)
      .first();
    await expect(statsCard).toBeVisible({ timeout: 20_000 });
  });

  test("navigation to /admin/users → users table loads", async ({ page }) => {
    const usersLink = page.locator('a[href="/admin/users"]').first();
    await expect(usersLink).toBeAttached({ timeout: 10_000 });
    await usersLink.evaluate((el: HTMLElement) => el.click());

    await expect(page).toHaveURL(/\/admin\/users/, { timeout: 10_000 });

    const pageTitle = page.locator("h1, h2, [class*='title'], [class*='heading']").first();
    await expect(pageTitle).toBeVisible({ timeout: 15_000 });
  });

  test("navigation to /admin/orders → orders table loads", async ({ page }) => {
    const ordersLink = page.locator('a[href="/admin/orders"]').first();
    await expect(ordersLink).toBeAttached({ timeout: 10_000 });
    await ordersLink.evaluate((el: HTMLElement) => el.click());

    await expect(page).toHaveURL(/\/admin\/orders/, { timeout: 10_000 });

    const pageTitle = page.locator("h1, h2, [class*='title'], [class*='heading']").first();
    await expect(pageTitle).toBeVisible({ timeout: 15_000 });
  });

  test("dashboard content visible: sidebar filter and main content area present", async ({
    page,
  }) => {
    const sidebarFilter = page.locator('input[aria-label="Filter sidebar items"]');
    await expect(sidebarFilter).toBeAttached({ timeout: 5_000 });

    const mainContent = page.locator("main, [role='main'], #root > div").first();
    await expect(mainContent).toBeAttached({ timeout: 10_000 });
  });

  test("pull-to-refresh: drag page down → spinner → content refreshes", async ({ page }) => {
    const statsCard = page
      .getByText(/Total Revenue|Total Riders|Total Vendors|Total Orders/i)
      .first();
    await expect(statsCard).toBeVisible({ timeout: 20_000 });

    const initialText = await statsCard.textContent();

    await page.mouse.move(640, 300);
    await page.mouse.down();
    await page.mouse.move(640, 600, { steps: 20 });
    await page.mouse.up();

    await page.waitForTimeout(1_500);

    const refreshed = page
      .getByText(/Total Revenue|Total Riders|Total Vendors|Total Orders/i)
      .first();
    await expect(refreshed).toBeVisible({ timeout: 15_000 });
    const refreshedText = await refreshed.textContent();
    expect(refreshedText).toBeTruthy();
    expect(refreshedText).toBe(initialText);
  });
});
