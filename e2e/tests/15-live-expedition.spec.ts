import { APIRequestContext, test, expect } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import {
  apiGetAccessToken,
  apiCreateTrip,
  apiDeleteTrip,
  apiTransitionState,
  apiInviteByEmail,
  apiAcceptInvitation,
} from "../fixtures/trips"
import { mutateAndSettle, openTripMenu } from "../fixtures/ui"
import { BASE_URL } from "../playwright.config"

// M8's live-expedition features (Navigate mode position sharing, the crew SSE
// stream, close-day) need the full docker-compose stack — the SSE sidecar
// (SERVICE_ROLE=sse), Redis (LIVE_REDIS_URL, db/3), and the worker service.
// None of those are started by e2e-ci.yml / e2e/run-constrained-ci.sh (the
// act-based CI mirror only boots postgres + bare gunicorn — see ADR-030).
// Run this file against `docker compose up`, not the constrained CI mirror.
//
// Pause/resume/abort don't touch Redis/SSE at all and would pass either way,
// but they're kept in this file since they're the other half of M8's "Live"
// surface and share its trip/itinerary setup helper.

// The seeded points below sit in the Adriatic near Italy, which the backend's
// resolve_timezone (backend/Services/Utils/timezone_utils.py) resolves to
// Europe/Rome — close-day looks up the itinerary Day by trip_today(trip),
// i.e. "today" IN THAT TIMEZONE, not UTC. Rome is UTC+1/+2, so a plain UTC
// todayIso() drifts a calendar day late in the UTC evening (reproduced: a
// run at 23:25 UTC got a 409 "no itinerary day scheduled for that date"
// because Rome had already ticked over to the next day). Compute in the same
// timezone the backend will resolve so the test is time-of-day-independent.
function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date())
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function createHappeningTrip(
  request: APIRequestContext,
  leaderToken: string,
  destination: string,
): Promise<{ tripId: string; itineraryId: string }> {
  const today = todayIso()
  const trip = await apiCreateTrip(request, leaderToken, {
    destination,
    dateFrom: today,
    dateTo: addDaysIso(today, 1),
    itinerary: {
      isPublic: false,
      totalMiles: 3,
      days: [
        {
          dayNumber: 1,
          date: today,
          points: [
            { latitude: 43.0, longitude: 13.0, name: "Launch", type: "stop" },
            { latitude: 43.05, longitude: 13.05, name: "Landing", type: "stop" },
          ],
        },
      ],
    },
  })
  const tripId = trip.id as string
  const itineraryId = (trip.itinerary as { id: string }).id
  await apiTransitionState(request, leaderToken, tripId, "happening")
  return { tripId, itineraryId }
}

test.describe("Live expedition — pause / resume / abort", () => {
  let leaderToken: string

  test.beforeAll(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
  })

  test("leader pauses and resumes a happening trip", async ({ page, request }) => {
    const { tripId } = await createHappeningTrip(request, leaderToken, "E2E Pause Resume")
    try {
      await page.goto(`/trips/${tripId}`)
      await openTripMenu(page)

      await page.getByRole("menuitem", { name: /pause expedition/i }).click()
      await mutateAndSettle(
        page,
        () => page.getByRole("button", { name: "Pause", exact: true }).click(),
        { reload: true },
      )
      await expect(page.getByText(/expedition paused since/i)).toBeVisible()
      // Paused: the menu no longer offers a pause. It is open here, so the assertion cannot
      // hold just because the menu is shut.
      await openTripMenu(page)
      await expect(page.getByRole("menuitem", { name: /leave trip/i })).toBeVisible()
      await expect(page.getByRole("menuitem", { name: /pause expedition/i })).not.toBeVisible()
      await page.keyboard.press("Escape")

      await page.getByRole("button", { name: "Resume", exact: true }).click()
      // Leave the resume date unset — resumeTrip defaults to today server-side,
      // the same day this trip was paused, so there's no day-shift math to
      // assert here (covered by the backend's own pause/resume test suite).
      const resumeDialog = page.getByRole("dialog", { name: /resume expedition/i })
      await mutateAndSettle(
        page,
        () => resumeDialog.getByRole("button", { name: "Resume", exact: true }).click(),
        { reload: true },
      )
      await expect(page.getByText(/expedition paused since/i)).not.toBeVisible()
      await openTripMenu(page)
      await expect(page.getByRole("menuitem", { name: /pause expedition/i })).toBeVisible()
    } finally {
      await apiDeleteTrip(request, leaderToken, tripId)
    }
  })

  test("leader aborts a paused expedition", async ({ page, request }) => {
    const { tripId } = await createHappeningTrip(request, leaderToken, "E2E Abort")
    try {
      await page.goto(`/trips/${tripId}`)
      await openTripMenu(page)

      await page.getByRole("menuitem", { name: /pause expedition/i }).click()
      await mutateAndSettle(
        page,
        () => page.getByRole("button", { name: "Pause", exact: true }).click(),
        { reload: true },
      )
      await expect(page.getByText(/expedition paused since/i)).toBeVisible()

      await page.getByRole("button", { name: /abort expedition/i }).click()
      await mutateAndSettle(
        page,
        () => page.getByRole("button", { name: "Abort", exact: true }).click(),
        { reload: true },
      )
      await expect(
        page.locator('[data-slot="state-badge"]').filter({ hasText: /past/i }),
      ).toBeVisible()
    } finally {
      await apiDeleteTrip(request, leaderToken, tripId)
    }
  })

  test("crew cannot see pause controls", async ({ browser, request }) => {
    const { tripId } = await createHappeningTrip(request, leaderToken, "E2E Pause Authz")
    try {
      const crewToken = await apiGetAccessToken(request, CREW.mail, CREW.pwd)
      await apiInviteByEmail(request, leaderToken, tripId, CREW.mail)
      await apiAcceptInvitation(request, crewToken, tripId)

      const crewContext = await browser.newContext({ storageState: "e2e/.auth/crew.json" })
      const crewPage = await crewContext.newPage()
      await crewPage.goto(`/trips/${tripId}`)
      // The menu is opened, and shown to hold Leave, so "no Pause" is a statement about what
      // crew are offered and not about a menu that failed to open.
      await openTripMenu(crewPage)
      await expect(crewPage.getByRole("menuitem", { name: /leave trip/i })).toBeVisible()
      await expect(crewPage.getByRole("menuitem", { name: /pause expedition/i })).not.toBeVisible()
      await crewContext.close()
    } finally {
      await apiDeleteTrip(request, leaderToken, tripId)
    }
  })
})

test.describe("Live expedition — Navigate mode position sharing", () => {
  let leaderToken: string
  let crewToken: string

  test.beforeAll(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    crewToken = await apiGetAccessToken(request, CREW.mail, CREW.pwd)
  })

  test("shows the Live nav entry for a member on a happening trip", async ({ page, request }) => {
    const { tripId, itineraryId } = await createHappeningTrip(request, leaderToken, "E2E Live Nav")
    try {
      await page.goto(`/trips/${tripId}`)
      const liveLink = page.getByRole("link", { name: "Live" })
      await expect(liveLink).toBeVisible()
      await expect(liveLink).toHaveAttribute("href", `/itinerary/${itineraryId}?navigate=1`)
    } finally {
      await apiDeleteTrip(request, leaderToken, tripId)
    }
  })

  test("leader shares live position and can close the day", async ({ page, request }) => {
    const { tripId, itineraryId } = await createHappeningTrip(
      request,
      leaderToken,
      "E2E Navigate Solo",
    )
    try {
      await page.context().grantPermissions(["geolocation"], { origin: BASE_URL })
      await page.context().setGeolocation({ latitude: 43.01, longitude: 13.01 })

      await page.goto(`/itinerary/${itineraryId}?navigate=1`)
      // usePositionWatch sends its first reading immediately — there's no prior
      // position to throttle against — so the status chip flips off "Acquiring
      // location…" once that first ping round-trips through the backend.
      await expect(page.getByText(/sharing position/i)).toBeVisible()

      await page.getByRole("button", { name: "Close day" }).click()
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Close day", exact: true })
        .click()
      await expect(page.getByText(/day closed — logs are being generated/i)).toBeVisible()
    } finally {
      await apiDeleteTrip(request, leaderToken, tripId)
    }
  })

  test("crew sees the leader's position via the shared SSE stream", async ({
    page,
    browser,
    request,
  }) => {
    // Both extended crew-live-count waits below can each take up to ~90s under
    // the shared-IP rate-limit recovery described there — give the test room.
    test.setTimeout(240_000)
    const { tripId, itineraryId } = await createHappeningTrip(
      request,
      leaderToken,
      "E2E Navigate Duo",
    )
    try {
      await apiInviteByEmail(request, leaderToken, tripId, CREW.mail)
      await apiAcceptInvitation(request, crewToken, tripId)

      const crewContext = await browser.newContext({ storageState: "e2e/.auth/crew.json" })
      const crewPage = await crewContext.newPage()

      await page.context().grantPermissions(["geolocation"], { origin: BASE_URL })
      await page.context().setGeolocation({ latitude: 43.01, longitude: 13.01 })
      await crewContext.grantPermissions(["geolocation"], { origin: BASE_URL })
      await crewContext.setGeolocation({ latitude: 43.02, longitude: 13.02 })

      await page.goto(`/itinerary/${itineraryId}?navigate=1`)
      await crewPage.goto(`/itinerary/${itineraryId}?navigate=1`)

      await expect(page.getByText(/sharing position/i)).toBeVisible()
      await expect(crewPage.getByText(/sharing position/i)).toBeVisible()

      // Each side's status chip counts positions received over its OWN crew
      // SSE stream — once both are sending, each should see at least the
      // other (mirrors M8's own Gate 6 two-browser manual walkthrough).
      //
      // Generous timeout: both browser contexts share this machine's one IP,
      // so `live.trip_stream`'s per-IP rate limit (10/min, backend/Resources/
      // live_resource.py) can trip on the two concurrent streams, and
      // useLivePositions' error backoff (hooks/use-live-positions.ts) then
      // takes up to ~90s to recover before both streams re-establish — the
      // default 30s assertion timeout isn't always enough. Worth a follow-up:
      // real crews launching from the same spot can share one NAT/WiFi IP too.
      await expect(page.getByText(/[1-9]\d* crew live/)).toBeVisible({ timeout: 90_000 })
      await expect(crewPage.getByText(/[1-9]\d* crew live/)).toBeVisible({ timeout: 90_000 })

      await crewContext.close()
    } finally {
      await apiDeleteTrip(request, leaderToken, tripId)
    }
  })
})
