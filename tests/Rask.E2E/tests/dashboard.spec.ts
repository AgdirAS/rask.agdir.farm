import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for Blazor WASM to fully load
    await page.waitForSelector("text=Dashboard", { timeout: 30_000 });
  });

  test("shows stat cards", async ({ page }) => {
    await expect(page.locator("text=Connections")).toBeVisible();
    await expect(page.locator("text=Channels")).toBeVisible();
    await expect(page.locator("text=Exchanges")).toBeVisible();
    await expect(page.locator("text=Queues")).toBeVisible();
    await expect(page.locator("text=Consumers")).toBeVisible();
  });

  test("shows message rates section", async ({ page }) => {
    await expect(page.locator("text=Message Rates")).toBeVisible();
  });

  test("shows queue depth section", async ({ page }) => {
    await expect(page.locator("text=Queue Depth")).toBeVisible();
  });

  test("shows nodes status table", async ({ page }) => {
    await expect(page.locator("text=Nodes Status")).toBeVisible();
  });

  test("shows system status section", async ({ page }) => {
    await expect(page.locator("text=System Status")).toBeVisible();
    await expect(page.locator("text=Erlang Version")).toBeVisible();
    await expect(page.locator("text=RabbitMQ Version")).toBeVisible();
  });

  test("shows listening ports section", async ({ page }) => {
    await expect(page.locator("text=Listening Ports")).toBeVisible();
  });
});
