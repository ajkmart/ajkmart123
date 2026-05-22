# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rider/history.spec.ts >> Rider Ride History >> history page loads with heading
- Location: e2e/rider/history.spec.ts:9:7

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: locator('h1, h2, [class*=\'text-2xl\']').filter({ hasText: /history|past|rides/i }).first()
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('h1, h2, [class*=\'text-2xl\']').filter({ hasText: /history|past|rides/i }).first()

```

```yaml
- region "Notifications (F8)":
  - list
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { mockRiderAuth } from "../helpers/mock-auth";
  3  | 
  4  | test.describe("Rider Ride History", () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await mockRiderAuth(page);
  7  |   });
  8  | 
  9  |   test("history page loads with heading", async ({ page }) => {
  10 |     await page.goto("/rider/history");
  11 |     await page.waitForLoadState("networkidle");
  12 | 
  13 |     const heading = page
  14 |       .locator("h1, h2, [class*='text-2xl']")
  15 |       .filter({ hasText: /history|past|rides/i })
  16 |       .first();
> 17 |     await expect(heading).toBeVisible({ timeout: 15_000 });
     |                           ^ Error: expect(locator).toBeVisible() failed
  18 |   });
  19 | 
  20 |   test("ride history list or table renders", async ({ page }) => {
  21 |     await page.goto("/rider/history");
  22 |     await page.waitForLoadState("networkidle");
  23 |     await page.waitForTimeout(1000);
  24 | 
  25 |     const listOrTable = page
  26 |       .locator(
  27 |         "table, [role='table'], [class*='ride-item'], [class*='history-item'], [class*='ride-card']"
  28 |       )
  29 |       .first();
  30 |     await expect(listOrTable).toBeVisible({ timeout: 10_000 });
  31 |   });
  32 | 
  33 |   test("ride card shows status badge (Completed, Cancelled)", async ({ page }) => {
  34 |     await page.goto("/rider/history");
  35 |     await page.waitForLoadState("networkidle");
  36 |     await page.waitForTimeout(1000);
  37 | 
  38 |     const statusBadge = page
  39 |       .locator("[class*='badge'], [class*='status'], [class*='chip']")
  40 |       .filter({ hasText: /completed|cancelled|pending/i })
  41 |       .first();
  42 |     await expect(statusBadge).toBeVisible({ timeout: 10_000 });
  43 |   });
  44 | 
  45 |   test("ride card shows fare amount in PKR", async ({ page }) => {
  46 |     await page.goto("/rider/history");
  47 |     await page.waitForLoadState("networkidle");
  48 |     await page.waitForTimeout(1000);
  49 | 
  50 |     const fareEl = page
  51 |       .locator("[class*='fare'], [class*='amount'], [class*='price']")
  52 |       .filter({ hasText: /PKR|Rs\.?|\d+/i })
  53 |       .first();
  54 |     await expect(fareEl).toBeVisible({ timeout: 10_000 });
  55 |   });
  56 | 
  57 |   test("filter by status works (click Completed filter)", async ({ page }) => {
  58 |     await page.goto("/rider/history");
  59 |     await page.waitForLoadState("networkidle");
  60 | 
  61 |     const completedFilter = page
  62 |       .locator("button, [role='tab']")
  63 |       .filter({ hasText: /completed/i })
  64 |       .first();
  65 | 
  66 |     if (await completedFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
  67 |       await completedFilter.click();
  68 |       await page.waitForTimeout(500);
  69 |     }
  70 |   });
  71 | });
  72 | 
```