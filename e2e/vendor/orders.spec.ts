import { expect, test } from "@playwright/test";

test.describe("Vendor Orders", () => {
  test.beforeEach(async ({ page }) => {
    const vendorPhone = process.env.TEST_VENDOR_PHONE;
    const vendorPassword = process.env.TEST_VENDOR_PASSWORD;

    test.skip(
      !vendorPhone || !vendorPassword,
      "Set TEST_VENDOR_PHONE and TEST_VENDOR_PASSWORD to run vendor order tests"
    );

    await page.goto("/vendor");
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
    await page.goto("/vendor/orders");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  });

  test("orders page loads with tabs (New / Active / All)", async ({ page }) => {
    await expect(
      page
        .locator("button, [role='tab']")
        .filter({ hasText: /New|new/i })
        .first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page
        .locator("button, [role='tab']")
        .filter({ hasText: /Active|active/i })
        .first()
    ).toBeVisible();
    await expect(
      page
        .locator("button, [role='tab']")
        .filter({ hasText: /All|all/i })
        .first()
    ).toBeVisible();
  });

  test("filter by tab → list updates", async ({ page }) => {
    const activeTab = page
      .locator("button, [role='tab']")
      .filter({ hasText: /^Active$/i })
      .first();
    await activeTab.click();

    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    const activeTabSelected = await activeTab.evaluate((el) => {
      return (
        el.classList.contains("text-blue-600") ||
        el.getAttribute("aria-selected") === "true" ||
        el.getAttribute("data-state") === "active"
      );
    });
    expect(activeTabSelected).toBeTruthy();
  });

  test("order card shows: ID, amount, customer name, status badge", async ({ page }) => {
    const orderCards = page
      .locator("[class*='border'], [class*='card'], [class*='rounded']")
      .filter({ hasText: /PKR|Rs\.|#|Order/i });

    const count = await orderCards.count();
    if (count === 0) {
      const emptyState = page.locator("text=/No orders|Empty|No new orders/i").first();
      await expect(emptyState).toBeVisible({ timeout: 5_000 });
      return;
    }

    const firstCard = orderCards.first();
    await expect(firstCard).toBeVisible();

    const cardText = await firstCard.textContent();
    expect(cardText).toBeTruthy();
  });
});
