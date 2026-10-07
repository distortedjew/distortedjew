import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests live in e2e/ (written against a running engine + API + dashboard).
 *
 *   E2E_BASE_URL   dashboard URL under test (default http://127.0.0.1:5173)
 *   PW_CHROMIUM    optional Chromium executable (the pinned @playwright/test matches the
 *                  browsers in PLAYWRIGHT_BROWSERS_PATH; never run `playwright install` here)
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
