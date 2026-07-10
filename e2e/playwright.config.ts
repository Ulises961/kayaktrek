import { defineConfig, devices } from "@playwright/test"

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000"
const API_URL = process.env.E2E_API_URL ?? "http://localhost:5000"

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  // The CI runner is effectively a single slow vCPU with workers:1, so the
  // trip-detail re-render after a mutation (7-call fan-out + heavy client
  // reconcile) genuinely takes well over 10s. Size the waits to the runner, not
  // to a fast dev box. (Real fix is the aggregate GET /api/trip/:id/detail — see
  // ADR-030 / plans/e2e-hardening.md.)
  timeout: 120_000,
  expect: { timeout: 30_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Sandboxes with a pre-provisioned Chromium (no network to download the
    // pinned browser build) can point at it instead of `playwright install`.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
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
