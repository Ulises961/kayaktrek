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

  test("leader sets shore contact on float plan page", async ({ page }) => {
    // Shore contact lives on /trips/:id/float-plan, not the logistics tab
    await page.goto(`/trips/${tripId}/float-plan`)

    await page.getByRole("button", { name: "Edit", exact: true }).click()
    await page.getByLabel(/name/i).fill("Alice Shore")
    await page.getByLabel(/email/i).fill("alice@example.com")
    await page.getByRole("button", { name: /save/i }).click()
    await expect(page.getByText("Alice Shore")).toBeVisible()
  })

  test("leader saves float plan to confirm it", async ({ page }) => {
    // Float plan confirm: leader saves their vessel/emergency info from the float plan tab
    await page.goto(`/trips/${tripId}?tab=float-plan`)
    await page.getByRole("button", { name: "Edit", exact: true }).click()
    await page.getByRole("button", { name: /save float plan/i }).click()
    // Amber banner disappears once the leader has saved their float plan info
    await expect(page.getByText(/review your float plan/i)).not.toBeVisible({ timeout: 1000 })
  })

  test("leader generates float plan share link", async ({ page }) => {
    await page.goto(`/trips/${tripId}/float-plan`)
    await page.getByRole("button", { name: /generate float plan link/i }).click()
    await expect(page.getByRole("button", { name: /copy link/i })).toBeVisible({ timeout: 1000 })
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

    // Expand the Travel documents accordion before interacting with its content
    await page.getByRole("button", { name: /travel documents/i }).click()

    await page.getByRole("button", { name: /add document/i }).click()
    await page.getByLabel(/name/i).fill("Camping Permit")
    await page.getByLabel(/type/i).selectOption("permit")
    await page.getByRole("button", { name: /^add$/i }).click()

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

    // Expand the Shuttle accordion before interacting with its content
    await page.getByRole("button", { name: /shuttle/i }).click()

    await page.getByRole("button", { name: /add vehicle/i }).click()
    await page.getByLabel(/vehicle description/i).fill("Toyota Land Cruiser")
    // Select crew member as driver from the unlabeled select inside the dialog
    await page.getByRole("dialog").locator("select").selectOption({ label: CREW.name })
    await page.getByRole("button", { name: /^add$/i }).click()

    await expect(page.getByText("Toyota Land Cruiser")).toBeVisible()
    await expect(page.getByRole("tabpanel", { name: /logistics/i }).getByText(CREW.name).first()).toBeVisible()
  })

  test("crew member joins a shuttle vehicle as passenger", async ({ page, browser }) => {
    // Leader adds vehicle via UI
    await page.goto(`/trips/${tripId}`)
    await page.getByRole("tab", { name: /logistics/i }).click()
    await page.getByRole("button", { name: /shuttle/i }).click()
    await page.getByRole("button", { name: /add vehicle/i }).click()
    await page.getByLabel(/vehicle description/i).fill("Toyota Land Cruiser")
    await page.getByRole("button", { name: /^add$/i }).click()
    await expect(page.getByText("Toyota Land Cruiser")).toBeVisible()

    // Crew member joins the vehicle
    const crewContext = await browser.newContext({ storageState: "e2e/.auth/crew.json" })
    const crewPage = await crewContext.newPage()
    await crewPage.goto(`/trips/${tripId}`)
    await crewPage.getByRole("tab", { name: /logistics/i }).click()
    await crewPage.getByRole("button", { name: /shuttle/i }).click()
    await crewPage.getByRole("button", { name: /join/i }).click()
    await expect(crewPage.getByRole("tabpanel", { name: /logistics/i }).getByText(CREW.name)).toBeVisible({ timeout: 1000 })
    await crewContext.close()

    // Leader sees the passenger on their view
    await page.reload()
    await page.getByRole("button", { name: /shuttle/i }).click()
    await expect(page.getByRole("tabpanel", { name: /logistics/i }).getByText(CREW.name)).toBeVisible()
  })
})
