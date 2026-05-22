import { expect, test } from "@playwright/test";

test.describe("Rider Login", () => {
  test("load /rider → login screen renders", async ({ page }) => {
    await page.goto("/rider/login");

    const heading = page
      .locator("h1, h2, [class*='text-2xl']")
      .filter({ hasText: /Deliver with AJKMart/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("Phone OTP tab shows phone input and Send OTP button", async ({ page }) => {
    await page.goto("/rider/login");
    await page.waitForSelector("text=Deliver with AJKMart", { timeout: 15_000 });

    const phoneTab = page.locator("button", { hasText: "Phone" }).first();
    await expect(phoneTab).toBeVisible();
    await phoneTab.click();

    await expect(page.locator('input[placeholder="03XXXXXXXXX"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Send OTP")')).toBeVisible();
  });

  test("Password tab shows identifier and password inputs", async ({ page }) => {
    await page.goto("/rider/login");
    await page.waitForSelector("text=Deliver with AJKMart", { timeout: 15_000 });

    const passwordTab = page.locator("button", { hasText: "Password" }).first();
    await expect(passwordTab).toBeVisible();
    await passwordTab.click();

    const identifierInput = page
      .locator(
        'input[placeholder="Phone / Username"], input[placeholder*="Username" i], input[placeholder*="Phone" i]'
      )
      .first();
    await expect(identifierInput).toBeVisible({ timeout: 5_000 });

    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("home screen loads after login (online toggle visible)", async ({ page }) => {
    const riderPhone = process.env.TEST_RIDER_PHONE;
    const riderPassword = process.env.TEST_RIDER_PASSWORD;

    test.skip(
      !riderPhone || !riderPassword,
      "Set TEST_RIDER_PHONE and TEST_RIDER_PASSWORD env vars to run this test"
    );

    await page.goto("/rider/login");
    await page.waitForSelector("text=Deliver with AJKMart", { timeout: 15_000 });

    await page.locator("button", { hasText: "Password" }).first().click();

    const identifierInput = page
      .locator(
        'input[placeholder="Phone / Username"], input[placeholder*="Username" i], input[placeholder*="Phone" i]'
      )
      .first();
    await identifierInput.fill(riderPhone!);
    await page.locator('input[type="password"]').first().fill(riderPassword!);
    await page
      .locator("button")
      .filter({ hasText: /sign in/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/rider\/?$/, { timeout: 20_000 });

    const onlineToggle = page
      .locator(
        "[class*='toggle'], [role='switch'], button[class*='online'], text=Go Online, text=Online, text=Offline"
      )
      .first();
    await expect(onlineToggle).toBeVisible({ timeout: 10_000 });
  });
});
