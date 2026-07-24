import { test, expect } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import {
  apiGetAccessToken,
  apiCreateTrip,
  apiDeleteTrip,
  apiInviteByEmail,
  apiAcceptInvitation,
} from "../fixtures/trips"
import {
  apiGetMe,
  apiSetProfilePublic,
  apiClearGraph,
  apiMakeBuddies,
  apiListConnections,
  apiListBlocks,
  apiCreateLog,
  apiDeleteLog,
  apiClearLogs,
} from "../fixtures/connections"
import { mutateAndSettle } from "../fixtures/ui"

// M7b — paddler connections (search, buddies, blocking, invite-from-buddies,
// endorsement requests). Proves the cross-service flows the unit/component tests
// mock out. Both users must be public for search to surface them; we set that and
// reset the graph around every test so each asserts exactly one transition.

const CREW_STORAGE = "e2e/.auth/crew.json"

test.describe("Paddler connections", () => {
  let leaderToken: string
  let crewToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    crewToken = await apiGetAccessToken(request, CREW.mail, CREW.pwd)

    const [leaderMe, crewMe] = await Promise.all([
      apiGetMe(request, leaderToken),
      apiGetMe(request, crewToken),
    ])
    await apiSetProfilePublic(request, leaderToken, leaderMe.id, true)
    await apiSetProfilePublic(request, crewToken, crewMe.id, true)

    await apiClearGraph(request, leaderToken)
    await apiClearGraph(request, crewToken)
  })

  test.afterEach(async ({ request }) => {
    await apiClearGraph(request, leaderToken)
    await apiClearGraph(request, crewToken)
  })

  test("search → buddy request → accept → mutual buddies", async ({ page, browser }) => {
    // Leader: find the crew member and send a buddy request. Find and Buddies
    // are merged into one page (M12 §N) — no tabs, the search box live-filters
    // existing connections and (once non-empty) also searches the community.
    await page.goto("/paddlers")
    await page.getByRole("textbox", { name: /search paddlers/i }).fill(CREW.name)
    await expect(page.getByText(`@${CREW.username}`)).toBeVisible()
    await page.getByRole("button", { name: /add buddy/i }).click()
    // The action flips locally to Pending without a re-search.
    await expect(page.getByRole("button", { name: /pending/i })).toBeVisible()

    // Crew: the incoming request shows directly on the merged page.
    const crewContext = await browser.newContext({ storageState: CREW_STORAGE })
    const crewPage = await crewContext.newPage()
    await crewPage.goto("/paddlers")
    await expect(crewPage.getByText(LEADER.name)).toBeVisible()
    await mutateAndSettle(
      crewPage,
      () => crewPage.getByRole("button", { name: /accept/i }).click(),
      { reload: true },
    )
    await expect(crewPage.getByRole("button", { name: /unfriend/i })).toBeVisible()
    await crewContext.close()

    // Leader: the accepted buddy now shows in the Buddies section.
    await page.goto("/paddlers")
    await expect(page.getByText(CREW.name)).toBeVisible()
    await expect(page.getByRole("button", { name: /unfriend/i })).toBeVisible()
  })

  test("blocking tears down the connection, revokes a pending invite and hides from search", async ({
    page,
    request,
  }) => {
    // Pre-state: leader and crew are buddies, and crew has a pending trip invite.
    await apiMakeBuddies(request, leaderToken, crewToken, CREW.username)
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Block Test" })
    const tripId = trip.id as string
    await apiInviteByEmail(request, leaderToken, tripId, CREW.mail)

    // Leader: block the crew member from the search result overflow menu.
    await page.goto("/paddlers")
    await page.getByRole("textbox", { name: /search paddlers/i }).fill(CREW.name)
    await expect(page.getByText(`@${CREW.username}`)).toBeVisible()
    await page.getByRole("button", { name: /more actions/i }).click()
    await page.getByRole("menuitem", { name: /block/i }).click()
    // The card disappears once blocked. Assert on the overflow-menu button,
    // not the "@username" text — the leader and crew are already buddies at
    // this point, so the merged Find/Buddies page (M12 §N) renders the crew
    // member's username twice (search card + Buddies row), which would make
    // getByText(`@${CREW.username}`) strict-mode-ambiguous. "More actions"
    // only exists on the search-result card.
    await expect(page.getByRole("button", { name: /more actions/i })).not.toBeVisible()

    // The buddy connection is gone. Clear the search term first — the "no
    // buddies match" empty-state text otherwise embeds CREW.name verbatim,
    // which would make getByText(CREW.name) find a false positive.
    await page.getByRole("textbox", { name: /search paddlers/i }).fill("")
    await expect(page.getByText(CREW.name)).not.toBeVisible()
    // Re-fill to force a fresh community search — the crew member no longer
    // surfaces there either. Debounce is 300ms (lib/utils/debounce.ts) and
    // resets on every keystroke, so an immediate re-fill right after clearing
    // can collapse into a no-op (debouncedTerm never actually passes through
    // "" — see useDebouncedValue) and the stale, still-1-item community
    // result never re-fetches. Let the empty term settle first.
    await page.waitForTimeout(400)
    await page.getByRole("textbox", { name: /search paddlers/i }).fill(CREW.name)
    await expect(page.getByText(/no paddlers found/i)).toBeVisible()

    // Backend side-effects: connection removed and the pending invitation revoked.
    expect(await apiListConnections(request, leaderToken)).toHaveLength(0)
    expect(await apiListBlocks(request, leaderToken)).toHaveLength(1)
    const tripAfter = await request
      .get(`${process.env.E2E_API_URL ?? "http://localhost:5000"}/api/v1/trip/${tripId}`, {
        headers: { Authorization: `Bearer ${leaderToken}` },
      })
      .then((r) => r.json())
    expect(tripAfter.pendingTravellers ?? []).toHaveLength(0)

    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("leader invites a buddy into a trip from the crew tab", async ({ page, request }) => {
    await apiMakeBuddies(request, leaderToken, crewToken, CREW.username)
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Invite Buddy" })
    const tripId = trip.id as string

    await page.goto(`/trips/${tripId}/crew`)
    await page.getByRole("button", { name: /invite a buddy/i }).click()
    await mutateAndSettle(
      page,
      () => page.getByRole("button", { name: new RegExp(CREW.name, "i") }).click(),
      { reload: true },
    )

    // Crew now shows under the trip's pending invitations.
    await expect(page.getByText(CREW.name)).toBeVisible()

    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("author asks a trip-mate to endorse a log; the endorser endorses from their inbox", async ({
    page,
    browser,
    request,
  }) => {
    // Shared trip: leader leads, crew accepts. Crew authors a trip-linked log.
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Endorse Test" })
    const tripId = trip.id as string
    await apiInviteByEmail(request, leaderToken, tripId, CREW.mail)
    await apiAcceptInvitation(request, crewToken, tripId)
    // Start from a clean logbook so exactly one "ask to endorse" affordance exists.
    await apiClearLogs(request, crewToken)
    const log = await apiCreateLog(request, crewToken, { tripId })

    // Crew (author): ask the leader (trip-mate) to endorse the log.
    const crewContext = await browser.newContext({ storageState: CREW_STORAGE })
    const crewPage = await crewContext.newPage()
    await crewPage.goto("/logs")
    await crewPage.getByRole("button", { name: /ask to endorse/i }).click()
    await mutateAndSettle(
      crewPage,
      () => crewPage.getByText(LEADER.name).click(),
      { reload: true },
    )
    await crewContext.close()

    // Leader: the request lands in the "asked to endorse" inbox; endorsing resolves it.
    await page.goto("/logs")
    await expect(page.getByText(/asked to endorse/i)).toBeVisible()
    await expect(page.getByText(new RegExp(`${CREW.name}.*asked you to endorse`, "i"))).toBeVisible()
    await mutateAndSettle(
      page,
      () => page.getByRole("button", { name: /^endorse$/i }).click(),
      { reload: true },
    )
    await expect(page.getByText(/asked to endorse/i)).not.toBeVisible()

    await apiDeleteLog(request, crewToken, log.id)
    await apiDeleteTrip(request, leaderToken, tripId)
  })
})
