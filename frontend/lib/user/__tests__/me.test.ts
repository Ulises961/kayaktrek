import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({ cookies: vi.fn() }))

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")
  return { ...actual, apiGet }
})

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getMe } from "../me"

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

describe("getMe", () => {
  it("returns null without calling the API when there are no auth cookies at all", async () => {
    // Public pages (/explore, /routes/[id], /story/[token], public profiles) call getMe to
    // personalise for whoever happens to be signed in. An anonymous visitor is a normal
    // caller there, not a dead session — asking the API would 401, fail to refresh, and
    // bounce a legitimate anonymous reader to /login.
    withCookies([])

    await expect(getMe()).resolves.toBeNull()
    expect(apiGet).not.toHaveBeenCalled()
  })

  it("returns the user when authenticated and the API succeeds", async () => {
    withCookies(["access_token"])
    const mockUser = {
      id: "01952f1a-0000-7000-8000-00000000a001",
      mail: "test@example.com",
      username: "testuser",
      name: "Test",
      surname: "User",
    }
    apiGet.mockResolvedValue(mockUser)

    const result = await getMe()
    // Schema parsing may add defaults (e.g., unitPreference), so match the returned shape
    expect(result).toMatchObject(mockUser)
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

  it("still lets a dead session redirect when credentials are present", async () => {
    withCookies(["refresh_token"])
    apiGet.mockImplementation(() => redirect("/login"))

    await expect(getMe()).rejects.toThrow()
  })

  it("returns null on an ordinary API failure", async () => {
    withCookies(["access_token"])
    apiGet.mockRejectedValue(new Error("500 from the API"))

    await expect(getMe()).resolves.toBeNull()
  })
})
