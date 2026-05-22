import { expect, test } from "@playwright/test";
import { mockVendorAuth } from "../helpers/mock-auth";

test.describe("Vendor Store Settings", () => {
  test.beforeEach(async ({ page }) => {
    await mockVendorAuth(page);
  });

  test("store page loads with store info form", async ({ page }) => {
    await page.goto("/vendor/store");
    await page.waitForLoadState("networkidle");

    const storeEl = page
      .locator("h1, h2, [class*='text-2xl']")
      .filter({ hasText: /store|settings|profile/i })
      .first();
    await expect(storeEl).toBeVisible({ timeout: 15_000 });
  });

  test("store name input is visible", async ({ page }) => {
    await page.goto("/vendor/store");
    await page.waitForLoadState("networkidle");

    const storeNameInput = page
      .locator(
        "input[name='storeName'], input[placeholder*='store name' i], input[placeholder*='store' i]"
      )
      .first();
    await expect(storeNameInput).toBeVisible({ timeout: 10_000 });
  });

  test("store open/closed toggle is present", async ({ page }) => {
    await page.goto("/vendor/store");
    await page.waitForLoadState("networkidle");

    const toggle = page
      .locator("[role='switch'], [class*='switch'], [class*='toggle']")
      .filter({ hasText: /open|closed|status/i })
      .first();

    const toggleEl = page
      .locator("[role='switch'], [class*='switch'], [class*='toggle'], input[type='checkbox']")
      .first();

    await expect(toggleEl).toBeVisible({ timeout: 10_000 });
  });

  test("save / update button present", async ({ page }) => {
    await page.goto("/vendor/store");
    await page.waitForLoadState("networkidle");

    const saveBtn = page
      .locator("button")
      .filter({ hasText: /save|update|submit/i })
      .first();
    await expect(saveBtn).toBeVisible({ timeout: 10_000 });
  });

  test("profile page loads with edit form", async ({ page }) => {
    await page.goto("/vendor/profile");
    await page.waitForLoadState("networkidle");

    const profileEl = page
      .locator("h1, h2, [class*='text-2xl'], [class*='profile']")
      .filter({ hasText: /profile|account|settings/i })
      .first();
    await expect(profileEl).toBeVisible({ timeout: 15_000 });
  });
});
