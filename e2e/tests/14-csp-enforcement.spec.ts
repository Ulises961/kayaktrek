import { test, expect, Page } from "@playwright/test"
import { LoginPage } from "../pages/login.page"
import { LEADER } from "../fixtures/auth"
import { apiGetAccessToken, apiDeleteTrip } from "../fixtures/trips"
import { apiSeedPublicItinerary } from "../fixtures/itinerary"

// Regression guard for the 2026-07-11 finding: an enforcing CSP without a nonce blocked
// Next's own hydration bootstrap scripts, breaking every page silently — forms fell back to
// native GET submission (password visible in the URL) instead of running client-side JS at
// all. See proxy.ts's buildCsp/isAuthGatedPath and the security-hardening-pass branch.

const CSP_VIOLATION_PATTERN = /content security policy|refused to/i

function collectCspViolations(page: Page): string[] {
  const violations: string[] = []
  page.on("console", (msg) => {
    if (CSP_VIOLATION_PATTERN.test(msg.text())) violations.push(msg.text())
  })
  page.on("pageerror", (err) => {
    violations.push(`pageerror: ${err.message}`)
  })
  return violations
}

test.describe("CSP enforcement — authenticated pages", () => {
  test("hydrate cleanly under the enforcing CSP, no violations", async ({ page }) => {
    const violations = collectCspViolations(page)
    for (const path of ["/dashboard", "/gear", "/profile", "/trips"]) {
      await page.goto(path, { waitUntil: "networkidle" })
    }
    expect(violations).toEqual([])
  })

  test("the response CSP header is enforcing, with a nonce and strict-dynamic", async ({ page }) => {
    const response = await page.goto("/dashboard")
    const csp = response?.headers()["content-security-policy"]
    expect(csp).toBeTruthy()
    expect(csp).toMatch(/script-src[^;]*'nonce-[^']+'/)
    expect(csp).toContain("'strict-dynamic'")
    // Report-Only would mean the header name below is absent — assert the enforcing
    // variant specifically, not just "some CSP header exists".
    expect(response?.headers()["content-security-policy-report-only"]).toBeUndefined()
  })

  test("the itinerary map builder hydrates cleanly under the enforcing CSP", async ({
    page,
    request,
  }) => {
    // Regression guard: a nonce-only style-src blocks every inline style="" attribute
    // app-wide — React's style={{...}} prop (day-rail, point-row, layers-control,
    // point-list-pane, map-add-control, point-detail-modal) and Leaflet's own
    // marker-positioning code both set the style attribute directly, and neither has a
    // nonce escape hatch. None of the pages above render an inline style attribute, so
    // they don't catch this — the map builder is the one that does.
    const leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    const seeded = await apiSeedPublicItinerary(request, leaderToken, {
      name: `CSP style-src regression ${Date.now()}`,
      totalMiles: 1,
      days: [
        {
          dayNumber: 1,
          date: "2026-07-15",
          points: [
            { latitude: 48.4, longitude: -123.35, name: "Launch", type: "stop" },
            { latitude: 48.45, longitude: -123.3, name: "Camp", type: "stop" },
          ],
        },
      ],
    })

    try {
      const violations = collectCspViolations(page)
      await page.goto(`/itinerary/${seeded.itineraryId}`, { waitUntil: "networkidle" })
      expect(violations).toEqual([])
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })
})

test.describe("CSP enforcement — anonymous pages", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("landing and login hydrate cleanly, and login actually submits via JS", async ({ page }) => {
    const violations = collectCspViolations(page)
    await page.goto("/", { waitUntil: "networkidle" })

    await new LoginPage(page).login(LEADER.mail, LEADER.pwd)

    // The exact regression this guards against: a broken CSP silently disables React
    // hydration, so the form's onSubmit never attaches and the browser does a plain HTML
    // form submission instead — a GET request with the password in the query string.
    expect(page.url()).not.toContain("password=")
    expect(page.url()).toContain("/dashboard")
    expect(violations).toEqual([])
  })
})
