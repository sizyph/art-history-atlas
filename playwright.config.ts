import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE = process.env.QA_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    headless: true,
    locale: "en-US",
    viewport: { width: 1366, height: 820 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Only manage a server when testing locally (not against a deployed URL).
  webServer: process.env.QA_BASE_URL
    ? undefined
    : {
        command: `npm run start -- -p ${PORT}`,
        url: BASE,
        reuseExistingServer: true,
        timeout: 90000,
      },
});
