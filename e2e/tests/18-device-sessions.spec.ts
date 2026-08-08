import { test, expect, Browser, Page } from "@playwright/test"
import { DEVICES_USER, apiLogin, registerAndActivate } from "../fixtures/auth"
import { API_URL } from "../playwright.config"
import { LoginPage } from "../pages/login.page"
import { mutateAndSettle } from "../fixtures/ui"

// M17 — per-device sessions. The whole point of the milestone is that one device's
// sign-out does NOT take the others with it, and that is precisely what a single
// browser context cannot prove: every test here runs two independent contexts (two
// cookie jars = two sessions on the same account) and asserts what survived, not just
// what ended.
//
// A dedicated account keeps this file from invalidating the shared LEADER/CREW storage
// state that every other spec depends on — "sign out everywhere" is not something to
// aim at a fixture other files are still using.

test.use({ storageState: { cookies: [], origins: [] } })

const DEVICES_LIST = "device-sessions"
const DEVICE_ROW = "device-session-row"

type Device = { page: Page; close: () => Promise<void> }

/** Contexts opened by the running test, torn down (and their sessions ended) in afterEach. */
const openDevices: Device[] = []

async function signIn(browser: Browser): Promise<Device> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await new LoginPage(page).login(DEVICES_USER.mail, DEVICES_USER.pwd)
  const device: Device = { page, close: () => context.close() }
  openDevices.push(device)
  return device
}

/** Sign out from the account menu in the app header, where the control lives. */
async function signOutFromHeader(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Account menu" }).click()
  await mutateAndSettle(page, () => page.getByRole("menuitem", { name: "Sign out" }).click())
}

/** True while this context can still load an authenticated page. A revoked session
 * fails the server-side auth check and the app redirects to /login. */
async function isSignedIn(page: Page): Promise<boolean> {
  await page.goto("/dashboard")
  await page.waitForLoadState("domcontentloaded")
  return !/\/login/.test(page.url())
}

test.describe("Per-device sessions", () => {
  // Once per run, not per test: /auth/register is rate-limited to 5 an hour, and
  // `request` is test-scoped so it cannot be used here.
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext()
    await registerAndActivate(request, DEVICES_USER)
    // Clear anything a previous run left behind — sessions live 30 days.
    const { accessToken } = await apiLogin(request, DEVICES_USER)
    await request.post(`${API_URL}/api/v1/auth/logout-all`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await request.dispose()
  })

  // Closing a browser context does NOT end the session behind it — that is the whole point
  // of the feature — so sessions outlive both the test and the run that made them, and row
  // counts would accumulate without an explicit reset. Done by spending one of the tokens
  // the test already holds rather than logging in again: /auth/login is rate-limited (10 a
  // minute, 50 an hour) and the suite as a whole runs close to that ceiling.
  test.afterEach(async ({ request }) => {
    for (const device of openDevices) {
      const cookies = await device.page.context().cookies()
      const token = cookies.find((cookie) => cookie.name === "access_token")?.value
      if (!token) continue
      const response = await request.post(`${API_URL}/api/v1/auth/logout-all`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      // A revoked token 401s here; try the next device. If none work, every session is
      // already gone, which is the state we were after anyway.
      if (response.ok()) break
    }
    await Promise.all(openDevices.map((device) => device.close()))
    openDevices.length = 0
  })

  test("signing out ends the calling device only", async ({ browser }) => {
    const laptop = await signIn(browser)
    const phone = await signIn(browser)

    await signOutFromHeader(laptop.page)

    expect(await isSignedIn(laptop.page)).toBe(false)
    // The device that did nothing must be untouched — this is the regression the
    // pre-M17 shared token_version made impossible.
    expect(await isSignedIn(phone.page)).toBe(true)
  })

  test("the devices list shows every signed-in device and marks the current one", async ({
    browser,
  }) => {
    const laptop = await signIn(browser)
    await signIn(browser)

    await laptop.page.goto("/settings")
    const rows = laptop.page.getByTestId(DEVICE_ROW)
    await expect(rows).toHaveCount(2)

    // Exactly one row is the caller's own, and it offers no way to sign itself out
    // from the list (that is what the header account menu's Sign out is for).
    await expect(laptop.page.getByText("(this device)")).toHaveCount(1)
    await expect(
      laptop.page.getByTestId(DEVICES_LIST).getByRole("button", { name: "Sign out" }),
    ).toHaveCount(1)
  })

  test("revoking a device from the list signs that device out", async ({ browser }) => {
    const laptop = await signIn(browser)
    const phone = await signIn(browser)

    await laptop.page.goto("/settings")
    await expect(laptop.page.getByTestId(DEVICE_ROW)).toHaveCount(2)

    // The only Sign out button inside the list belongs to the other device.
    await mutateAndSettle(
      laptop.page,
      () => laptop.page.getByTestId(DEVICES_LIST).getByRole("button", { name: "Sign out" }).click(),
      { reload: true },
    )

    await expect(laptop.page.getByTestId(DEVICE_ROW)).toHaveCount(1)
    // Revocation is instant — the phone's access token is unexpired but denylisted,
    // so its very next request is refused rather than waiting out the 15 minutes.
    expect(await isSignedIn(phone.page)).toBe(false)
    expect(await isSignedIn(laptop.page)).toBe(true)
  })

  test("sign out everywhere ends every device", async ({ browser }) => {
    const laptop = await signIn(browser)
    const phone = await signIn(browser)

    await laptop.page.goto("/settings")
    await mutateAndSettle(laptop.page, () =>
      laptop.page.getByRole("button", { name: "Sign out everywhere" }).click(),
    )

    expect(await isSignedIn(laptop.page)).toBe(false)
    expect(await isSignedIn(phone.page)).toBe(false)
  })
})
