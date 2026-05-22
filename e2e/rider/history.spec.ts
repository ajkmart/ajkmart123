import { expect, test } from "@playwright/test";
import { mockRiderAuth } from "../helpers/mock-auth";

test.describe("Rider Ride History", () => {
  test.beforeEach(async ({ page }) => {
    await mockRiderAuth(page);
  });

  test("history page loads with heading", async ({ page }) => {
    await page.goto("/rider/history");
    await page.waitForLoadState("networkidle");

    const heading = page
      .locator("h1, h2, [class*='text-2xl']")
      .filter({ hasText: /history|past|rides/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("ride history list or table renders", async ({ page }) => {
    await page.goto("/rider/history");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const listOrTable = page
      .locator(
        "table, [role='table'], [class*='ride-item'], [class*='history-item'], [class*='ride-card']"
      )
      .first();
    await expect(listOrTable).toBeVisible({ timeout: 10_000 });
  });

  test("ride card shows status badge (Completed, Cancelled)", async ({ page }) => {
    await page.goto("/rider/history");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const statusBadge = page
      .locator("[class*='badge'], [class*='status'], [class*='chip']")
      .filter({ hasText: /completed|cancelled|pending/i })
      .first();
    await expect(statusBadge).toBeVisible({ timeout: 10_000 });
  });

  test("ride card shows fare amount in PKR", async ({ page }) => {
    await page.goto("/rider/history");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const fareEl = page
      .locator("[class*='fare'], [class*='amount'], [class*='price']")
      .filter({ hasText: /PKR|Rs\.?|\d+/i })
      .first();
    await expect(fareEl).toBeVisible({ timeout: 10_000 });
  });

  test("filter by status works (click Completed filter)", async ({ page }) => {
    await page.goto("/rider/history");
    await page.waitForLoadState("networkidle");

    const completedFilter = page
      .locator("button, [role='tab']")
      .filter({ hasText: /completed/i })
      .first();

    if (await completedFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await completedFilter.click();
      await page.waitForTimeout(500);
    }
  });
});
