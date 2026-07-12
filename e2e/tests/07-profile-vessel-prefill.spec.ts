import { test, expect } from "@playwright/test"
import { LEADER } from "../fixtures/auth"
import { apiGetAccessToken, apiCreateTrip, apiDeleteTrip } from "../fixtures/trips"
import { API_URL } from "../playwright.config"
import { mutateAndSettle } from "../fixtures/ui"

test.describe("Profile vessel pre-fill on trip creation", () => {
  let tripId: string
  let leaderToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)

    // Get leader's user ID, then set vessel info on their profile via API
    const meRes = await request.get(`${API_URL}/api/v1/user/me`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
    })
    const me = await meRes.json()
    await request.patch(`${API_URL}/api/v1/user/${me.id}`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
      data: {
        vesselMake: "Seabird",
        vesselModel: "Meridian",
        vesselLengthCm: 520,
        vesselColorPrimary: "Red",
      },
    })

    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Vessel Prefill" })
    tripId = trip.id as string
  })

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("vessel set in profile is pre-filled in the emergency info segment", async ({ page }) => {
    await page.goto(`/trips/${tripId}/my-float-plan`)

    // Leader's vessel should appear in the emergency info segment
    await expect(page.getByText("Seabird")).toBeVisible()
    await expect(page.getByText("Meridian")).toBeVisible()
  })

  test("crew member can override vessel per-trip without changing profile", async ({ page, browser, request }) => {
    const crewToken = await apiGetAccessToken(request, "e2e.crew@example.com", "Crew$ecure1!")

    // Invite crew and have them accept via API
    await request.post(`${API_URL}/api/v1/trip/${tripId}/invite`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
      data: { email: "e2e.crew@example.com" },
    })
    await request.post(`${API_URL}/api/v1/trip/${tripId}/invitation`, {
      headers: { Authorization: `Bearer ${crewToken}` },
      data: { accepted: true },
    })

    // Crew: override vessel in float plan tab
    const crewContext = await browser.newContext({ storageState: "e2e/.auth/crew.json" })
    const crewPage = await crewContext.newPage()
    await crewPage.goto(`/trips/${tripId}/my-float-plan`)

    await crewPage.getByRole("button", { name: "Edit", exact: true }).click()
    await crewPage.getByLabel(/make/i).fill("Prijon")
    await crewPage.getByLabel(/model/i).fill("Barracuda")
    await mutateAndSettle(crewPage, () => crewPage.getByRole("button", { name: /save/i }).click(), {
      reload: true,
    })

    await expect(crewPage.getByText("Prijon")).toBeVisible()
    await crewContext.close()

    // Leader generates share → snapshot must reflect override
    const shareRes = await request.post(`${API_URL}/api/v1/logistics/${tripId}/share`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
    })
    const { shareToken } = await shareRes.json()

    const publicContext = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const publicPage = await publicContext.newPage()
    await publicPage.goto(`/float-plan/${shareToken}`)
    await expect(publicPage.getByText("Prijon")).toBeVisible()
    await expect(publicPage.getByText("Barracuda")).toBeVisible()
    await publicContext.close()
  })
})
