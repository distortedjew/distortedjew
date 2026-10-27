import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "coverage", "playwright-report", "test-results", "src/types/api.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["vite.config.ts", "playwright.config.ts", "e2e/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["scripts/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: { "no-console": "off" },
  },
  {
    files: ["src/**/*.test.{ts,tsx}", "src/test/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
]);
