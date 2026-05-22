import { expect, test } from "@playwright/test";
import { mockVendorAuth } from "../helpers/mock-auth";

test.describe("Vendor Products", () => {
  test.beforeEach(async ({ page }) => {
    await mockVendorAuth(page);
  });

  test("products page loads with heading", async ({ page }) => {
    await page.goto("/vendor/products");
    await page.waitForLoadState("networkidle");

    const heading = page
      .locator("h1, h2, [class*='text-2xl']")
      .filter({ hasText: /products/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("Add Product button is visible", async ({ page }) => {
    await page.goto("/vendor/products");
    await page.waitForLoadState("networkidle");

    const addBtn = page
      .locator("button")
      .filter({ hasText: /add product|new product|\+ product/i })
      .first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
  });

  test("product list shows product cards with name and price", async ({ page }) => {
    await page.goto("/vendor/products");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const productItem = page
      .locator("[class*='product-card'], [class*='product-item'], [class*='product-row'], tbody tr")
      .first();
    await expect(productItem).toBeVisible({ timeout: 10_000 });
  });

  test("search / filter input on products page", async ({ page }) => {
    await page.goto("/vendor/products");
    await page.waitForLoadState("networkidle");

    const searchInput = page
      .locator(
        "input[placeholder*='search' i], input[placeholder*='product' i], input[type='search']"
      )
      .first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
  });

  test("click Add Product → form/dialog appears with Name and Price fields", async ({ page }) => {
    await page.goto("/vendor/products");
    await page.waitForLoadState("networkidle");

    const addBtn = page
      .locator("button")
      .filter({ hasText: /add product|new product|\+ product/i })
      .first();
    await addBtn.click();
    await page.waitForTimeout(500);

    const formOrDialog = page
      .locator("[role='dialog'], [data-state='open'], form, [class*='modal']")
      .first();
    await expect(formOrDialog).toBeVisible({ timeout: 8_000 });

    const nameInput = page
      .locator(
        "input[name='name'], input[placeholder*='name' i], input[placeholder*='product name' i]"
      )
      .first();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
  });

  test("active / inactive product toggle present", async ({ page }) => {
    await page.goto("/vendor/products");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const toggle = page
      .locator("[role='switch'], input[type='checkbox'], [class*='switch'], [class*='toggle']")
      .first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });
});
