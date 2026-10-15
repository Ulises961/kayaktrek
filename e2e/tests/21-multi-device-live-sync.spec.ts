import { randomUUID } from "node:crypto"
import { test, expect, type Page } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import {
  apiGetAccessToken,
  apiCreateTrip,
  apiDeleteTrip,
  apiInviteByEmail,
  apiAcceptInvitation,
  apiTransitionState,
} from "../fixtures/trips"
import { API_URL } from "../playwright.config"

// M36 — one person's change reaches every other open page, without a reload.
//
// Nothing here reloads, and that is deliberate: `mutateAndSettle(..., { reload: true })`
// exists because Next's client router was seen dropping the apply of a streamed
// `router.refresh()` on large trees (fixtures/ui.ts). The whole mechanism under test IS a
// `router.refresh()` fired by a poll that found a change, so a reload before asserting would
// hide the exact failure this spec is here to catch. If these flake on a Next upgrade, that
// is the first suspect.
//
// The write is made through the API rather than a second browser: what is being proved is
// that a commit — from anywhere — is logged, found by the page's next poll and applied, not
// that a form submits.

// Commit -> the page's next poll (every 7 s, up to +20%) -> 250ms debounce -> router.refresh()
// -> server render. Seconds, with room for a loaded runner.
const APPLIED_WITHIN_MS = 20_000

// A page polls from the revision it was rendered at, and its first poll lands within a second
// of mounting; waiting for it to report live means the page has caught up before anyone
// changes anything.
async function expectStreamLive(page: Page) {
  await expect(page.locator("[data-trip-changes-status]")).toHaveAttribute(
    "data-trip-changes-status",
    "live",
    { timeout: APPLIED_WITHIN_MS },
  )
}

test.describe("Multi-device live sync (M36)", () => {
  let tripId: string
  let leaderToken: string
  let crewToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    crewToken = await apiGetAccessToken(request, CREW.mail, CREW.pwd)
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Live Sync" })
    tripId = trip.id as string
  })

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("a change made elsewhere appears on an already-open page", async ({ page, request }) => {
    await page.goto(`/trips/${tripId}/crew`)
    await expect(page.getByText("No pending invitations.")).toBeVisible()
    await expectStreamLive(page)

    // Someone — another device, or another crew member — invites a paddler.
    await apiInviteByEmail(request, leaderToken, tripId, CREW.mail)

    await expect(page.getByText(/pending invitations \(1\)/i)).toBeVisible({
      timeout: APPLIED_WITHIN_MS,
    })
    await expect(page.getByText(CREW.name)).toBeVisible()
  })

  test("a crew member's open page notices they were removed", async ({
    page,
    browser,
    request,
  }) => {
    await apiInviteByEmail(request, leaderToken, tripId, CREW.mail)
    await apiAcceptInvitation(request, crewToken, tripId)

    const crewContext = await browser.newContext({ storageState: "e2e/.auth/crew.json" })
    const crewPage = await crewContext.newPage()
    await crewPage.goto(`/trips/${tripId}/crew`)
    await expect(crewPage.getByText(CREW.name).first()).toBeVisible()
    await expectStreamLive(crewPage)

    const me = await request.get(`${API_URL}/api/v1/user/me`, {
      headers: { Authorization: `Bearer ${crewToken}` },
    })
    const crewUserId = (await me.json()).id as string
    const removal = await request.delete(`${API_URL}/api/v1/trip/${tripId}/member/${crewUserId}`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
    })
    expect(removal.ok()).toBeTruthy()

    // The removal is itself a change on the trip, so the crew member's next poll hears it
    // (their membership is remembered for 30 s), refreshes, and the server now refuses them.
    await expect(crewPage.getByRole("heading", { name: /destination not found/i })).toBeVisible({
      timeout: APPLIED_WITHIN_MS,
    })

    await crewContext.close()
    // The leader's own page is unaffected by someone else's removal beyond the list.
    await page.goto(`/trips/${tripId}/crew`)
    await expect(page.getByText(CREW.name, { exact: true })).not.toBeVisible()
  })

  test("a change a phone replays from its offline queue appears on an open page", async ({
    page,
    request,
  }) => {
    await apiTransitionState(request, leaderToken, tripId, "happening")
    await page.goto(`/trips/${tripId}/crew`)
    await expect(page.getByRole("button", { name: /pause expedition/i })).toBeVisible()
    await expectStreamLive(page)

    // What the phone's queue does when it comes back online: one batch of envelopes. This is
    // the only automated proof that the commit hook sees `apply_batch`, not just the routes.
    const replay = await request.post(`${API_URL}/api/v1/sync/mutations`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
      data: {
        mutations: [
          {
            mutationId: randomUUID(),
            entityType: "trip",
            operation: "update",
            entityId: tripId,
            payload: { action: "pause" },
            deviceTimestamp: new Date().toISOString(),
          },
        ],
      },
    })
    expect(replay.ok()).toBeTruthy()
    expect((await replay.json()).results[0].status).toBe("applied")

    await expect(page.getByRole("button", { name: /resume/i })).toBeVisible({
      timeout: APPLIED_WITHIN_MS,
    })
  })
})
