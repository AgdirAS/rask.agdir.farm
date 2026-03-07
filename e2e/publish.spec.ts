import { test, expect } from "@playwright/test";
import { dismissGateway } from "./helpers";

test.describe("Publish widget", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/exchanges");
    await dismissGateway(page);
  });

  test("publish widget opens with exchange selector", async ({ page }) => {
    // Open the floating publish widget via the sidebar button
    await page.getByTitle("Publish message").click();
    await expect(page.getByText("Publish Message").first()).toBeVisible({ timeout: 5_000 });
    // Exchange selector should be present
    await expect(page.locator("select").first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows validation error for invalid JSON body", async ({ page }) => {
    await page.getByTitle("Publish message").click();

    // The body textarea has aria-label="Body"
    const bodyField = page.getByLabel("Body");
    await expect(bodyField).toBeVisible({ timeout: 10_000 });

    // Type invalid JSON — use pressSequentially to trigger React onChange events
    await bodyField.click();
    await bodyField.pressSequentially("{invalid json");

    // Should show an error paragraph
    await expect(page.locator("p").filter({ hasText: /invalid json/i })).toBeVisible({ timeout: 5_000 });
  });
});
