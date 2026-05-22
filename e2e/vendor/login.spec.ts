import { expect, test } from "@playwright/test";

test.describe("Vendor Login", () => {
  test("load /vendor → login screen renders", async ({ page }) => {
    await page.goto("/vendor/login");

    await expect(page.locator("text=AJKMart Vendor").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=Sign in to your vendor account").first()).toBeVisible();
  });

  test("'Phone' tab → phone input visible", async ({ page }) => {
    await page.goto("/vendor/login");
    await page.waitForSelector("text=AJKMart Vendor", { timeout: 15_000 });

    const phoneTab = page.locator("button", { hasText: "Phone" }).first();
    await expect(phoneTab).toBeVisible();
    await phoneTab.click();

    await expect(page.locator('input[placeholder="03XXXXXXXXX"]')).toBeVisible();
    await expect(page.locator('button:has-text("Send OTP")')).toBeVisible();
  });

  test("'Password' tab → identifier + password inputs visible", async ({ page }) => {
    await page.goto("/vendor/login");
    await page.waitForSelector("text=AJKMart Vendor", { timeout: 15_000 });

    const passwordTab = page.locator("button", { hasText: "Password" }).first();
    await expect(passwordTab).toBeVisible();
    await passwordTab.click();

    const identifierInput = page
      .locator(
        'input[placeholder="Phone / Username"], input[placeholder*="Username" i], input[placeholder*="Phone" i]'
      )
      .first();
    await expect(identifierInput).toBeVisible({ timeout: 5_000 });

    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();
  });

  test("successful vendor password login → dashboard loads", async ({ page }) => {
    const vendorPhone = process.env.TEST_VENDOR_PHONE;
    const vendorPassword = process.env.TEST_VENDOR_PASSWORD;

    test.skip(
      !vendorPhone || !vendorPassword,
      "Set TEST_VENDOR_PHONE and TEST_VENDOR_PASSWORD env vars to run this test"
    );

    await page.goto("/vendor/login");
    await page.waitForSelector("text=AJKMart Vendor", { timeout: 15_000 });

    await page.locator("button", { hasText: "Password" }).first().click();

    const identifierInput = page
      .locator(
        'input[placeholder="Phone / Username"], input[placeholder*="Username" i], input[placeholder*="Phone" i]'
      )
      .first();
    await identifierInput.fill(vendorPhone!);
    await page.locator('input[type="password"]').first().fill(vendorPassword!);
    await page
      .locator("button")
      .filter({ hasText: /sign in/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/vendor\/?$|\/vendor\/dashboard/, { timeout: 20_000 });
  });

  test("logout → redirected to /vendor login", async ({ page }) => {
    test.skip(
      true,
      "Requires authenticated session — skip until TEST_VENDOR_* credentials are set"
    );
  });
});
