import { expect, test } from "@playwright/test";
import { mockVendorAuth } from "../helpers/mock-auth";

test.describe("Vendor Wallet", () => {
  test.beforeEach(async ({ page }) => {
    await mockVendorAuth(page);
  });

  test("wallet page loads with balance card", async ({ page }) => {
    await page.goto("/vendor/wallet");
    await page.waitForLoadState("networkidle");

    const walletEl = page
      .locator("h1, h2, [class*='text-2xl'], [class*='wallet'], [class*='balance']")
      .filter({ hasText: /wallet|balance|PKR/i })
      .first();
    await expect(walletEl).toBeVisible({ timeout: 15_000 });
  });

  test("balance amount is displayed (PKR or number)", async ({ page }) => {
    await page.goto("/vendor/wallet");
    await page.waitForLoadState("networkidle");

    const balanceEl = page
      .locator("[class*='balance'], [class*='amount'], [class*='wallet-value']")
      .filter({ hasText: /\d+|PKR|Rs\.?/i })
      .first();
    await expect(balanceEl).toBeVisible({ timeout: 10_000 });
  });

  test("transaction history section is visible", async ({ page }) => {
    await page.goto("/vendor/wallet");
    await page.waitForLoadState("networkidle");

    const historyEl = page
      .locator("h2, h3, [class*='history'], [class*='transactions']")
      .filter({ hasText: /transaction|history|recent/i })
      .first();
    await expect(historyEl).toBeVisible({ timeout: 10_000 });
  });

  test("withdraw button is visible", async ({ page }) => {
    await page.goto("/vendor/wallet");
    await page.waitForLoadState("networkidle");

    const withdrawBtn = page
      .locator("button")
      .filter({ hasText: /withdraw|payout|request/i })
      .first();
    await expect(withdrawBtn).toBeVisible({ timeout: 10_000 });
  });
});
