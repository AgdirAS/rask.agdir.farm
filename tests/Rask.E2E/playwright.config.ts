import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.RASK_URL ?? "http://localhost:35672",
    headless: true,
    screenshot: "only-on-failure",
  },
  reporter: process.env.CI
    ? [["junit", { outputFile: "../../test-results/e2e.xml" }]]
    : [["html", { open: "never" }]],
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
