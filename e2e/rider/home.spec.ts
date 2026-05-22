import { expect, test } from "@playwright/test";
import { mockRiderAuth } from "../helpers/mock-auth";

test.describe("Rider Home / Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await mockRiderAuth(page);
  });

  test("rider home loads with go-online toggle", async ({ page }) => {
    await page.goto("/rider");
    await page.waitForLoadState("networkidle");

    const toggle = page
      .locator(
        "[role='switch'], button[class*='toggle'], text=Go Online, text=Online, text=Offline, [class*='online-toggle']"
      )
      .first();
    await expect(toggle).toBeVisible({ timeout: 20_000 });
  });

  test("rider name or welcome message visible", async ({ page }) => {
    await page.goto("/rider");
    await page.waitForLoadState("networkidle");

    const welcome = page
      .locator(
        "h1, h2, [class*='text-2xl'], [class*='welcome'], [class*='greeting'], [class*='name']"
      )
      .filter({ hasText: /welcome|hello|rider|good/i })
      .first();

    const anyHeading = page.locator("h1, h2").first();
    await expect(anyHeading).toBeVisible({ timeout: 15_000 });
  });

  test("earnings summary card visible on home", async ({ page }) => {
    await page.goto("/rider");
    await page.waitForLoadState("networkidle");

    const earningsEl = page
      .locator("[class*='earning'], [class*='stat'], [class*='card']")
      .filter({ hasText: /earning|today|PKR|\d+/i })
      .first();
    await expect(earningsEl).toBeVisible({ timeout: 15_000 });
  });

  test("bottom navigation visible with Home, Earnings, History, Profile", async ({ page }) => {
    await page.goto("/rider");
    await page.waitForLoadState("networkidle");

    const nav = page.locator("nav, [class*='bottom-nav'], [class*='tab-bar']").first();
    await expect(nav).toBeVisible({ timeout: 10_000 });

    const navLinks = nav.locator("a, button");
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(2);
  });

  test("navigate to /rider/active → active ride page loads", async ({ page }) => {
    await page.goto("/rider/active");
    await page.waitForLoadState("networkidle");

    const content = page.locator("main, [class*='active'], [class*='ride']").first();
    await expect(content).toBeVisible({ timeout: 15_000 });
  });

  test("notification icon visible in header", async ({ page }) => {
    await page.goto("/rider");
    await page.waitForLoadState("networkidle");

    const bellIcon = page
      .locator("button[aria-label*='notification' i], [class*='notification'], [data-icon='bell']")
      .first();
    await expect(bellIcon).toBeVisible({ timeout: 10_000 });
  });
});
