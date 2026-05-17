import { test, expect } from "@playwright/test"
import { LEADER } from "../fixtures/auth"
import { apiGetAccessToken, apiCreateTrip, apiDeleteTrip } from "../fixtures/trips"
import { API_URL } from "../playwright.config"

test.describe("Public float plan viewer", () => {
  let tripId: string
  let leaderToken: string
  let shareToken: string

  test.beforeAll(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Share Test" })
    tripId = trip.id as string

    // Generate share token via API
    const shareRes = await request.post(`${API_URL}/api/logistics/${tripId}/share`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
    })
    expect(shareRes.ok()).toBeTruthy()
    const shareData = await shareRes.json()
    shareToken = shareData.shareToken
  })

  test.afterAll(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("valid token renders the public float plan viewer", async ({ browser }) => {
    // Open in a fresh unauthenticated context
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()

    await page.goto(`/float-plan/${shareToken}`)
    await expect(page.getByText("E2E Share Test")).toBeVisible()
    await expect(page.getByText(/crew/i)).toBeVisible()
    await context.close()
  })

  test("no auth required for public float plan", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()

    const response = await page.goto(`/float-plan/${shareToken}`)
    expect(response?.status()).toBe(200)
    await context.close()
  })

  test("unknown token shows 404 state", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()

    await page.goto("/float-plan/totallyunknowntoken1234567890")
    // 404 empty state should be visible
    await expect(page.getByText(/not found/i).or(page.getByRole("heading", { name: /404/i }))).toBeVisible()
    await context.close()
  })
})
