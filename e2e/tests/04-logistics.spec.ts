import { test, expect } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import { apiGetAccessToken, apiCreateTrip, apiDeleteTrip, apiInviteByEmail, apiAcceptInvitation } from "../fixtures/trips"

test.describe("Logistics — shore contact and float plan", () => {
  let tripId: string
  let leaderToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Logistics Test" })
    tripId = trip.id as string
  })

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("leader sets shore contact and confirms float plan", async ({ page }) => {
    await page.goto(`/trips/${tripId}`)
    await page.getByRole("tab", { name: /logistics/i }).click()

    // Shore contact form
    await page.getByRole("button", { name: /edit/i }).click()
    await page.getByLabel(/name/i).fill("Alice Shore")
    await page.getByLabel(/email/i).fill("alice@example.com")
    await page.getByRole("button", { name: /save/i }).click()
    await expect(page.getByText("Alice Shore")).toBeVisible()

    // Float plan confirm
    await page.getByRole("tab", { name: /float plan/i }).click()
    await page.getByRole("button", { name: /confirm float plan/i }).click()
    // Amber banner should disappear once confirmed
    await expect(page.getByText(/float plan not yet confirmed/i)).not.toBeVisible({ timeout: 5000 })
  })

  test("leader generates float plan share link", async ({ page }) => {
    await page.goto(`/trips/${tripId}`)
    await page.getByRole("tab", { name: /logistics/i }).click()
    await page.getByRole("tab", { name: /float plan/i }).click()
    await page.getByRole("button", { name: /generate float plan link/i }).click()
    await expect(page.getByRole("button", { name: /copy link/i })).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(/last generated/i)).toBeVisible()
  })
})

test.describe("Logistics — travel documents", () => {
  let tripId: string
  let leaderToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Docs Test" })
    tripId = trip.id as string
  })

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("leader adds a travel document and it appears in logistics", async ({ page }) => {
    await page.goto(`/trips/${tripId}`)
    await page.getByRole("tab", { name: /logistics/i }).click()

    await page.getByRole("button", { name: /add document/i }).click()
    await page.getByLabel(/name/i).fill("Camping Permit")
    await page.getByLabel(/type/i).click()
    await page.getByRole("option", { name: /permit/i }).click()
    await page.getByRole("button", { name: /save/i }).click()

    await expect(page.getByText("Camping Permit")).toBeVisible()
  })
})

test.describe("Logistics — shuttle vehicle", () => {
  let tripId: string
  let leaderToken: string
  let crewToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    crewToken = await apiGetAccessToken(request, CREW.mail, CREW.pwd)
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Shuttle Test" })
    tripId = trip.id as string
    await apiInviteByEmail(request, leaderToken, tripId, CREW.mail)
    await apiAcceptInvitation(request, crewToken, tripId)
  })

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("leader adds a shuttle vehicle and assigns a crew member as driver", async ({ page }) => {
    await page.goto(`/trips/${tripId}`)
    await page.getByRole("tab", { name: /logistics/i }).click()

    await page.getByRole("button", { name: /add vehicle/i }).click()
    await page.getByLabel(/make/i).fill("Toyota")
    await page.getByLabel(/model/i).fill("Land Cruiser")
    await page.getByLabel(/plate/i).fill("AB 1234")

    // Select crew member as driver from the member dropdown
    await page.getByRole("combobox", { name: /driver/i }).selectOption({ label: CREW.name })

    await page.getByRole("button", { name: /save/i }).click()

    await expect(page.getByText("Toyota")).toBeVisible()
    await expect(page.getByText(CREW.name)).toBeVisible()
  })

  test("crew member joins a shuttle vehicle as passenger", async ({ page, browser }) => {
    // Leader adds vehicle via UI
    await page.goto(`/trips/${tripId}`)
    await page.getByRole("tab", { name: /logistics/i }).click()
    await page.getByRole("button", { name: /add vehicle/i }).click()
    await page.getByLabel(/make/i).fill("Toyota")
    await page.getByLabel(/model/i).fill("Land Cruiser")
    await page.getByLabel(/plate/i).fill("AB 1234")
    await page.getByRole("button", { name: /save/i }).click()
    await expect(page.getByText("Toyota")).toBeVisible()

    // Crew member joins the vehicle
    const crewContext = await browser.newContext({ storageState: "e2e/.auth/crew.json" })
    const crewPage = await crewContext.newPage()
    await crewPage.goto(`/trips/${tripId}`)
    await crewPage.getByRole("tab", { name: /logistics/i }).click()
    await crewPage.getByRole("button", { name: /join/i }).click()
    await expect(crewPage.getByText(CREW.name)).toBeVisible({ timeout: 8000 })
    await crewContext.close()

    // Leader sees the passenger on their view
    await page.reload()
    await expect(page.getByText(CREW.name)).toBeVisible()
  })
})
