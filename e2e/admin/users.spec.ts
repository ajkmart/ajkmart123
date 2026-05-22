import { expect, test } from "@playwright/test";

// storageState is set at the project level (playwright.config.ts → admin project)
// so every test already has an authenticated admin session.

test.describe("Admin Users", () => {
  test("users page loads with Users heading", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("h1").filter({ hasText: /users/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("search input is present on users page", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("domcontentloaded");

    const searchInput = page
      .locator(
        "input[placeholder*='search' i], input[placeholder*='filter' i], input[type='search']"
      )
      .first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
  });

  test("users table has column headers (Name / Phone / Role / Status)", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page
        .locator("th, [role='columnheader']")
        .filter({ hasText: /name|phone|role|status/i })
        .first()
    ).toBeVisible({ timeout: 12_000 });
  });

  test("role filter chips visible (Customer / Rider / Vendor / All)", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("domcontentloaded");

    const filterEl = page
      .locator("button, [role='tab'], select")
      .filter({ hasText: /customer|rider|vendor|all/i })
      .first();
    await expect(filterEl).toBeVisible({ timeout: 10_000 });
  });

  test("click a user row → detail panel or modal appears", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const rows = page.locator("tbody tr, [role='row']:not([role='columnheader'])");
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
      await page.waitForTimeout(800);
      const panel = page
        .locator("[role='dialog'], [data-state='open'], [class*='sheet'], [class*='modal']")
        .first();
      await expect(panel).toBeVisible({ timeout: 8_000 });
    } else {
      test.skip();
    }
  });
});
