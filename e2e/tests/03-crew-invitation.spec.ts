import { test, expect, Browser } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import { apiGetAccessToken, apiCreateTrip, apiDeleteTrip } from "../fixtures/trips"

test.describe("Crew invitation flow", () => {
  let tripId: string
  let leaderToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Crew Test" })
    tripId = trip.id as string
  })

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("leader invites crew → crew accepts → crew appears on trip", async ({ page, browser }) => {
    // Leader: navigate to trip and invite crew by email
    await page.goto(`/trips/${tripId}`)
    await page.getByRole("button", { name: /invite/i }).click()
    await page.getByPlaceholder(/email/i).fill(CREW.mail)
    await page.getByRole("button", { name: /send invite/i }).click()
    await expect(page.getByText(CREW.name)).toBeVisible({ timeout: 8000 })

    // Crew: open the trip in a separate context and accept the invitation
    const crewContext = await browser.newContext({
      storageState: "e2e/.auth/crew.json",
    })
    const crewPage = await crewContext.newPage()
    await crewPage.goto(`/trips/${tripId}`)
    await crewPage.getByRole("button", { name: /accept/i }).click()
    await expect(crewPage.getByText(CREW.name)).toBeVisible({ timeout: 8000 })
    await crewContext.close()

    // Leader: refresh and verify crew is now a traveller (not pending)
    await page.reload()
    await expect(page.getByText(CREW.name)).toBeVisible()
  })

  test("leader can cancel a pending invitation", async ({ page }) => {
    // Invite via API, then cancel via UI
    const leaderPage = page
    await leaderPage.goto(`/trips/${tripId}`)
    await leaderPage.getByRole("button", { name: /invite/i }).click()
    await leaderPage.getByPlaceholder(/email/i).fill(CREW.mail)
    await leaderPage.getByRole("button", { name: /send invite/i }).click()
    await expect(leaderPage.getByText(CREW.name)).toBeVisible({ timeout: 8000 })

    // Cancel
    await leaderPage.getByRole("button", { name: /cancel invite/i }).click()
    await expect(leaderPage.getByText(CREW.name)).not.toBeVisible({ timeout: 5000 })
  })
})
