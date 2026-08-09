import { defineConfig, devices } from "@playwright/test"

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000"
const API_URL = process.env.E2E_API_URL ?? "http://localhost:5000"

// The two live specs need Redis and the M8 SSE sidecar (ADR-033). Only
// e2e/run-live-stack.sh provides those; the act mirror
// (.github/workflows/e2e-ci.yml) boots postgres and a bare gunicorn to reproduce
// the free runner's resource envelope, so EventSource there never connects and
// both specs fail for want of infrastructure rather than for anything they test.
// Default is to run them — a plain `playwright test` against the live stack must
// not silently lose coverage; the mirror opts out explicitly instead.
const LIVE_SPECS = [/15-live-expedition\.spec\.ts/, /16-story-live-layer\.spec\.ts/]

export default defineConfig({
  testDir: "./tests",
  ...(process.env.E2E_SKIP_LIVE === "1" ? { testIgnore: LIVE_SPECS } : {}),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // Under CI, "github" alone writes annotations and nothing to disk — so the
  // workflow's "Upload Playwright report" step had never found a file to upload
  // ("No files were found with the provided path: e2e/playwright-report/"), and a
  // failed run left no artifact to diagnose from. Pair it with the html reporter,
  // which is what that step expects. open:"never" so it cannot block a headless run.
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

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
