import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4010";

export default defineConfig({
  testDir: "./e2e",
  // Tests share one real local backend (127.0.0.1:8010) and some mutate data
  // (register flow), so parallel runs race each other and flake.
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command: "NEXT_PUBLIC_API_URL=http://127.0.0.1:8010 npx next dev --port 4010",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        channel: "chrome",
      },
    },
  ],
});
