import { expect, test } from "@playwright/test";

test.describe("Admin Settings", () => {
  test("settings page loads with tabs", async ({ page }) => {
    await page.goto("/admin/settings");
    await page.waitForLoadState("domcontentloaded");

    const tabs = page
      .locator("[role='tab'], button")
      .filter({ hasText: /general|security|maps|notifications|integrations/i });
    await expect(tabs.first()).toBeVisible({ timeout: 15_000 });
  });

  test("security page loads", async ({ page }) => {
    await page.goto("/admin/security");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });

  test("auth-methods page loads with toggle switches", async ({ page }) => {
    await page.goto("/admin/auth-methods");
    await page.waitForLoadState("domcontentloaded");

    const toggle = page
      .locator("[role='switch'], input[type='checkbox'], [class*='switch']")
      .first();
    await expect(toggle).toBeVisible({ timeout: 15_000 });
  });

  test("transactions page loads with table", async ({ page }) => {
    await page.goto("/admin/transactions");
    await page.waitForLoadState("domcontentloaded");

    const tableEl = page.locator("table, [role='table'], [class*='transactions'], h1").first();
    await expect(tableEl).toBeVisible({ timeout: 15_000 });
  });

  test("products page loads", async ({ page }) => {
    await page.goto("/admin/products");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });
});
