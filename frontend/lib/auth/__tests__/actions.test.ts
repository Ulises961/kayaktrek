import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}))

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { login, register, logout, forgotPassword, resetPassword, refreshSession } from "../actions"

const mockCookieStore = {
  set: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)
})

describe("login", () => {
  it("returns an error when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))
    const result = await login(null, formData({ mail: "a@b.com", password: "pw" }))
    expect(result).toEqual({ success: false, error: expect.stringContaining("server") })
  })

  it("returns an error for invalid credentials (401)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const result = await login(null, formData({ mail: "a@b.com", password: "wrong" }))
    expect(result).toEqual({ success: false, error: expect.stringContaining("Invalid") })
  })

  it("sets cookies and redirects on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "acc", refresh_token: "ref" }),
      }),
    )
    await login(null, formData({ mail: "a@b.com", password: "correct" }))
    expect(mockCookieStore.set).toHaveBeenCalledWith("access_token", "acc", expect.any(Object))
    expect(mockCookieStore.set).toHaveBeenCalledWith("refresh_token", "ref", expect.any(Object))
    expect(redirect).toHaveBeenCalledWith("/dashboard")
  })
})

describe("register", () => {
  it("returns an error for duplicate email/username (409)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409 }))
    const result = await register(
      null,
      formData({
        mail: "a@b.com",
        username: "kayaker",
        name: "N",
        phone: "+34600000000",
        password: "Expedition#24",
      }),
    )
    expect(result).toEqual({ success: false, error: expect.stringContaining("already in use") })
  })
})

describe("logout", () => {
  it("clears both cookies and redirects to /", async () => {
    await logout()
    expect(mockCookieStore.delete).toHaveBeenCalledWith("access_token")
    expect(mockCookieStore.delete).toHaveBeenCalledWith("refresh_token")
    expect(redirect).toHaveBeenCalledWith("/")
  })
})

describe("forgotPassword", () => {
  it("returns success when the server responds (any status)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    const result = await forgotPassword(null, formData({ mail: "a@b.com" }))
    expect(result).toEqual({ success: true })
  })

  it("returns success even when the server returns non-ok (mirrors backend always-200 intent)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    const result = await forgotPassword(null, formData({ mail: "a@b.com" }))
    expect(result).toEqual({ success: true })
  })

  it("returns an error when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))
    const result = await forgotPassword(null, formData({ mail: "a@b.com" }))
    expect(result).toEqual({ success: false, error: expect.stringContaining("server") })
  })

  it("returns an error for an invalid email", async () => {
    const result = await forgotPassword(null, formData({ mail: "not-an-email" }))
    expect(result).toEqual({ success: false, error: expect.any(String) })
  })
})

const VALID_PASSWORD = "Expedition#24"

describe("resetPassword", () => {
  it("redirects to /login?reset=1 on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    await resetPassword(
      null,
      formData({ token: "tok", password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD }),
    )
    expect(redirect).toHaveBeenCalledWith("/login?reset=1")
  })

  it("returns an error for an invalid or expired token (400)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }))
    const result = await resetPassword(
      null,
      formData({ token: "bad", password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD }),
    )
    expect(result).toEqual({ success: false, error: expect.stringContaining("expired") })
  })

  it("returns an error when passwords do not match", async () => {
    const result = await resetPassword(
      null,
      formData({ token: "tok", password: VALID_PASSWORD, confirmPassword: "different" }),
    )
    expect(result).toEqual({ success: false, error: expect.stringContaining("match") })
  })

  it("returns an error when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))
    const result = await resetPassword(
      null,
      formData({ token: "tok", password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD }),
    )
    expect(result).toEqual({ success: false, error: expect.stringContaining("server") })
  })
})

describe("refreshSession", () => {
  it("returns false without fetching when there is no refresh_token cookie", async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const result = await refreshSession()

    expect(result).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rotates the refresh token cookie alongside the access token on success", async () => {
    mockCookieStore.get.mockReturnValue({ value: "old-refresh" })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "new-access", refresh_token: "new-refresh" }),
      }),
    )

    const result = await refreshSession()

    expect(result).toBe(true)
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "access_token",
      "new-access",
      expect.any(Object),
    )
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "refresh_token",
      "new-refresh",
      expect.any(Object),
    )
  })

  it("returns false and sets no cookies when the backend rejects the refresh token", async () => {
    mockCookieStore.get.mockReturnValue({ value: "stale-refresh" })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const result = await refreshSession()

    expect(result).toBe(false)
    expect(mockCookieStore.set).not.toHaveBeenCalled()
  })

  it("returns false when the server is unreachable", async () => {
    mockCookieStore.get.mockReturnValue({ value: "some-refresh" })
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))

    const result = await refreshSession()

    expect(result).toBe(false)
  })
})

// Helper
function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v))
  return fd
}
