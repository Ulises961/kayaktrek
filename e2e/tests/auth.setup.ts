import { test as setup } from "@playwright/test"
import { LEADER, CREW, registerAndActivate } from "../fixtures/auth"
import { LoginPage } from "../pages/login.page"
import { BASE_URL, API_URL } from "../playwright.config"

// Runs first (workers: 1, fullyParallel: false → setup tests run in file order).
// Gunicorn serves under multiple workers, each cold on its first request; fire a
// handful of pings at the public endpoint so both workers are JIT-warm before any
// spec asserts against the trip-detail fan-out. See ADR-030 in docs/adr/foundation.md.
setup("warm up backend workers", async ({ request }) => {
  for (let i = 0; i < 6; i++) {
    await request.get(`${API_URL}/api/v1/item-categories`)
  }
})

setup("create leader auth state", async ({ request, browser }) => {
  await registerAndActivate(request, LEADER)

  const context = await browser.newContext({ baseURL: BASE_URL })
  const page = await context.newPage()
  await new LoginPage(page).login(LEADER.mail, LEADER.pwd)
  await context.storageState({ path: "e2e/.auth/leader.json" })
  await context.close()
})

setup("create crew auth state", async ({ request, browser }) => {
  await registerAndActivate(request, CREW)

  const context = await browser.newContext({ baseURL: BASE_URL })
  const page = await context.newPage()
  await new LoginPage(page).login(CREW.mail, CREW.pwd)
  await context.storageState({ path: "e2e/.auth/crew.json" })
  await context.close()
})
