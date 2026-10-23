import { test, expect } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import {
  apiAcceptInvitation,
  apiCreateTrip,
  apiDeleteTrip,
  apiGetAccessToken,
  apiInviteByEmail,
} from "../fixtures/trips"
import { mutateAndSettle, openTripMenu } from "../fixtures/ui"
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

  test("leader advances building → happening via UI", async ({ page }) => {
    await page.goto(`/trips/${tripId}`)
    await openTripMenu(page)
    await page.getByRole("menuitem", { name: /begin expedition/i }).click()
    // Confirmation dialog
    await mutateAndSettle(page, () => page.getByRole("button", { name: /confirm/i }).click(), {
      reload: true,
    })
    // "Mark as past" appearing in the menu is the end-state signal: state is now "happening"
    // AND RSC has re-rendered. The reload closed the menu, so open it again to read it.
    await openTripMenu(page)
    await expect(page.getByRole("menuitem", { name: /mark as past/i })).toBeVisible()
  })

  test("leader advances happening → past via UI", async ({ page, request }) => {
    // Move to happening via API first
    const res = await request.post(`${API_URL}/api/v1/trip/${tripId}/state`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
      data: { state: "happening" },
    })
    expect(res.ok()).toBeTruthy()

    await page.goto(`/trips/${tripId}`)
    await openTripMenu(page)
    await page.getByRole("menuitem", { name: /mark as past/i }).click()
    await mutateAndSettle(page, () => page.getByRole("button", { name: /confirm/i }).click(), {
      reload: true,
    })
    await expect(
      page.locator('[data-slot="state-badge"]').filter({ hasText: /past/i }),
    ).toBeVisible()
  })

  test("crew cannot transition state", async ({ browser, request }) => {
    // Invite and have crew accept via API. The invite endpoint takes a userId, never a bare
    // email, so the shared helper resolves it; posting `{ email }` by hand is refused with 400,
    // which left the crew member outside the trip and this assertion proving nothing.
    const crewToken = await apiGetAccessToken(request, CREW.mail, CREW.pwd)
    await apiInviteByEmail(request, leaderToken, tripId, CREW.mail)
    await apiAcceptInvitation(request, crewToken, tripId)

    const crewContext = await browser.newContext({ storageState: "e2e/.auth/crew.json" })
    const crewPage = await crewContext.newPage()
    await crewPage.goto(`/trips/${tripId}`)

    // The state step must not be offered to crew. The menu is opened, and shown to hold
    // Leave, so "no Begin expedition" is a statement about what crew are offered and not
    // about a menu that failed to open.
    await openTripMenu(crewPage)
    await expect(crewPage.getByRole("menuitem", { name: /leave trip/i })).toBeVisible()
    await expect(crewPage.getByRole("menuitem", { name: /begin expedition/i })).not.toBeVisible()
    await crewContext.close()
  })
})
