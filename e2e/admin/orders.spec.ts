import { expect, test } from "@playwright/test";

test.describe("Admin Orders", () => {
  test("orders page loads with Orders heading", async ({ page }) => {
    await page.goto("/admin/orders");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page
        .locator("h1")
        .filter({ hasText: /orders/i })
        .first()
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test("orders table or list renders", async ({ page }) => {
    await page.goto("/admin/orders");
    await page.waitForLoadState("domcontentloaded");

    const tableOrList = page
      .locator("table, [role='table'], [class*='orders-list'], [class*='order-row']")
      .first();
    await expect(tableOrList).toBeVisible({ timeout: 12_000 });
  });

  test("status filter tabs visible (Pending / Active / Completed / Cancelled)", async ({
    page,
  }) => {
    await page.goto("/admin/orders");
    await page.waitForLoadState("domcontentloaded");

    const filterEl = page
      .locator("button, [role='tab']")
      .filter({ hasText: /pending|active|completed|cancelled|all/i })
      .first();
    await expect(filterEl).toBeVisible({ timeout: 10_000 });
  });

  test("search / date filter input visible", async ({ page }) => {
    await page.goto("/admin/orders");
    await page.waitForLoadState("domcontentloaded");

    const searchEl = page
      .locator(
        "input[placeholder*='search' i], input[placeholder*='order' i], input[type='search'], input[type='date']"
      )
      .first();
    await expect(searchEl).toBeVisible({ timeout: 10_000 });
  });

  test("click order row → detail modal opens", async ({ page }) => {
    await page.goto("/admin/orders");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const rows = page.locator("tbody tr, [data-row], [class*='order-row']");
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
