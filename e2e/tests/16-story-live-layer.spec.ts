import { test, expect } from "@playwright/test"
import { LEADER } from "../fixtures/auth"
import { apiGetAccessToken, apiCreateTrip, apiDeleteTrip, apiTransitionState } from "../fixtures/trips"
import { API_URL } from "../playwright.config"

// Needs the full docker-compose stack (SSE sidecar + Redis) — see the header
// note in 15-live-expedition.spec.ts. Not covered by e2e/run-constrained-ci.sh.

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

test.describe("Public live layer on the story share page", () => {
  let leaderToken: string
  let tripId: string
  let storyToken: string

  test.beforeAll(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    const today = todayIso()
    const trip = await apiCreateTrip(request, leaderToken, {
      destination: "E2E Story Live",
      dateFrom: today,
      dateTo: addDaysIso(today, 1),
      itinerary: {
        isPublic: false,
        totalMiles: 2,
        days: [
          {
            dayNumber: 1,
            date: today,
            points: [
              { latitude: 43.0, longitude: 13.0, name: "Launch", type: "stop" },
              { latitude: 43.02, longitude: 13.02, name: "Landing", type: "stop" },
            ],
          },
        ],
      },
    })
    tripId = trip.id as string
    const itineraryId = (trip.itinerary as { id: string }).id

    const shareRes = await request.post(
      `${API_URL}/api/v1/itinerary/${itineraryId}/story-share`,
      { headers: { Authorization: `Bearer ${leaderToken}` } },
    )
    expect(shareRes.ok()).toBeTruthy()
    const shareData = await shareRes.json()
    storyToken = shareData.storyShareToken
  })

  test.afterAll(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("no live pill before the trip is happening", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await page.goto(`/story/${storyToken}`)
    await expect(page.getByText(/live ·/i)).not.toBeVisible()
    await context.close()
  })

  test("shows the live pill and a paddler once happening and pinging", async ({
    request,
    browser,
  }) => {
    test.setTimeout(120_000)

    // A dedicated trip/token, not the describe-level one — apiGetPublic's
    // story fetch caches for 5 minutes (next: { revalidate: 300 },
    // lib/api/client.ts), keyed by URL. The previous test already visited
    // /story/${storyToken} while that trip was still "building", so reusing
    // the same token here would serve back that stale non-happening snapshot
    // (isLive false → the page renders plain MapLoader, not LiveStoryMap —
    // no EventSource connection is even attempted). A fresh token's first
    // fetch happens only after the trip is already "happening".
    const today = todayIso()
    const trip = await apiCreateTrip(request, leaderToken, {
      destination: "E2E Story Live Pinging",
      dateFrom: today,
      dateTo: addDaysIso(today, 1),
      itinerary: {
        isPublic: false,
        totalMiles: 2,
        days: [
          {
            dayNumber: 1,
            date: today,
            points: [
              { latitude: 43.0, longitude: 13.0, name: "Launch", type: "stop" },
              { latitude: 43.02, longitude: 13.02, name: "Landing", type: "stop" },
            ],
          },
        ],
      },
    })
    const livingTripId = trip.id as string
    const itineraryId = (trip.itinerary as { id: string }).id

    try {
      await apiTransitionState(request, leaderToken, livingTripId, "happening")

      const pingRes = await request.post(`${API_URL}/api/v1/live/trip/${livingTripId}/position`, {
        headers: { Authorization: `Bearer ${leaderToken}` },
        data: { lat: 43.005, lon: 13.005 },
      })
      expect(pingRes.ok()).toBeTruthy()

      const shareRes = await request.post(
        `${API_URL}/api/v1/itinerary/${itineraryId}/story-share`,
        { headers: { Authorization: `Bearer ${leaderToken}` } },
      )
      expect(shareRes.ok()).toBeTruthy()
      const livingStoryToken = (await shareRes.json()).storyShareToken

      // Unauthenticated context — the story link needs no account, only the
      // token in the URL (unlisted-share, no-oracle 404 contract per M8 D5/D10
      // sibling design).
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      const page = await context.newPage()
      await page.goto(`/story/${livingStoryToken}`)
      await expect(page.getByText(/live · 1 paddler/i)).toBeVisible({ timeout: 30_000 })
      await context.close()
    } finally {
      await apiDeleteTrip(request, leaderToken, livingTripId)
    }
  })
})
