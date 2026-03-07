import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktree build artifacts:
    ".worktrees/**",
  ]),
  {
    rules: {
      // setState inside effects is a well-established React pattern for
      // browser-API initialization, hydration guards, and derived state sync.
      "react-hooks/set-state-in-effect": "off",
      // Accessing ref.current during render is intentional in components that
      // use refs as mutable buffers and a separate tick state to drive re-renders.
      "react-hooks/refs": "off",
      // Allow _-prefixed variables as intentionally unused (destructuring discard pattern).
      "@typescript-eslint/no-unused-vars": ["warn", {
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
    },
  },
]);

export default eslintConfig;
