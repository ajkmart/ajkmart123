import { expect, test } from "@playwright/test";
import { loginAdmin } from "../helpers/auth";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? process.env.ADMIN_SEED_PASSWORD ?? "Admin@123";

test.describe("Admin Categories", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    await page.waitForSelector('input[aria-label="Filter sidebar items"]', {
      timeout: 35_000,
    });
    const categoriesLink = page.locator('a[href="/admin/categories"]').first();
    await expect(categoriesLink).toBeAttached({ timeout: 10_000 });
    await categoriesLink.evaluate((el: HTMLElement) => el.click());
    await expect(page).toHaveURL(/\/admin\/categories/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
  });

  test("/admin/categories → category tree renders", async ({ page }) => {
    const treeOrEmpty = page
      .locator(
        "[class*='space-y'], [class*='tree'], [class*='card'], table, [class*='rounded-2xl']"
      )
      .first();
    await expect(treeOrEmpty).toBeVisible({ timeout: 15_000 });
  });

  test("click 'Add Category' → dialog opens", async ({ page }) => {
    const addBtn = page
      .locator("button")
      .filter({ hasText: /Add Category/i })
      .first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await expect(
      dialog.locator("input, [name='name'], [placeholder*='name' i]").first()
    ).toBeVisible();
  });

  test("fill name + select type → Save → new category appears in tree", async ({ page }) => {
    const uniqueName = `E2E-Cat-${Date.now()}`;

    const addBtn = page
      .locator("button")
      .filter({ hasText: /Add Category/i })
      .first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const nameInput = dialog
      .locator("input[name='name'], input[placeholder*='name' i], input")
      .first();
    await nameInput.fill(uniqueName);

    const typeSelect = dialog
      .locator("select, [role='combobox']")
      .filter({ hasText: /mart|food|pharmacy|All Types/i })
      .first();
    if ((await typeSelect.count()) > 0) {
      await typeSelect
        .selectOption({ label: "Mart" })
        .catch(() => typeSelect.selectOption({ value: "mart" }));
    }

    const saveBtn = dialog
      .locator("button")
      .filter({ hasText: /save|create|add/i })
      .first();
    await saveBtn.click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.locator(`text=${uniqueName}`).first()).toBeVisible({ timeout: 15_000 });
  });

  test("delete category → confirmation dialog → item removed", async ({ page }) => {
    const uniqueName = `E2E-Del-${Date.now()}`;

    const addBtn = page
      .locator("button")
      .filter({ hasText: /Add Category/i })
      .first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const nameInput = dialog.locator("input").first();
    await nameInput.fill(uniqueName);

    const saveBtn = dialog
      .locator("button")
      .filter({ hasText: /save|create|add/i })
      .first();
    await saveBtn.click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.locator(`text=${uniqueName}`).first()).toBeVisible({ timeout: 15_000 });

    // Scope to the specific category card using the unique name text, then find
    // its trash (delete) button. Use the tightest ancestor that holds the action buttons.
    const categoryNameEl = page
      .locator(`p.truncate, p[class*='truncate'], p[class*='font-bold']`)
      .filter({ hasText: uniqueName })
      .first();
    // Walk up to the Card/row that contains this name, then find the trash icon button
    const deleteBtn = page
      .locator(`button:has(svg.text-red-500)`)
      .filter({
        has: page.locator(
          `xpath=self::button[ancestor::*[.//p[contains(text(),'${uniqueName}')]]]`
        ),
      })
      .first();
    // Fallback: click the trash button that is inside the same card as the category name
    const cardWithName = page
      .locator(`[class*='rounded-2xl'][class*='shadow'], [class*='Card'], [class*='card']`)
      .filter({ hasText: uniqueName })
      .first();
    const trashBtn = cardWithName
      .locator(`button:has(svg.text-red-500), button[class*='red']`)
      .last();
    await expect(trashBtn).toBeVisible({ timeout: 5_000 });
    await trashBtn.click();

    const confirmDialog = page.locator('[role="dialog"], [role="alertdialog"]').last();
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 });

    const confirmBtn = confirmDialog
      .locator("button")
      .filter({ hasText: /delete|confirm|yes/i })
      .first();
    await confirmBtn.click();

    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(categoryNameEl).toBeHidden({ timeout: 20_000 });
    void deleteBtn;
  });
});
