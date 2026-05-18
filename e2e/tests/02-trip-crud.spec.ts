import { test, expect } from "@playwright/test"
import { LEADER } from "../fixtures/auth"
import { apiGetAccessToken, apiDeleteTrip } from "../fixtures/trips"

// Uses leader storageState set by auth.setup.ts

test.describe("Trip CRUD", () => {
  let createdTripId: string

  test.afterEach(async ({ request }) => {
    if (createdTripId) {
      const token = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
      await apiDeleteTrip(request, token, createdTripId)
      createdTripId = ""
    }
  })

  test("create a trip and land on the trip detail page", async ({ page }) => {
    await page.goto("/trips")
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: /new trip/i }).click()
    await page.getByPlaceholder("Destination").fill("Lofoten Islands")
    await page.getByRole("button", { name: "Create" }).click()

    await page.waitForURL(/\/trips\/[0-9a-f-]+$/)
    const url = page.url()
    createdTripId = url.split("/trips/")[1]

    await expect(page.getByText("Lofoten Islands")).toBeVisible()
  })

  test("edit trip destination via PATCH", async ({ page }) => {
    await page.goto("/trips")
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: /new trip/i }).click()
    await page.getByPlaceholder("Destination").fill("Azores")
    await page.getByRole("button", { name: "Create" }).click()
    await page.waitForURL(/\/trips\/[0-9a-f-]+$/)
    createdTripId = page.url().split("/trips/")[1]

    // Edit destination inline
    await page.getByRole("button", { name: /edit trip/i }).click()
    const destInput = page.getByPlaceholder("Destination")
    await destInput.fill("Faroe Islands")
    await page.getByRole("button", { name: /save/i }).click()

    await expect(page.getByText("Faroe Islands")).toBeVisible()
  })

  test("created trip shows leader as traveller", async ({ page }) => {
    await page.goto("/trips")
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: /new trip/i }).click()
    await page.getByPlaceholder("Destination").fill("Norway")
    await page.getByRole("button", { name: "Create" }).click()
    await page.waitForURL(/\/trips\/[0-9a-f-]+$/)
    createdTripId = page.url().split("/trips/")[1]

    await expect(page.getByText(LEADER.name)).toBeVisible()
  })
})
