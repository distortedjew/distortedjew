import { configDefaults, defineConfig } from "vitest/config";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, ".env") });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "ai-trading-bot/**"],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
