import { expect, test } from "@playwright/test";

test.describe("Admin Rides", () => {
  test("rides page loads with Rides heading", async ({ page }) => {
    await page.goto("/admin/rides");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("h1").filter({ hasText: /rides/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("rides table or list renders", async ({ page }) => {
    await page.goto("/admin/rides");
    await page.waitForLoadState("domcontentloaded");

    const tableOrList = page
      .locator("table, [role='table'], [class*='ride-row'], [class*='rides-list']")
      .first();
    await expect(tableOrList).toBeVisible({ timeout: 12_000 });
  });

  test("status filters visible (Pending / Active / Completed / Cancelled)", async ({ page }) => {
    await page.goto("/admin/rides");
    await page.waitForLoadState("domcontentloaded");

    const filterEl = page
      .locator("button, [role='tab'], select")
      .filter({ hasText: /pending|active|completed|cancelled|all/i })
      .first();
    await expect(filterEl).toBeVisible({ timeout: 10_000 });
  });

  test("vehicle type filter visible (Bike / Car / Van)", async ({ page }) => {
    await page.goto("/admin/rides");
    await page.waitForLoadState("domcontentloaded");

    const filterEl = page
      .locator("button, select, [role='option'], [role='tab']")
      .filter({ hasText: /bike|car|van|vehicle|all/i })
      .first();
    await expect(filterEl).toBeVisible({ timeout: 10_000 });
  });

  test("click ride row → detail modal appears", async ({ page }) => {
    await page.goto("/admin/rides");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const rows = page.locator("tbody tr, [data-row], [class*='ride-row']");
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
      await page.waitForTimeout(800);
      const modal = page
        .locator("[role='dialog'], [data-state='open'], [class*='modal'], [class*='sheet']")
        .first();
      await expect(modal).toBeVisible({ timeout: 8_000 });
    } else {
      test.skip();
    }
  });
});
