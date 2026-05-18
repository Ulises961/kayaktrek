import { test, expect } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import { apiGetAccessToken, apiCreateTrip, apiDeleteTrip, apiInviteByEmail, apiAcceptInvitation } from "../fixtures/trips"

test.describe("Member removal", () => {
  let tripId: string
  let leaderToken: string
  let crewToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    crewToken = await apiGetAccessToken(request, CREW.mail, CREW.pwd)

    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Removal Test" })
    tripId = trip.id as string

    await apiInviteByEmail(request, leaderToken, tripId, CREW.mail)
    await apiAcceptInvitation(request, crewToken, tripId)
  })

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("leader removes crew member → crew loses access to the trip", async ({ page, browser }) => {
    await page.goto(`/trips/${tripId}`)

    // Leader removes crew via UI
    await page.getByText(CREW.name).hover()
    await page.getByRole("button", { name: /remove/i }).click()
    await page.getByRole("button", { name: /confirm/i }).click()
    await expect(page.getByText(CREW.name, { exact: true })).not.toBeVisible()

    // Crew: attempt to navigate to the trip — should get 403 or redirect
    const crewContext = await browser.newContext({ storageState: "e2e/.auth/crew.json" })
    const crewPage = await crewContext.newPage()
    await crewPage.goto(`/trips/${tripId}`)
    // Next.js renders the not-found page inline (200 status, same URL) when the API returns 403
    await expect(crewPage.getByRole("heading", { name: /destination not found/i })).toBeVisible()
    await crewContext.close()
  })
})
