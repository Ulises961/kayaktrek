import { test, expect } from "@playwright/test"
import { LEADER, CREW } from "../fixtures/auth"
import {
  apiGetAccessToken,
  apiCreateTrip,
  apiDeleteTrip,
  apiInviteByEmail,
  apiAcceptInvitation,
} from "../fixtures/trips"
import {
  apiCreateItem,
  apiGetInventory,
  findRequirementId,
  apiContribute,
} from "../fixtures/inventory"
import { mutateAndSettle } from "../fixtures/ui"

// One of the seeded DEFAULT_TRIP_REQUIREMENTS (leader-proposed at trip creation).
const REQ = "VHF radio"

test.describe("Trip inventory — requirements & authorship", () => {
  let tripId: string
  let inventoryId: string
  let leaderToken: string

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    const trip = await apiCreateTrip(request, leaderToken, { destination: "E2E Inventory Test" })
    tripId = trip.id as string
    inventoryId = (await apiGetInventory(request, leaderToken, tripId)).inventoryId
  })

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("leader sees the seeded default requirements", async ({ page }) => {
    await page.goto(`/trips/${tripId}?tab=items`)
    const row = page.locator("li").filter({ hasText: REQ })
    await expect(row).toBeVisible()
    await expect(row.getByText("needed")).toBeVisible()
  })

  test("leader contributes an owned item → requirement becomes covered", async ({ page, request }) => {
    await apiCreateItem(request, leaderToken, { name: "E2E Drysuit", status: "owned" })
    await page.goto(`/trips/${tripId}?tab=items`)

    await mutateAndSettle(
      page,
      () => page.getByLabel(`Contribute to ${REQ}`).selectOption({ label: "E2E Drysuit" }),
      { reload: true },
    )

    const row = page.locator("li").filter({ hasText: REQ })
    await expect(row.getByText("covered")).toBeVisible()
    await expect(row.getByText("E2E Drysuit")).toBeVisible()
    await expect(row.getByRole("button", { name: /withdraw/i })).toBeVisible()
  })

  test("multi-contributor: a second member also covers the requirement", async ({ page, request }) => {
    // Crew joins and covers the requirement with their own item via API.
    const crewToken = await apiGetAccessToken(request, CREW.mail, CREW.pwd)
    await apiInviteByEmail(request, leaderToken, tripId, CREW.mail)
    await apiAcceptInvitation(request, crewToken, tripId)
    const crewItem = await apiCreateItem(request, crewToken, { name: "E2E Crew VHF", status: "owned" })
    const reqId = findRequirementId(await apiGetInventory(request, leaderToken, tripId), REQ)
    await apiContribute(request, crewToken, inventoryId, reqId, crewItem.id)

    // Leader contributes their own item through the UI; the row then shows both.
    await apiCreateItem(request, leaderToken, { name: "E2E Leader VHF", status: "owned" })
    await page.goto(`/trips/${tripId}?tab=items`)
    await mutateAndSettle(
      page,
      () => page.getByLabel(`Contribute to ${REQ}`).selectOption({ label: "E2E Leader VHF" }),
      { reload: true },
    )

    const row = page.locator("li").filter({ hasText: REQ })
    await expect(row.getByText("covered")).toBeVisible()
    await expect(row.getByText("E2E Leader VHF")).toBeVisible()
    await expect(row.getByText("E2E Crew VHF")).toBeVisible()
  })

  test("proposer can remove a requirement; a non-proposer cannot", async ({ page, browser, request }) => {
    const crewToken = await apiGetAccessToken(request, CREW.mail, CREW.pwd)
    await apiInviteByEmail(request, leaderToken, tripId, CREW.mail)
    await apiAcceptInvitation(request, crewToken, tripId)

    // Non-proposer (crew) sees the requirement but has no Remove control.
    const crewContext = await browser.newContext({ storageState: "e2e/.auth/crew.json" })
    const crewPage = await crewContext.newPage()
    await crewPage.goto(`/trips/${tripId}?tab=items`)
    await expect(crewPage.locator("li").filter({ hasText: REQ })).toBeVisible()
    await expect(crewPage.getByRole("button", { name: `Remove ${REQ}` })).toHaveCount(0)
    await crewContext.close()

    // Proposer (leader) removes it. Removal goes through a window.confirm().
    page.on("dialog", (d) => d.accept())
    await page.goto(`/trips/${tripId}?tab=items`)
    // Since M6b, defaults seed at trip-creation/member-join only — a reload
    // does NOT re-seed the removed requirement (the pre-M6b re-seed-on-read
    // behaviour this test used to dodge is gone).
    await mutateAndSettle(page, () => page.getByRole("button", { name: `Remove ${REQ}` }).click(), {
      reload: true,
    })
    await expect(page.locator("li").filter({ hasText: REQ })).toHaveCount(0)
  })

  test("a contributor can withdraw their own contribution", async ({ page, request }) => {
    const item = await apiCreateItem(request, leaderToken, { name: "E2E Tow Line", status: "owned" })
    const reqId = findRequirementId(await apiGetInventory(request, leaderToken, tripId), REQ)
    await apiContribute(request, leaderToken, inventoryId, reqId, item.id)

    await page.goto(`/trips/${tripId}?tab=items`)
    const row = page.locator("li").filter({ hasText: REQ })
    await expect(row.getByText("covered")).toBeVisible()

    await mutateAndSettle(page, () => row.getByRole("button", { name: /withdraw/i }).click(), {
      reload: true,
    })
    await expect(row.getByText("needed")).toBeVisible()
  })
})
