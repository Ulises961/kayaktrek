import { test as setup } from "@playwright/test"
import { LEADER, CREW, registerAndActivate } from "../fixtures/auth"
import { LoginPage } from "../pages/login.page"
import { BASE_URL } from "../playwright.config"

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
