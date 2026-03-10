import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("loads the dashboard", async ({ page }) => {
    await page.goto("/");
    // Wait for Blazor WASM to load
    await page.waitForSelector("text=Dashboard", { timeout: 30_000 });
    await expect(page.locator("text=Dashboard")).toBeVisible();
  });

  test("sidebar shows Rask branding", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Rask", { timeout: 30_000 });
    await expect(page.locator("text=Rask")).toBeVisible();
    await expect(page.locator("text=RabbitMQ client")).toBeVisible();
  });

  test("navigates to queues page", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Dashboard", { timeout: 30_000 });
    await page.click("a[href='/queues']");
    await expect(page).toHaveURL(/\/queues/);
    await expect(page.locator("text=Search queues")).toBeVisible();
  });

  test("navigates to exchanges page", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Dashboard", { timeout: 30_000 });
    await page.click("a[href='/exchanges']");
    await expect(page).toHaveURL(/\/exchanges/);
    await expect(page.locator("text=Search exchanges")).toBeVisible();
  });

  test("navigates to connections page", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Dashboard", { timeout: 30_000 });
    await page.click("a[href='/connections']");
    await expect(page).toHaveURL(/\/connections/);
    await expect(page.locator("text=Search connections")).toBeVisible();
  });

  test("navigates to channels page", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Dashboard", { timeout: 30_000 });
    await page.click("a[href='/channels']");
    await expect(page).toHaveURL(/\/channels/);
    await expect(page.locator("text=Search channels")).toBeVisible();
  });

  test("navigates to bindings page", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Dashboard", { timeout: 30_000 });
    await page.click("a[href='/bindings']");
    await expect(page).toHaveURL(/\/bindings/);
    await expect(page.locator("text=Search bindings")).toBeVisible();
  });

  test("navigates to static pages", async ({ page }) => {
    await page.goto("/docs");
    await page.waitForSelector("text=About Rask", { timeout: 30_000 });
    await expect(page.locator("text=About Rask")).toBeVisible();

    await page.goto("/privacy");
    await expect(page.locator("text=Privacy Policy")).toBeVisible();

    await page.goto("/terms");
    await expect(page.locator("text=Terms of Use")).toBeVisible();
  });
});
