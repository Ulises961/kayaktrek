import { test, expect } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import { apiGetAccessToken, apiCreateTrip, apiDeleteTrip } from "../fixtures/trips"
import { apiClearGraph, apiMakeBuddies } from "../fixtures/connections"
import { mutateAndSettle } from "../fixtures/ui"

test.describe("Crew invitation flow", () => {
  let tripId: string
  let leaderToken: string
  let crewToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    crewToken = await apiGetAccessToken(request, CREW.mail, CREW.pwd)
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Invitation Test" })
    tripId = trip.id as string

    // The crew tab's leader-facing invite affordance is now buddy-based, not a
    // raw email form (M7b retired the InviteForm) — the leader can only invite
    // an accepted connection.
    await apiClearGraph(request, leaderToken)
    await apiClearGraph(request, crewToken)
    await apiMakeBuddies(request, leaderToken, crewToken, CREW.username)
  })

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
    await apiClearGraph(request, leaderToken)
    await apiClearGraph(request, crewToken)
  })

  test("leader invites crew → crew accepts → crew appears on trip", async ({ page, browser }) => {
    // Leader: navigate to the crew tab and invite the buddy from the picker.
    await page.goto(`/trips/${tripId}/crew`)
    await page.getByRole("button", { name: /invite a buddy/i }).click()
    await mutateAndSettle(
      page,
      () => page.getByRole("button", { name: new RegExp(CREW.name, "i") }).click(),
      { reload: true },
    )
    await expect(page.getByText(CREW.name)).toBeVisible()

    // Crew: open the trip in a separate context and accept the invitation
    const crewContext = await browser.newContext({
      storageState: "e2e/.auth/crew.json",
    })
    const crewPage = await crewContext.newPage()
    await crewPage.goto(`/invitations`)
    // Scope to this trip's card — residue invitations from aborted runs may coexist
    // on the persistent dev DB, and a bare /accept/i would be ambiguous.
    await mutateAndSettle(crewPage, () =>
      crewPage
        .locator("[data-slot=card]", { hasText: "E2E Invitation Test" })
        .getByRole("button", { name: /accept/i })
        .click(),
    )
    await crewContext.close()

    // Leader: refresh and verify crew is now a traveller (not pending)
    await page.reload()
    await expect(page.getByText(CREW.name)).toBeVisible()
  })

  test("leader can cancel a pending invitation", async ({ page }) => {
    // Invite via the buddy picker, then cancel via UI
    const leaderPage = page
    await leaderPage.goto(`/trips/${tripId}/crew`)
    await leaderPage.getByRole("button", { name: /invite a buddy/i }).click()
    await mutateAndSettle(
      leaderPage,
      () => leaderPage.getByRole("button", { name: new RegExp(CREW.name, "i") }).click(),
      { reload: true },
    )
    await expect(leaderPage.getByText(CREW.name)).toBeVisible()

    // Cancel
    await mutateAndSettle(
      leaderPage,
      () => leaderPage.getByRole("button", { name: /cancel invitation/i }).click(),
      { reload: true },
    )
    await expect(leaderPage.getByText(CREW.name)).not.toBeVisible()
  })
})
