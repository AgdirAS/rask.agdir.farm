import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";

// Read .env.local — check worktree root first, then walk up to the actual repo root
function loadEnvLocal(): Record<string, string> {
  const candidates = [
    path.resolve(__dirname, ".env.local"),          // worktree root (for CI / copied file)
    path.resolve(__dirname, "../../.env.local"),    // main repo root (worktrees are 2 levels deep)
  ];
  const envPath = candidates.find(fs.existsSync);
  if (!envPath) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf-8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      })
  );
}

const envVars = loadEnvLocal();

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:35673",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Copy static assets into the standalone dir (Next.js requires this after build),
    // then start the server. The cp -r is idempotent.
    command: [
      "cp -r .next/static .next/standalone/.next/static",
      "cp -rn public .next/standalone/public 2>/dev/null || true",
      "PORT=35673 node .next/standalone/server.js",
    ].join(" && "),
    url: "http://localhost:35673",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: envVars,
  },
});
