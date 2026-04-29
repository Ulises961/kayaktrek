import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock next/headers before importing session
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

import { cookies } from "next/headers"
import { getSession } from "../session"

function makeToken(payload: object, expired = false): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const exp = expired ? Math.floor(Date.now() / 1000) - 60 : Math.floor(Date.now() / 1000) + 900
  const body = Buffer.from(JSON.stringify({ exp, ...payload })).toString("base64url")
  return `${header}.${body}.signature`
}

function mockCookies(token: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === "access_token" && token ? { name, value: token } : undefined),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

describe("getSession", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns null when no cookie is present", async () => {
    mockCookies(undefined)
    expect(await getSession()).toBeNull()
  })

  it("returns null for an expired token", async () => {
    mockCookies(makeToken({ user_id: "123", email: "a@b.com", is_admin: false }, true))
    expect(await getSession()).toBeNull()
  })

  it("returns the session for a valid token", async () => {
    mockCookies(makeToken({ user_id: "abc-123", email: "user@example.com", is_admin: false }))
    const session = await getSession()
    expect(session).toEqual({ userId: "abc-123", email: "user@example.com", isAdmin: false })
  })

  it("returns isAdmin true when token has is_admin set", async () => {
    mockCookies(makeToken({ user_id: "admin-1", email: "admin@example.com", is_admin: true }))
    const session = await getSession()
    expect(session?.isAdmin).toBe(true)
  })
})
