import { test, expect } from "@playwright/test"
import { LoginPage } from "../pages/login.page"
import { LEADER } from "../fixtures/auth"

// All auth tests need a clean (unauthenticated) context
test.use({ storageState: { cookies: [], origins: [] } })

// Uses the leader account provisioned by auth.setup.ts — no fresh registration
// needed, which avoids burning the 5/hour rate limit during test runs.
test("login → dashboard", async ({ page }) => {
  await new LoginPage(page).login(LEADER.mail, LEADER.pwd)
  await expect(page).toHaveURL(/dashboard/)
})

test("login with wrong password shows error", async ({ page }) => {
  await new LoginPage(page).goto()
  await page.getByLabel("Email").fill(LEADER.mail)
  await page.getByLabel("Password").fill("WrongPassword1!")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/login/)
  // Wait for button to re-enable (server responded), then check error
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled()
  await expect(page.getByTestId("auth-error")).toBeVisible()
})

test("unauthenticated access to dashboard redirects to login", async ({ page }) => {
  await page.goto("/dashboard")
  await page.waitForURL(/login/)
  await expect(page).toHaveURL(/login/)
})
