import { test, expect, Page } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import { apiGetAccessToken, apiCreateTrip, apiDeleteTrip } from "../fixtures/trips"
import { mutateAndSettle } from "../fixtures/ui"
import { API_URL } from "../playwright.config"

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

  /** The state-progression controls live inside the identity card's "Details" disclosure,
   * which is collapsed on entry — a click on a hidden button just waits out the timeout.
   *
   * Tolerant of the disclosure being absent entirely: it only renders when there is
   * something to put in it, which for a crew member on a bare trip can be nothing. */
  async function openDetails(page: Page) {
    const trigger = page.getByRole("button", { name: "Details" })
    if ((await trigger.count()) > 0) await trigger.click()
  }

  test("leader advances building → happening via UI", async ({ page }) => {
    await page.goto(`/trips/${tripId}`)
    await openDetails(page)
    await page.getByRole("button", { name: /begin expedition/i }).click()
    // Confirmation dialog
    await mutateAndSettle(page, () => page.getByRole("button", { name: /confirm/i }).click(), {
      reload: true,
    })
    // "Mark as past" appearing is the end-state signal: state is now "happening" AND RSC has
    // re-rendered. The reload collapsed the disclosure again, so re-open it to read the control.
    await openDetails(page)
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
    await openDetails(page)
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
    // Opened deliberately: with the disclosure shut, "not visible" would hold even for a
    // leader, so the assertion would pass without proving anything about crew privileges.
    await openDetails(crewPage)
    await expect(crewPage.getByRole("button", { name: /begin expedition/i })).not.toBeVisible()
    await crewContext.close()
  })
})
