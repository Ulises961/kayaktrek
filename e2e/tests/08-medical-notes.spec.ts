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

    // "Add notes" triggers the re-auth flow
    await crewPage.getByRole("button", { name: /add notes/i }).click()
    // Re-auth: enter password and continue
    await crewPage.getByLabel(/password/i).fill(CREW_PWD)
    await crewPage.getByRole("button", { name: /continue/i }).click()
    // Textarea is now shown — fill in medical notes
    await crewPage.getByPlaceholder(/allergies/i).fill("Allergic to penicillin")
    // Save
    await crewPage.getByRole("button", { name: /^save$/i }).click()
    await expect(crewPage.getByText("Saved.")).toBeVisible()
    // Share with trip leader so they can decrypt
    await crewPage.getByRole("button", { name: /share with trip leader/i }).click()
    await crewContext.close()

    // Leader: navigate to the float plan page where the crew manifest lives
    const leaderContext = await browser.newContext({ storageState: "e2e/.auth/leader.json" })
    const leaderPage = await leaderContext.newPage()
    await leaderPage.goto(`/trips/${tripId}/float-plan`)

    // "View medical notes" button is visible for the crew member who shared their notes
    await expect(leaderPage.getByRole("button", { name: /view medical notes/i })).toBeVisible()

    // Click to trigger the password dialog
    await leaderPage.getByRole("button", { name: /view medical notes/i }).click()
    await leaderPage.getByRole("dialog").locator("[type=password]").fill(LEADER.pwd)
    await leaderPage.getByRole("button", { name: /view notes/i }).click()

    await expect(leaderPage.getByText("Allergic to penicillin")).toBeVisible({ timeout: 2000 })
    await leaderContext.close()
  })
})
