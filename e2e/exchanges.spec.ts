import { test, expect } from "@playwright/test";
import { dismissGateway } from "./helpers";

test.describe("Exchanges", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/exchanges");
    await dismissGateway(page);
  });

  test("exchanges page loads and shows default exchange", async ({ page }) => {
    // h1 is in the header
    await expect(page.getByRole("heading", { name: "Exchanges", exact: true })).toBeVisible();
    // RabbitMQ always has the default (nameless) exchange
    await expect(page.getByText("(default)").first()).toBeVisible({ timeout: 10_000 });
  });

  test("can open exchange detail drawer", async ({ page }) => {
    // Click amq.direct which always exists
    await page.getByRole("row").filter({ hasText: "amq.direct" }).first().click();
    // Drawer should open showing the exchange name
    await expect(page.getByText("amq.direct").last()).toBeVisible({ timeout: 5_000 });
  });
});
