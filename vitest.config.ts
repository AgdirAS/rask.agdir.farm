import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    pool: "forks",
    environment: "node",
    include: ["lib/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    reporters: process.env.CI ? ["verbose", "junit"] : ["verbose"],
    outputFile: { junit: "test-results/unit.xml" },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
