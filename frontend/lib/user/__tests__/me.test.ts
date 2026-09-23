import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({ cookies: vi.fn() }))

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")
  return { ...actual, apiGet }
})

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { isRedirectError } from "@/lib/api/client"
import { getMe, getViewer, hasLiveSession } from "../me"

const cookieStore = { get: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(cookies).mockResolvedValue(cookieStore as any)
})

function withCookies(names: string[]) {
  cookieStore.get.mockImplementation((name: string) =>
    names.includes(name) ? { value: `${name}-value` } : undefined,
  )
}

const VALID_USER = {
  id: "01952f1a-0000-7000-8000-00000000a001",
  mail: "test@example.com",
  username: "testuser",
  name: "Test",
  surname: "User",
}

/** Credentials that exist but cannot be refreshed — apiFetch answers by redirecting. */
function withDeadSession() {
  withCookies(["refresh_token"])
  apiGet.mockImplementation(() => redirect("/login"))
}

/**
 * Assert a rejection is Next's redirect signal aimed at /login, not merely "some error".
 * A bare `rejects.toThrow()` here would also pass if the code crashed on a schema parse,
 * which is the opposite of the behaviour under test.
 */
async function expectRedirectToLogin(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  )
  expect(error, "expected a rejection, got a resolved value").not.toBeNull()
  expect(isRedirectError(error)).toBe(true)
  expect((error as { digest: string }).digest).toContain("/login")
}

describe("getMe", () => {
  it("returns null without calling the API when there are no auth cookies at all", async () => {
    withCookies([])

    await expect(getMe()).resolves.toBeNull()
    expect(apiGet).not.toHaveBeenCalled()
  })

  it("returns the user when authenticated and the API succeeds", async () => {
    withCookies(["access_token"])
    apiGet.mockResolvedValue(VALID_USER)

    const result = await getMe()
    // Schema parsing may add defaults (e.g., unitPreference), so match the returned shape
    expect(result).toMatchObject(VALID_USER)
    expect(result).not.toBeNull()
    expect(apiGet).toHaveBeenCalledWith("/api/user/me")
  })

  it("returns null when the API response fails validation", async () => {
    withCookies(["access_token"])
    // Mock an invalid response (missing required fields: mail, username, name)
    apiGet.mockResolvedValue({ id: "01952f1a-0000-7000-8000-00000000a001" })

    const result = await getMe()
    expect(result).toBeNull()
  })

  it("redirects to /login when credentials are present but the session is dead", async () => {
    // The (app) pages' contract: M17's instant revocation made "signed out" reachable in
    // seconds, and a revoked device must land on the login screen rather than render an
    // empty page that reads as a broken app.
    withDeadSession()

    await expectRedirectToLogin(getMe())
  })

  it("returns null on an ordinary API failure", async () => {
    withCookies(["access_token"])
    apiGet.mockRejectedValue(new Error("500 from the API"))

    await expect(getMe()).resolves.toBeNull()
  })
})

describe("getViewer", () => {
  // The public-page contract: no auth state may decide whether the page renders. Every
  // case below returns a value; none of them may throw a redirect.

  it("returns null without calling the API for a fully anonymous visitor", async () => {
    withCookies([])

    await expect(getViewer()).resolves.toBeNull()
    expect(apiGet).not.toHaveBeenCalled()
  })

  it("returns null instead of redirecting when the session is dead", async () => {
    // The regression this exists to prevent. A stale cookie is not a claim to be signed
    // in — it is the state every user is left in by the M17 deploy (pre-M17 refresh
    // tokens carry no `sid`), by a revocation, and by a 30-day-expired refresh token.
    // getMe() answers that with a redirect, which turns a public share link into a login
    // wall for a reader who never asked to sign in.
    withDeadSession()

    await expect(getViewer()).resolves.toBeNull()
  })

  it("still personalises for a viewer who does have a live session", async () => {
    // The reason public pages call this at all — dropping to null unconditionally would
    // "fix" the redirect by making the page anonymous for everyone.
    withCookies(["access_token"])
    apiGet.mockResolvedValue(VALID_USER)

    await expect(getViewer()).resolves.toMatchObject(VALID_USER)
  })

  it("returns null on an ordinary API failure", async () => {
    withCookies(["access_token"])
    apiGet.mockRejectedValue(new Error("500 from the API"))

    await expect(getViewer()).resolves.toBeNull()
  })
})

describe("hasLiveSession", () => {
  it("is false for a fully anonymous visitor", async () => {
    withCookies([])

    await expect(hasLiveSession()).resolves.toBe(false)
    expect(apiGet).not.toHaveBeenCalled()
  })

  it("is true for a visitor with a working session", async () => {
    withCookies(["access_token"])
    apiGet.mockResolvedValue(VALID_USER)

    await expect(hasLiveSession()).resolves.toBe(true)
  })

  it("is FALSE when the credentials are dead, not merely present", async () => {
    // The bug this closes. A 30-day-expired refresh token, a revoked device, or a pre-M17
    // cookie is a visitor the app cannot recognise — and dressing the shell as signed-in
    // offered them Dashboard, Trips, Gear, Logs and Paddlers, every one of which leads
    // only to /login. M23 §1 is the rule; this is the case that escaped it.
    withDeadSession()

    await expect(hasLiveSession()).resolves.toBe(false)
  })

  it("stays TRUE when /api/user/me merely failed", async () => {
    // The distinction worth keeping, and why this is not simply `getViewer() !== null`: a
    // 500 says nothing about the session. Flipping that visitor to anonymous would take
    // Sign out away from someone who is still signed in, and tell them so falsely.
    withCookies(["access_token"])
    apiGet.mockRejectedValue(new Error("500 from the API"))

    await expect(hasLiveSession()).resolves.toBe(true)
  })
})
