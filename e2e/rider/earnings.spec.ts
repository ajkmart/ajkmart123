import { expect, test } from "@playwright/test";
import { mockRiderAuth } from "../helpers/mock-auth";

test.describe("Rider Earnings", () => {
  test.beforeEach(async ({ page }) => {
    await mockRiderAuth(page);
  });

  test("earnings page loads with heading", async ({ page }) => {
    await page.goto("/rider/earnings");
    await page.waitForLoadState("networkidle");

    const heading = page
      .locator("h1, h2, [class*='text-2xl']")
      .filter({ hasText: /earning|revenue|income/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("today earnings card is visible", async ({ page }) => {
    await page.goto("/rider/earnings");
    await page.waitForLoadState("networkidle");

    const todayEl = page
      .locator("[class*='card'], [class*='stat'], [class*='earning']")
      .filter({ hasText: /today|daily/i })
      .first();
    await expect(todayEl).toBeVisible({ timeout: 10_000 });
  });

  test("weekly / monthly earnings breakdown visible", async ({ page }) => {
    await page.goto("/rider/earnings");
    await page.waitForLoadState("networkidle");

    const periodEl = page
      .locator("[class*='card'], [class*='stat'], h3, [class*='period']")
      .filter({ hasText: /week|month/i })
      .first();
    await expect(periodEl).toBeVisible({ timeout: 10_000 });
  });

  test("total rides count visible", async ({ page }) => {
    await page.goto("/rider/earnings");
    await page.waitForLoadState("networkidle");

    const ridesEl = page
      .locator("[class*='card'], [class*='stat'], [class*='rides'], [class*='count']")
      .filter({ hasText: /rides|trips|\d+/i })
      .first();
    await expect(ridesEl).toBeVisible({ timeout: 10_000 });
  });

  test("wallet page loads with balance", async ({ page }) => {
    await page.goto("/rider/wallet");
    await page.waitForLoadState("networkidle");

    const walletEl = page
      .locator("h1, h2, [class*='text-2xl'], [class*='balance'], [class*='wallet']")
      .filter({ hasText: /wallet|balance|PKR/i })
      .first();
    await expect(walletEl).toBeVisible({ timeout: 15_000 });
  });
});
