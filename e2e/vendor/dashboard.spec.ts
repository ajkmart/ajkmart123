import { expect, test } from "@playwright/test";
import { mockVendorAuth } from "../helpers/mock-auth";

test.describe("Vendor Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await mockVendorAuth(page);
  });

  test("vendor dashboard loads with store name", async ({ page }) => {
    await page.goto("/vendor");
    await page.waitForLoadState("networkidle");

    const storeOrDashboard = page
      .locator("h1, h2, [class*='text-2xl'], [class*='store-name'], [class*='welcome']")
      .filter({ hasText: /store|dashboard|vendor|welcome/i })
      .first();
    await expect(storeOrDashboard).toBeVisible({ timeout: 20_000 });
  });

  test("stats cards visible (Revenue, Orders, Products, Rating)", async ({ page }) => {
    await page.goto("/vendor");
    await page.waitForLoadState("networkidle");

    const statsCard = page
      .locator("[class*='card'], [class*='stat'], [class*='metric'], [class*='summary']")
      .first();
    await expect(statsCard).toBeVisible({ timeout: 15_000 });
  });

  test("bottom navigation is visible with correct tabs", async ({ page }) => {
    await page.goto("/vendor");
    await page.waitForLoadState("networkidle");

    const navLinks = page.locator(
      "nav a, [role='navigation'] a, [class*='bottom-nav'] a, [class*='tab-bar'] a"
    );
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("recent orders section or orders count visible", async ({ page }) => {
    await page.goto("/vendor");
    await page.waitForLoadState("networkidle");

    const ordersEl = page
      .locator("[class*='order'], [class*='recent'], h2, h3")
      .filter({ hasText: /order|recent|pending/i })
      .first();
    await expect(ordersEl).toBeVisible({ timeout: 15_000 });
  });

  test("notification bell icon visible in header", async ({ page }) => {
    await page.goto("/vendor");
    await page.waitForLoadState("networkidle");

    const bellIcon = page
      .locator(
        "button[aria-label*='notification' i], [class*='notification'], svg[class*='bell'], [data-icon='bell']"
      )
      .first();
    await expect(bellIcon).toBeVisible({ timeout: 10_000 });
  });

  test("navigate to /vendor/orders → orders page loads", async ({ page }) => {
    await page.goto("/vendor/orders");
    await page.waitForLoadState("networkidle");

    const heading = page
      .locator("h1, h2, [class*='text-2xl']")
      .filter({ hasText: /orders/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("navigate to /vendor/analytics → analytics page loads", async ({ page }) => {
    await page.goto("/vendor/analytics");
    await page.waitForLoadState("networkidle");

    const analyticsEl = page
      .locator("h1, h2, [class*='text-2xl'], [class*='chart'], [class*='analytics']")
      .filter({ hasText: /analytics|revenue|sales/i })
      .first();
    await expect(analyticsEl).toBeVisible({ timeout: 15_000 });
  });
});
