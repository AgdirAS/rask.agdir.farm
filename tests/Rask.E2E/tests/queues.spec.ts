import { test, expect } from "@playwright/test";

test.describe("Queues Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/queues");
    await page.waitForSelector("text=Search queues", { timeout: 30_000 });
  });

  test("renders the queues table", async ({ page }) => {
    // Table headers should be visible
    await expect(page.locator("th:text('Name')")).toBeVisible();
    await expect(page.locator("th:text('Vhost')")).toBeVisible();
    await expect(page.locator("th:text('Type')")).toBeVisible();
    await expect(page.locator("th:text('State')")).toBeVisible();
    await expect(page.locator("th:text('Messages')")).toBeVisible();
  });

  test("search filter works", async ({ page }) => {
    const searchInput = page.locator("input[placeholder='Search queues…']");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("nonexistent-queue-xyz");
    await expect(page.locator("text=No queues match your filters")).toBeVisible();
  });

  test("vhost filter is available", async ({ page }) => {
    const vhostSelect = page.locator("select").first();
    await expect(vhostSelect).toBeVisible();
  });

  test("type filter is available", async ({ page }) => {
    // There should be a type filter select
    await expect(page.locator("option:text('Classic')")).toBeVisible();
    await expect(page.locator("option:text('Quorum')")).toBeVisible();
    await expect(page.locator("option:text('Stream')")).toBeVisible();
  });
});
