import { test, expect } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import { apiGetAccessToken, apiCreateTrip, apiDeleteTrip } from "../fixtures/trips"
import { mutateAndSettle } from "../fixtures/ui"
import { API_URL } from "../playwright.config"

// NOTE: This spec requires the frontend advance-state-button.tsx to be updated
// to the 3-state machine (building → happening → past). Currently the button
// still references the old draft/planning states and will not render for a
// building-state trip. These tests will fail until that migration is complete.

test.describe("Trip state transitions", () => {
  let tripId: string
  let leaderToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E State Test" })
    tripId = trip.id as string
  })

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("leader advances building → happening via UI", async ({ page }) => {
    await page.goto(`/trips/${tripId}`)
    await page.getByRole("button", { name: /begin expedition/i }).click()
    // Confirmation dialog
    await mutateAndSettle(page, () => page.getByRole("button", { name: /confirm/i }).click(), {
      reload: true,
    })
    // "Mark as past" appearing is the end-state signal: state is now "happening" AND RSC has re-rendered
    await expect(page.getByRole("button", { name: /mark as past/i })).toBeVisible()
  })

  test("leader advances happening → past via UI", async ({ page, request }) => {
    // Move to happening via API first
    const res = await request.post(
      `${API_URL}/api/v1/trip/${tripId}/state`,
      {
        headers: { Authorization: `Bearer ${leaderToken}` },
        data: { state: "happening" },
      }
    )
    expect(res.ok()).toBeTruthy()

    await page.goto(`/trips/${tripId}`)
    await page.getByRole("button", { name: /mark as past/i }).click()
    await mutateAndSettle(page, () => page.getByRole("button", { name: /confirm/i }).click(), {
      reload: true,
    })
    await expect(page.locator('[data-slot="state-badge"]').filter({ hasText: /past/i })).toBeVisible()
  })

  test("crew cannot transition state", async ({ browser, request }) => {
    // Invite and have crew accept via API
    const crewToken = await apiGetAccessToken(request, "e2e.crew@example.com", "Crew$ecure1!")
    await request.post(`${API_URL}/api/v1/trip/${tripId}/invite`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
      data: { email: "e2e.crew@example.com" },
    })
    await request.post(`${API_URL}/api/v1/trip/${tripId}/invitation`, {
      headers: { Authorization: `Bearer ${crewToken}` },
      data: { accepted: true },
    })

    const crewContext = await browser.newContext({ storageState: "e2e/.auth/crew.json" })
    const crewPage = await crewContext.newPage()
    await crewPage.goto(`/trips/${tripId}`)

    // Advance state button must not be present for crew
    await expect(crewPage.getByRole("button", { name: /begin expedition/i })).not.toBeVisible()
    await crewContext.close()
  })
})
