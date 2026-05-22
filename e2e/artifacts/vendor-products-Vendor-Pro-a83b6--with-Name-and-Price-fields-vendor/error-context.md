# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: vendor/products.spec.ts >> Vendor Products >> click Add Product → form/dialog appears with Name and Price fields
- Location: e2e/vendor/products.spec.ts:52:7

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for locator('button').filter({ hasText: /add product|new product|\+ product/i }).first()

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications (F8)":
    - list
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - img [ref=e8]
          - generic [ref=e11]: AJKMart Vendor
        - generic [ref=e12]:
          - button "EN" [ref=e13] [cursor=pointer]:
            - img [ref=e14]
            - text: EN
          - button "Login" [ref=e17] [cursor=pointer]
          - button "Open Your Shop" [ref=e18] [cursor=pointer]
    - generic [ref=e20]:
      - generic [ref=e21]:
        - generic [ref=e22]:
          - img [ref=e23]
          - text: Sell Smart. Grow Fast.
        - heading "Your Shop, Digitally Supercharged." [level=1] [ref=e25]
        - paragraph [ref=e26]: List products, manage orders, run promotions, and grow your business — all from one powerful vendor dashboard.
        - generic [ref=e27]:
          - button "Open Your Shop" [ref=e28] [cursor=pointer]:
            - text: Open Your Shop
            - img [ref=e29]
          - button "Login" [ref=e31] [cursor=pointer]
      - generic [ref=e33]:
        - generic [ref=e34]:
          - generic [ref=e38]: Vendor Dashboard
          - generic [ref=e41]: Live
        - generic [ref=e42]:
          - generic [ref=e43]:
            - img [ref=e45]
            - generic [ref=e47]:
              - generic [ref=e48]: Today's Revenue
              - generic [ref=e49]: ₨ 18,450
            - generic [ref=e50]: +12%
          - generic [ref=e51]:
            - generic [ref=e53]:
              - generic [ref=e54]: Chicken Karahi ×2
              - generic [ref=e55]: 2m ago
            - generic [ref=e56]: New
          - generic [ref=e57]:
            - generic [ref=e59]:
              - generic [ref=e60]: Beef Pulao ×1
              - generic [ref=e61]: 8m ago
            - generic [ref=e62]: Preparing
          - generic [ref=e63]:
            - generic [ref=e65]:
              - generic [ref=e66]: Pakora Tray ×3
              - generic [ref=e67]: 22m ago
            - generic [ref=e68]: Delivered
          - generic [ref=e69]:
            - generic [ref=e70]:
              - generic [ref=e71]: "24"
              - generic [ref=e72]: Orders
            - generic [ref=e73]:
              - generic [ref=e74]: ₨2.1K
              - generic [ref=e75]: Avg Order
            - generic [ref=e76]:
              - generic [ref=e77]: 4.8★
              - generic [ref=e78]: Rating
    - generic [ref=e80]:
      - paragraph [ref=e81]: Trusted by thousands of vendors
      - generic [ref=e82]:
        - generic [ref=e83]:
          - generic [ref=e84]: 4,200+
          - generic [ref=e85]: Active vendors
        - generic [ref=e86]:
          - generic [ref=e87]: "18"
          - generic [ref=e88]: Cities
        - generic [ref=e89]:
          - generic [ref=e90]: 2.1M+
          - generic [ref=e91]: Orders processed
    - generic [ref=e92]:
      - heading "Everything your business needs" [level=2] [ref=e94]
      - generic [ref=e96]:
        - generic [ref=e97]:
          - generic [ref=e98]: 📋
          - heading "Order Dashboard" [level=3] [ref=e99]
          - paragraph [ref=e100]: Accept, manage, and track every order in real time — with push alerts for new arrivals.
        - generic [ref=e101]:
          - generic [ref=e102]: 📊
          - heading "Sales Analytics" [level=3] [ref=e103]
          - paragraph [ref=e104]: Revenue charts, top-selling products, and daily summaries help you make smarter decisions.
        - generic [ref=e105]:
          - generic [ref=e106]: 📦
          - heading "Product Management" [level=3] [ref=e107]
          - paragraph [ref=e108]: Upload items, set prices, manage stock levels, and run promotions — all from one screen.
        - generic [ref=e109]:
          - generic [ref=e110]: 💰
          - heading "Instant Payouts" [level=3] [ref=e111]
          - paragraph [ref=e112]: Earnings land in your digital wallet automatically. Withdraw anytime to EasyPaisa or JazzCash.
        - generic [ref=e113]:
          - generic [ref=e114]: 💬
          - heading "Customer Chat" [level=3] [ref=e115]
          - paragraph [ref=e116]: Respond to customers in real time, resolve issues fast, and build lasting loyalty.
        - generic [ref=e117]:
          - generic [ref=e118]: 🎯
          - heading "Campaigns & Promos" [level=3] [ref=e119]
          - paragraph [ref=e120]: Join platform-wide campaigns or create your own discount codes to drive more sales.
    - generic [ref=e122]:
      - heading "Start selling in 3 easy steps" [level=2] [ref=e124]
      - generic [ref=e126]:
        - generic [ref=e127]:
          - generic [ref=e128]:
            - text: "01"
            - generic [ref=e129]: ✓
          - heading "Register Your Store" [level=3] [ref=e131]
          - paragraph [ref=e132]: Sign up with your phone or email and provide your store name and category.
        - generic [ref=e133]:
          - generic [ref=e134]:
            - text: "02"
            - generic [ref=e135]: ✓
          - heading "Add Your Products" [level=3] [ref=e137]
          - paragraph [ref=e138]: Upload product photos, set prices and stock levels. Go live in minutes.
        - generic [ref=e139]:
          - generic [ref=e140]:
            - text: "03"
            - generic [ref=e141]: ✓
          - heading "Receive & Get Paid" [level=3] [ref=e142]
          - paragraph [ref=e143]: Accept orders from the dashboard, track delivery, and get paid to your wallet.
    - generic [ref=e144]:
      - heading "Why vendors choose AJKMart" [level=2] [ref=e146]
      - generic [ref=e148]:
        - generic [ref=e149]:
          - img [ref=e151]
          - generic [ref=e153]: Instant order notifications
        - generic [ref=e154]:
          - img [ref=e156]
          - generic [ref=e158]: Real-time inventory control
        - generic [ref=e159]:
          - img [ref=e161]
          - generic [ref=e163]: Weekly payout to wallet
        - generic [ref=e164]:
          - img [ref=e166]
          - generic [ref=e168]: Dedicated vendor support
        - generic [ref=e169]:
          - img [ref=e171]
          - generic [ref=e173]: Sales reports & analytics
        - generic [ref=e174]:
          - img [ref=e176]
          - generic [ref=e178]: Promotional tools
        - generic [ref=e179]:
          - img [ref=e181]
          - generic [ref=e183]: Multi-language dashboard
        - generic [ref=e184]:
          - img [ref=e186]
          - generic [ref=e188]: 24/7 platform uptime
    - generic [ref=e190]:
      - img [ref=e192]
      - heading "Ready to grow your business?" [level=2] [ref=e195]
      - paragraph [ref=e196]: Join 4,200+ vendors growing with AJKMart
      - button "Open Your Store Today" [ref=e197] [cursor=pointer]:
        - text: Open Your Store Today
        - img [ref=e198]
    - contentinfo [ref=e200]:
      - img [ref=e201]
      - text: © 2026 AJKMart · Vendor Platform
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { mockVendorAuth } from "../helpers/mock-auth";
  3  | 
  4  | test.describe("Vendor Products", () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await mockVendorAuth(page);
  7  |   });
  8  | 
  9  |   test("products page loads with heading", async ({ page }) => {
  10 |     await page.goto("/vendor/products");
  11 |     await page.waitForLoadState("networkidle");
  12 | 
  13 |     const heading = page
  14 |       .locator("h1, h2, [class*='text-2xl']")
  15 |       .filter({ hasText: /products/i })
  16 |       .first();
  17 |     await expect(heading).toBeVisible({ timeout: 15_000 });
  18 |   });
  19 | 
  20 |   test("Add Product button is visible", async ({ page }) => {
  21 |     await page.goto("/vendor/products");
  22 |     await page.waitForLoadState("networkidle");
  23 | 
  24 |     const addBtn = page
  25 |       .locator("button")
  26 |       .filter({ hasText: /add product|new product|\+ product/i })
  27 |       .first();
  28 |     await expect(addBtn).toBeVisible({ timeout: 10_000 });
  29 |   });
  30 | 
  31 |   test("product list shows product cards with name and price", async ({ page }) => {
  32 |     await page.goto("/vendor/products");
  33 |     await page.waitForLoadState("networkidle");
  34 |     await page.waitForTimeout(1000);
  35 | 
  36 |     const productItem = page
  37 |       .locator("[class*='product-card'], [class*='product-item'], [class*='product-row'], tbody tr")
  38 |       .first();
  39 |     await expect(productItem).toBeVisible({ timeout: 10_000 });
  40 |   });
  41 | 
  42 |   test("search / filter input on products page", async ({ page }) => {
  43 |     await page.goto("/vendor/products");
  44 |     await page.waitForLoadState("networkidle");
  45 | 
  46 |     const searchInput = page
  47 |       .locator("input[placeholder*='search' i], input[placeholder*='product' i], input[type='search']")
  48 |       .first();
  49 |     await expect(searchInput).toBeVisible({ timeout: 10_000 });
  50 |   });
  51 | 
  52 |   test("click Add Product → form/dialog appears with Name and Price fields", async ({ page }) => {
  53 |     await page.goto("/vendor/products");
  54 |     await page.waitForLoadState("networkidle");
  55 | 
  56 |     const addBtn = page
  57 |       .locator("button")
  58 |       .filter({ hasText: /add product|new product|\+ product/i })
  59 |       .first();
> 60 |     await addBtn.click();
     |                  ^ Error: locator.click: Test timeout of 20000ms exceeded.
  61 |     await page.waitForTimeout(500);
  62 | 
  63 |     const formOrDialog = page
  64 |       .locator("[role='dialog'], [data-state='open'], form, [class*='modal']")
  65 |       .first();
  66 |     await expect(formOrDialog).toBeVisible({ timeout: 8_000 });
  67 | 
  68 |     const nameInput = page
  69 |       .locator("input[name='name'], input[placeholder*='name' i], input[placeholder*='product name' i]")
  70 |       .first();
  71 |     await expect(nameInput).toBeVisible({ timeout: 5_000 });
  72 |   });
  73 | 
  74 |   test("active / inactive product toggle present", async ({ page }) => {
  75 |     await page.goto("/vendor/products");
  76 |     await page.waitForLoadState("networkidle");
  77 |     await page.waitForTimeout(1000);
  78 | 
  79 |     const toggle = page
  80 |       .locator("[role='switch'], input[type='checkbox'], [class*='switch'], [class*='toggle']")
  81 |       .first();
  82 |     await expect(toggle).toBeVisible({ timeout: 10_000 });
  83 |   });
  84 | });
  85 | 
```