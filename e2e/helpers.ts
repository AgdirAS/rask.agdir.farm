import { Page } from "@playwright/test";

/**
 * Dismiss the EnvGateway overlay if it appears.
 * The gateway has a loading state where it returns null, so we wait for
 * the overlay to either appear (then dismiss) or never appear (already connected).
 */
export async function dismissGateway(page: Page) {
  const overlay = page.locator("div.fixed.inset-0.z-50");
  try {
    // Wait up to 5s for the overlay to become visible (accounting for the loading state)
    await overlay.waitFor({ state: "visible", timeout: 5_000 });
    await page.getByRole("button", { name: "Connect" }).first().click();
    await overlay.waitFor({ state: "hidden", timeout: 10_000 });
  } catch {
    // Overlay never appeared — gateway already dismissed or not needed
  }
}
