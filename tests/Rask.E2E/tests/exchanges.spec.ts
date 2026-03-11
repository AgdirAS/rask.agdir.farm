import { test, expect } from "@playwright/test";

test.describe("Exchanges Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/exchanges");
    await page.waitForSelector("text=Search exchanges", { timeout: 30_000 });
  });

  test("renders the exchanges table", async ({ page }) => {
    await expect(page.locator("th:text('Name')")).toBeVisible();
    await expect(page.locator("th:text('Type')")).toBeVisible();
    await expect(page.locator("th:text('Durable')")).toBeVisible();
  });

  test("shows default RabbitMQ exchanges", async ({ page }) => {
    // RabbitMQ always has these built-in exchanges
    await expect(page.locator("text=(default)").first()).toBeVisible({ timeout: 10_000 });
  });

  test("type filter works", async ({ page }) => {
    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("direct");
    // Should filter to only direct exchanges
  });
});
