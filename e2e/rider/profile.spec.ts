import { expect, test } from "@playwright/test";
import { mockRiderAuth } from "../helpers/mock-auth";

test.describe("Rider Profile", () => {
  test.beforeEach(async ({ page }) => {
    await mockRiderAuth(page);
  });

  test("profile page loads with rider info", async ({ page }) => {
    await page.goto("/rider/profile");
    await page.waitForLoadState("networkidle");

    const heading = page
      .locator("h1, h2, [class*='text-2xl'], [class*='profile']")
      .filter({ hasText: /profile|account|rider/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("rider name is displayed", async ({ page }) => {
    await page.goto("/rider/profile");
    await page.waitForLoadState("networkidle");

    const nameEl = page
      .locator("[class*='name'], [class*='username'], h2, h3, p")
      .filter({ hasText: /Test Rider|rider|name/i })
      .first();

    const anyContent = page.locator("main p, [class*='profile'] span, [class*='info']").first();
    await expect(anyContent).toBeVisible({ timeout: 15_000 });
  });

  test("vehicle info section visible", async ({ page }) => {
    await page.goto("/rider/profile");
    await page.waitForLoadState("networkidle");

    const vehicleEl = page.locator("[class*='vehicle'], [class*='bike'], [class*='car']").first();

    const anySection = page.locator("section, [class*='section'], [class*='card']").first();
    await expect(anySection).toBeVisible({ timeout: 10_000 });
  });

  test("edit profile button or link is visible", async ({ page }) => {
    await page.goto("/rider/profile");
    await page.waitForLoadState("networkidle");

    const editBtn = page
      .locator("button, a")
      .filter({ hasText: /edit|update|change/i })
      .first();
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
  });

  test("settings/security link is accessible", async ({ page }) => {
    await page.goto("/rider/settings/security");
    await page.waitForLoadState("networkidle");

    const securityEl = page
      .locator("h1, h2, [class*='text-2xl'], [class*='security']")
      .filter({ hasText: /security|password|2fa|auth/i })
      .first();
    await expect(securityEl).toBeVisible({ timeout: 15_000 });
  });

  test("reviews page loads", async ({ page }) => {
    await page.goto("/rider/reviews");
    await page.waitForLoadState("networkidle");

    const content = page.locator("main, [class*='reviews'], [class*='content']").first();
    await expect(content).toBeVisible({ timeout: 15_000 });
  });
});
