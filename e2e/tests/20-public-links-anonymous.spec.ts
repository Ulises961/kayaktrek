import { test, expect, type Browser, type Page } from "@playwright/test"
import { BASE_URL, API_URL } from "../playwright.config"
import { LEADER } from "../fixtures/auth"
import { apiGetAccessToken, apiDeleteTrip } from "../fixtures/trips"
import { apiSeedPublicItinerary, apiDeleteItinerary, type SeededRoute } from "../fixtures/itinerary"

// Every anonymous-reachable route must render for a visitor the app does not recognise —
// no matter WHY it does not recognise them.
//
// This exists because /explore has now been gated behind login twice, by two unrelated
// mechanisms: the M11 §3 proxy-matcher sweep (fixed 2026-07-10), and then M17 adding
// rethrowIfRedirect to getMe(), which turned a stale cookie into a dead session and
// redirected. The convention "keep the (public) grouping and the proxy.ts gate list in
// sync" did not catch either one, so the guard is a test now.
//
// The load-bearing detail is the SECOND context below. Every pre-existing anonymous test
// (05, 13, 16) uses an empty cookie jar, which is precisely the case getMe() special-cased
// and got right — so the entire failing branch went untested. A stale cookie is not an
// exotic state: it is what a revoked session, a 30-day-expired refresh token, and the M17
// deploy itself (pre-M17 refresh tokens carry no `sid`, so every existing user's token
// fails to refresh once) all leave behind.

/** Host only — cookies ignore the port, so this holds for :3000 and the CI :3100 alike. */
const COOKIE_DOMAIN = new URL(BASE_URL).hostname

/**
 * Two visitors who must be treated identically, and were not.
 *
 * The stale token is syntactically a cookie and semantically worthless: the backend cannot
 * refresh it, so the app learns "there is no usable session" the expensive way, via a failed
 * round trip, rather than by seeing no cookie at all.
 */
const VISITORS = [
  { name: "anonymous", cookies: [] },
  {
    name: "stale session",
    cookies: [
      {
        name: "refresh_token",
        value: "stale.invalid.token",
        domain: COOKIE_DOMAIN,
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
  },
]

async function openAs(browser: Browser, cookies: (typeof VISITORS)[number]["cookies"]) {
  // storageState rather than the project default, which carries the leader's session.
  const context = await browser.newContext({
    storageState: { cookies, origins: [] },
  })
  return { context, page: await context.newPage() }
}

/**
 * The single assertion: we are still on the route we asked for, not the login screen.
 *
 * Checked on the settled URL rather than the response status because the failure is a
 * server-side redirect that Playwright follows — `page.goto` resolves happily, having
 * quietly landed somewhere else.
 */
async function expectNotGated(page: Page, route: string) {
  await expect(page, `${route} sent an unrecognised visitor to the login screen`).not.toHaveURL(
    /\/login/,
  )
  expect(new URL(page.url()).pathname, `${route} navigated away`).toBe(route)
}

test.describe("Public links stay public", () => {
  let leaderToken: string
  let seeded: SeededRoute
  let storyToken: string

  test.beforeAll(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)

    seeded = await apiSeedPublicItinerary(request, leaderToken, {
      name: `E2E Public Link ${Date.now()}`,
      totalMiles: 5,
      days: [
        {
          dayNumber: 1,
          date: "2026-07-15",
          points: [
            {
              latitude: 48.4,
              longitude: -123.35,
              name: "Launch",
              type: "stop",
            },
            { latitude: 48.45, longitude: -123.3, name: "Camp", type: "stop" },
          ],
        },
      ],
    })

    const shareRes = await request.post(
      `${API_URL}/api/v1/itinerary/${seeded.itineraryId}/story-share`,
      { headers: { Authorization: `Bearer ${leaderToken}` } },
    )
    expect(shareRes.ok(), "could not mint a story share token").toBeTruthy()
    storyToken = (await shareRes.json()).storyShareToken
  })

  test.afterAll(async ({ request }) => {
    // Guard against a failed beforeAll so cleanup doesn't mask the real error.
    if (seeded?.itineraryId) await apiDeleteItinerary(request, leaderToken, seeded.itineraryId)
    if (seeded?.tripId) await apiDeleteTrip(request, leaderToken, seeded.tripId)
  })

  for (const visitor of VISITORS) {
    test.describe(visitor.name, () => {
      test("the landing page, terms and the public route library all open", async ({ browser }) => {
        const { context, page } = await openAs(browser, visitor.cookies)
        try {
          for (const route of ["/", "/terms", "/explore"]) {
            await page.goto(route)
            await expectNotGated(page, route)
          }
          // /explore is the one that has broken twice, so prove it rendered the library
          // rather than merely failing to redirect.
          await expect(page.getByRole("heading", { name: /explore routes/i })).toBeVisible()
        } finally {
          await context.close()
        }
      })

      // M23 §2. Reachability was never the problem — /explore has always returned 200 to
      // an anonymous visitor. It was that nothing linked there: the landing emitted only
      // /register, /login, /terms and /privacy, which is indistinguishable from a gate
      // for anyone who does not already know the URL. So assert the library is ON the
      // root, not merely that the root loads.
      test("the anonymous root IS the route library", async ({ browser }) => {
        const { context, page } = await openAs(browser, visitor.cookies)
        try {
          await page.goto("/")
          await expectNotGated(page, "/")
          await expect(page.getByLabel(/search routes by name/i)).toBeVisible()
          // The pitch has to survive the library landing on top of it — ADR-034 dropped
          // get.kayaktrek.app on the grounds that the root already is the pitch.
          await expect(page.getByRole("link", { name: /^sign up$/i })).toBeVisible()
        } finally {
          await context.close()
        }
      })

      // M23 §1. The (app) shell renders for anonymous visitors because /explore lives in
      // it. It used to offer the full signed-in nav, every entry redirecting to /login.
      test("the shell offers an anonymous visitor no doors that only lead to /login", async ({
        browser,
      }) => {
        const { context, page } = await openAs(browser, visitor.cookies)
        try {
          await page.goto("/explore")
          await expectNotGated(page, "/explore")
          const nav = page.getByRole("navigation")
          await expect(nav.getByText("Explore", { exact: true })).toBeVisible()
          for (const gated of ["Dashboard", "Trips", "Gear", "Logs"]) {
            await expect(nav.getByText(gated, { exact: true })).toHaveCount(0)
          }
        } finally {
          await context.close()
        }
      })

      test("a shared route detail page opens and shows the route", async ({ browser }) => {
        const { context, page } = await openAs(browser, visitor.cookies)
        try {
          const route = `/routes/${seeded.itineraryId}`
          await page.goto(route)
          await expectNotGated(page, route)
          await expect(page.getByRole("link", { name: /home/i })).toBeVisible()
        } finally {
          await context.close()
        }
      })

      test("an unlisted story share link opens", async ({ browser }) => {
        const { context, page } = await openAs(browser, visitor.cookies)
        try {
          const route = `/story/${storyToken}`
          await page.goto(route)
          await expectNotGated(page, route)
        } finally {
          await context.close()
        }
      })
    })
  }

  test("an auth-gated route still redirects a stale session to login", async ({ browser }) => {
    // The other half of the contract. Opening the public routes is only correct if the
    // private ones stayed shut — a fix that made getViewer the app-wide default would
    // pass every test above and silently unlock the app.
    const { context, page } = await openAs(browser, VISITORS[1].cookies)
    try {
      await page.goto("/dashboard")
      await expect(page).toHaveURL(/\/login/)
    } finally {
      await context.close()
    }
  })
})
