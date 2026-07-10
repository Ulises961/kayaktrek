import { test, expect, Browser } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import { apiGetAccessToken, apiCreateTrip, apiDeleteTrip } from "../fixtures/trips"
import { mutateAndSettle } from "../fixtures/ui"

test.describe("Crew invitation flow", () => {
  let tripId: string
  let leaderToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Invitation Test" })
    tripId = trip.id as string
  })

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("leader invites crew → crew accepts → crew appears on trip", async ({ page, browser }) => {
    // Leader: navigate to trip and invite crew by email. The invite form is
    // always visible on the crew tab (M7b also added an "Invite a buddy"
    // picker next to it, so match the submit button exactly).
    await page.goto(`/trips/${tripId}`)
    await page.getByRole("tab", { name: /crew/i }).click()
    await page.getByPlaceholder(/email/i).fill(CREW.mail)
    await page.getByRole("button", { name: "Invite", exact: true }).click()
    await expect(page.getByText(CREW.name)).toBeVisible()

    // Crew: open the trip in a separate context and accept the invitation
    const crewContext = await browser.newContext({
      storageState: "e2e/.auth/crew.json",
    })
    const crewPage = await crewContext.newPage()
    await crewPage.goto(`/invitations`)
    await crewPage.getByRole("button", { name: /accept/i }).click()
    await crewContext.close()

    // Leader: refresh and verify crew is now a traveller (not pending)
    await page.reload()
    await page.getByRole("tab", { name: /crew/i }).click()
    await expect(page.getByText(CREW.name)).toBeVisible()
  })

  test("leader can cancel a pending invitation", async ({ page }) => {
    // Invite via API, then cancel via UI
    const leaderPage = page
    await leaderPage.goto(`/trips/${tripId}`)
    await leaderPage.getByRole("tab", { name: /crew/i }).click()
    await leaderPage.getByPlaceholder(/email/i).fill(CREW.mail)
    await leaderPage.getByRole("button", { name: "Invite", exact: true }).click()
    await expect(leaderPage.getByText(CREW.name)).toBeVisible()

    // Cancel
    await mutateAndSettle(leaderPage, () =>
      leaderPage.getByRole("button", { name: /cancel invitation/i }).click(),
    )
    await expect(leaderPage.getByText(CREW.name)).not.toBeVisible()
  })
})
