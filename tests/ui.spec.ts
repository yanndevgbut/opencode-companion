import { test, expect } from "@playwright/test";

test.describe("OpenCode Companion Web Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate with authenticated session token
    await page.goto("/?token=playwright-test-token");
  });

  test("loads dashboard page with openCode environment overview", async ({ page }) => {
    await expect(page).toHaveTitle(/OpenCode Companion/);
    await expect(page.locator("text=OpenCode")).toBeVisible();
    await expect(page.locator("text=Providers")).toBeVisible();
    await expect(page.locator("text=Models")).toBeVisible();
    await expect(page.locator("text=MCP Servers")).toBeVisible();
  });

  test("navigates to providers manager", async ({ page }) => {
    await page.click("a[href='/providers']");
    await expect(page.locator("text=Provider Manager")).toBeVisible();
    await expect(page.locator("button:has-text('Add Provider')")).toBeVisible();
  });

  test("navigates to diagnostics page", async ({ page }) => {
    await page.click("a[href='/diagnostics']");
    await expect(page.locator("text=System Diagnostics")).toBeVisible();
    await expect(page.locator("text=Checks Passed")).toBeVisible();
  });
});
