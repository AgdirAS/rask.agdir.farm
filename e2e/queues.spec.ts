import { test, expect } from "@playwright/test";
import { dismissGateway } from "./helpers";

test.describe("Queues", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/queues");
    await dismissGateway(page);
  });

  test("queues page loads", async ({ page }) => {
    // h1 is in the header
    await expect(page.getByRole("heading", { name: "Queues", exact: true })).toBeVisible();
  });

  test("create, publish, peek, purge, delete a queue", async ({ page }) => {
    const queueName = `e2e-test-${Date.now()}`;

    // Create queue
    await page.getByRole("button", { name: /new queue/i }).click();

    // Fill name field — label text is "Name *"
    await page.getByLabel("Name *").fill(queueName);
    await page.getByRole("button", { name: "Create Queue" }).click();

    // Wait for the create dialog to close
    await expect(page.locator('div.fixed.inset-0.z-50')).not.toBeVisible({ timeout: 10_000 });

    // Search for the queue to ensure it's visible regardless of pagination
    await page.locator("input[placeholder='Search by name or vhost…']").fill(queueName);
    await expect(page.getByText(queueName)).toBeVisible({ timeout: 10_000 });

    // Open drawer and go to Publish / Actions tab
    await page.getByRole("row").filter({ hasText: queueName }).click();
    await page.getByRole("button", { name: "Publish / Actions" }).click();

    // Fill and publish a message
    const payloadField = page.locator("textarea").last();
    await payloadField.fill("hello world");
    await page.getByRole("button", { name: "Publish Message", exact: true }).last().click();
    // Wait for publish to complete (result paragraph appears)
    await expect(page.locator("p").filter({ hasText: /routed/i })).toBeVisible({ timeout: 5_000 });

    // Peek the message
    await page.getByRole("button", { name: "Messages" }).click();
    await page.getByRole("button", { name: "Fetch" }).click();
    await expect(page.getByText("hello world")).toBeVisible({ timeout: 5_000 });

    // Purge
    await page.getByRole("button", { name: "Publish / Actions" }).click();
    await page.getByRole("button", { name: "Purge Queue" }).click();
    await page.getByRole("button", { name: /yes, purge/i }).click();

    // Delete
    await page.getByRole("button", { name: "Delete Queue" }).click();
    await page.getByRole("button", { name: /yes, delete/i }).click();

    // Queue should no longer be in the table
    await expect(page.getByRole("table").getByText(queueName)).not.toBeVisible({ timeout: 10_000 });
  });
});
