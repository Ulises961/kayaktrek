import { defineConfig, devices } from "@playwright/test"

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000"
const API_URL = process.env.E2E_API_URL ?? "http://localhost:5000"

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  timeout: 60_000,
  expect: { timeout: 5000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Setup project: creates auth state files consumed by all other projects
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: { baseURL: BASE_URL },
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/leader.json",
      },
      dependencies: ["setup"],
    },
  ],
})

export { BASE_URL, API_URL }
