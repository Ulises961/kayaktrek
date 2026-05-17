import { test, expect } from "@playwright/test"
import { LEADER } from "../fixtures/auth"
import { apiGetAccessToken, apiCreateTrip, apiDeleteTrip, apiInviteByEmail, apiAcceptInvitation } from "../fixtures/trips"

const CREW_MAIL = "e2e.crew@example.com"
const CREW_PWD = "Crew$ecure1!"

test.describe("Medical notes — crew adds, leader decrypts", () => {
  let tripId: string
  let leaderToken: string
  let crewToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    crewToken = await apiGetAccessToken(request, CREW_MAIL, CREW_PWD)

    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Medical Test" })
    tripId = trip.id as string

    await apiInviteByEmail(request, leaderToken, tripId, CREW_MAIL)
    await apiAcceptInvitation(request, crewToken, tripId)
  })

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("crew adds medical notes → leader sees encrypted indicator → leader decrypts", async ({
    browser,
  }) => {
    // Crew: navigate to float plan tab and add medical notes
    const crewContext = await browser.newContext({ storageState: "e2e/.auth/crew.json" })
    const crewPage = await crewContext.newPage()
    await crewPage.goto(`/trips/${tripId}`)
    await crewPage.getByRole("tab", { name: /logistics/i }).click()
    await crewPage.getByRole("tab", { name: /float plan/i }).click()
    await crewPage.getByRole("button", { name: /add medical notes/i }).click()
    await crewPage.getByLabel(/medical notes/i).fill("Allergic to penicillin")
    await crewPage.getByRole("button", { name: /save/i }).click()
    await expect(crewPage.getByText(/medical notes saved/i).or(
      crewPage.getByText(/encrypted/i)
    )).toBeVisible({ timeout: 8000 })
    await crewContext.close()

    // Leader: sees encrypted indicator, then decrypts
    const leaderContext = await browser.newContext({ storageState: "e2e/.auth/leader.json" })
    const leaderPage = await leaderContext.newPage()
    await leaderPage.goto(`/trips/${tripId}`)
    await leaderPage.getByRole("tab", { name: /logistics/i }).click()
    await leaderPage.getByRole("tab", { name: /float plan/i }).click()

    // Encrypted badge or icon should be visible for crew member's notes
    await expect(leaderPage.getByText(/encrypted/i)).toBeVisible({ timeout: 5000 })

    // Leader decrypts by providing their password
    await leaderPage.getByRole("button", { name: /decrypt/i }).click()
    await leaderPage.getByLabel(/password/i).fill(LEADER.pwd)
    await leaderPage.getByRole("button", { name: /confirm/i }).click()

    await expect(leaderPage.getByText("Allergic to penicillin")).toBeVisible({ timeout: 8000 })
    await leaderContext.close()
  })
})
