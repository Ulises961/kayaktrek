import { test, expect } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import { apiGetAccessToken, apiDeleteTrip } from "../fixtures/trips"
import { apiSeedPublicItinerary, apiDeleteItinerary, type SeededRoute } from "../fixtures/itinerary"
import { LoginPage } from "../pages/login.page"

// M7c — public route library & discovery. Proves the cross-service discovery flow the
// unit/component tests mock out: an anonymous visitor filters the public route
// library, opens a route's detail page, is gated behind login to reuse it, and after
// authenticating forks it into their own private copy.
//
// The route is seeded once with a run-unique name (so reruns against the persistent
// dev DB don't collide) at a fixed northern-hemisphere summer date, giving deterministic
// distance / day-count / season facets to assert against.

const ROUTE_NAME = `E2E Explore Route ${Date.now()}`
// Stored trip metadata — no longer what /explore displays (kept to prove it is ignored).
const TOTAL_MILES = 12.5
// Since M4e the explore card derives distance from the route geometry (legs), not the
// stored totalMiles: Launch→Waypoint→Camp is two ~3.6 nm hops at 48.4°N ⇒ 7.2 nm.
const DERIVED_NM = "7.2"

test.describe("Public route discovery", () => {
  let leaderToken: string
  let crewToken: string
  let seeded: SeededRoute
  let forkedItineraryId: string | null = null

  test.beforeAll(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    crewToken = await apiGetAccessToken(request, CREW.mail, CREW.pwd)

    seeded = await apiSeedPublicItinerary(request, leaderToken, {
      name: ROUTE_NAME,
      totalMiles: TOTAL_MILES,
      days: [
        {
          dayNumber: 1,
          date: "2026-07-15",
          points: [
            { latitude: 48.4, longitude: -123.35, name: "Launch", type: "stop" },
            { latitude: 48.45, longitude: -123.3, name: "Waypoint", type: "position" },
          ],
        },
        {
          dayNumber: 2,
          date: "2026-07-16",
          points: [{ latitude: 48.5, longitude: -123.25, name: "Camp", type: "stop" }],
        },
      ],
    })
  })

  test.afterAll(async ({ request }) => {
    if (forkedItineraryId) await apiDeleteItinerary(request, crewToken, forkedItineraryId)
    // Guard against a failed beforeAll (e.g. seed timed out) so cleanup doesn't mask
    // the real error with an undefined-access one.
    if (seeded?.tripId) await apiDeleteTrip(request, leaderToken, seeded.tripId)
  })

  test("anon can filter the library and see route facets, with forking gated behind auth", async ({
    browser,
  }) => {
    // A truly logged-out context: browser.newContext() would otherwise inherit the
    // project's leader storageState.
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    // The root is where a signed-out visitor's library lives, and it floats the
    // first-visit intro card over it. The card dismisses on any outside click, so the
    // first interaction below would clear it anyway — pre-dismissing it just keeps that
    // implicit dependency out of the assertions.
    await anon.addInitScript(() =>
      window.localStorage.setItem("kayaktrek:discovery-intro-dismissed", "1"),
    )
    const page = await anon.newPage()

    // Narrow the library to just the seeded route by its unique name. `/` rather than
    // `/explore`, which redirects here for anyone not signed in.
    await page.goto("/")
    await page.getByRole("textbox", { name: /search routes by name/i }).fill(ROUTE_NAME)

    const card = page.getByRole("link", { name: ROUTE_NAME })
    await expect(card).toBeVisible()
    // Derived facets surface on the card: distance and day count. (Season is a badge
    // here too, but the library also renders season *filter chips* — assert the season on
    // the detail page below, where only the badge exists.)
    await expect(page.getByText(`${DERIVED_NM} nm`)).toBeVisible()
    await expect(page.getByText("2 days")).toBeVisible()

    // Open the public detail page.
    await card.click()
    await expect(page).toHaveURL(new RegExp(`/routes/${seeded.itineraryId}`))
    await expect(page.getByRole("heading", { name: ROUTE_NAME })).toBeVisible()
    // Hemisphere-aware season derived from the July dates + northern latitude.
    await expect(page.getByText("summer")).toBeVisible()
    // The per-day breakdown is visible before forking — both seeded days appear.
    await expect(page.getByText("Daily breakdown")).toBeVisible()
    await expect(page.getByText("Day 1")).toBeVisible()
    await expect(page.getByText("Day 2")).toBeVisible()

    // Anonymous visitors can't fork — the CTA routes them to login.
    await page.getByRole("button", { name: /log in to use this route/i }).click()
    await expect(page).toHaveURL(/\/login/)

    await anon.close()
  })

  test("the author sees an open-your-route link, not a duplicate-creating fork CTA", async ({
    page,
  }) => {
    // The default context is the leader — the author of the seeded route. They already
    // own it, so the detail page must offer to open it, never to clone it.
    await page.goto(`/routes/${seeded.itineraryId}`)
    await expect(page.getByRole("link", { name: /open your route/i })).toHaveAttribute(
      "href",
      `/itinerary/${seeded.itineraryId}`,
    )
    await expect(page.getByRole("button", { name: /use this route/i })).toHaveCount(0)
  })

  test("logging in unlocks forking, which clones the route into a private copy", async ({
    browser,
  }) => {
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await anon.newPage()

    // Discover → detail, then hit the login gate.
    await page.goto(`/routes/${seeded.itineraryId}`)
    await page.getByRole("button", { name: /log in to use this route/i }).click()
    await expect(page).toHaveURL(/\/login/)

    // Authenticate as a different paddler than the author (the discovery flywheel:
    // someone else clones your public route).
    await new LoginPage(page).login(CREW.mail, CREW.pwd)

    // Back on the detail page, the CTA now forks and lands on the private editor copy.
    await page.goto(`/routes/${seeded.itineraryId}`)
    await page.getByRole("button", { name: /use this route/i }).click()
    await page.waitForURL(/\/itinerary\/[0-9a-f-]+$/)

    const forkedId = page.url().split("/itinerary/")[1]
    expect(forkedId).toBeTruthy()
    expect(forkedId).not.toBe(seeded.itineraryId)
    forkedItineraryId = forkedId

    await anon.close()
  })
})
