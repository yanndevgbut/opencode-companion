import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:39123",
    trace: "on-first-retry",
    launchOptions: {
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node packages/cli/bin/opencode-companion.js --port 39123 --host 127.0.0.1 --token playwright-test-token",
    url: "http://127.0.0.1:39123/?token=playwright-test-token",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
