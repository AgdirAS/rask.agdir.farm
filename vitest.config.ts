import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    pool: "forks",
    environment: "node",
    include: ["lib/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
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
