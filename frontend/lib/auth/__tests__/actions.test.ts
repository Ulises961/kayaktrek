import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}))

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  login,
  register,
  logout,
  logoutEverywhere,
  forgotPassword,
  resetPassword,
  refreshSession,
  cancelDeletion,
  resendDeletionCancel,
} from "../actions"

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

  it("returns a distinct, actionable error when the account is scheduled for deletion (403)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ code: "deletion_pending" }),
      }),
    )
    const result = await login(null, formData({ mail: "a@b.com", password: "correct" }))
    expect(result).toEqual({
      success: false,
      error: "This account is scheduled for deletion.",
      code: "deletion_pending",
    })
    // Must not fall into the generic 403 branch, and must not redirect/set cookies.
    expect(redirect).not.toHaveBeenCalled()
    expect(mockCookieStore.set).not.toHaveBeenCalled()
  })

  it("returns a generic access-denied error for a 403 that isn't deletion_pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    )
    const result = await login(null, formData({ mail: "a@b.com", password: "correct" }))
    // Deliberately not "Invalid email or password" — a 403 is a different failure mode
    // (e.g. disabled account) than wrong credentials, and the two must stay distinguishable.
    expect(result).toEqual({ success: false, error: "Access denied." })
  })

  it("does not attach a code when the 403 body has none, so callers can't mistake it for deletion_pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    )
    const result = await login(null, formData({ mail: "a@b.com", password: "correct" }))
    expect(result).not.toHaveProperty("code")
  })

  it("falls back to a generic body when the 403 response has no parseable JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => {
          throw new Error("not json")
        },
      }),
    )
    const result = await login(null, formData({ mail: "a@b.com", password: "correct" }))
    expect(result).toEqual({ success: false, error: "Access denied." })
  })

  it("returns a generic error for an unexpected server failure (500)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const result = await login(null, formData({ mail: "a@b.com", password: "correct" }))
    // Deliberately generic and distinct from the 401 "Invalid email or password" copy —
    // a server outage must not read to the user as "your credentials are wrong".
    expect(result).toEqual({ success: false, error: "Something went wrong. Please try again." })
  })
})

const VALID_REGISTRATION = {
  mail: "a@b.com",
  username: "kayaker",
  phone: "+34600000000",
  password: "Expedition#24",
}

describe("register", () => {
  it("returns an error for duplicate email/username (409)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409 }))
    const result = await register(null, formData(VALID_REGISTRATION))
    // Deliberately pooled ("email or username") rather than naming which one collided —
    // naming the field would reopen the account-enumeration oracle M7a §4 closed.
    expect(result).toEqual({ success: false, error: expect.stringContaining("already in use") })
  })

  it("redirects to the registered-confirmation login page on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 201 }))
    await register(null, formData(VALID_REGISTRATION))
    expect(redirect).toHaveBeenCalledWith("/login?registered=1")
  })

  it("returns an error when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))
    const result = await register(null, formData(VALID_REGISTRATION))
    expect(result).toEqual({ success: false, error: expect.stringContaining("server") })
    expect(redirect).not.toHaveBeenCalled()
  })

  it("returns a generic error for an unexpected server failure (500)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const result = await register(null, formData(VALID_REGISTRATION))
    expect(result).toEqual({ success: false, error: "Something went wrong. Please try again." })
    expect(redirect).not.toHaveBeenCalled()
  })

  it("returns a distinct, field-attributable error for a missing/wrong invite code (403)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ code: "invalid_invite_code" }),
      }),
    )
    const result = await register(null, formData(VALID_REGISTRATION))
    expect(result).toEqual({
      success: false,
      error: "Invalid or missing invite code.",
      code: "invalid_invite_code",
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it("returns a generic access-denied error for a 403 that isn't invalid_invite_code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    )
    const result = await register(null, formData(VALID_REGISTRATION))
    expect(result).toEqual({ success: false, error: "Access denied." })
  })

  it("sends the invite code in the request body when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 })
    vi.stubGlobal("fetch", fetchMock)
    await register(null, formData({ ...VALID_REGISTRATION, inviteCode: "beta-2026" }))
    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body)).toMatchObject({ inviteCode: "beta-2026" })
  })
})

describe("logout", () => {
  it("calls the backend logout endpoint with the access token before clearing cookies", async () => {
    mockCookieStore.get.mockReturnValue({ value: "the-access-token" })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    await logout()

    // Ends only this device (M17) — asserted exactly, since /auth/logout-all is a
    // different endpoint that would also match a "contains /auth/logout" check.
    const [url] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/auth\/logout$/)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer the-access-token" }),
      }),
    )
    expect(mockCookieStore.delete).toHaveBeenCalledWith("access_token")
    expect(mockCookieStore.delete).toHaveBeenCalledWith("refresh_token")
    expect(redirect).toHaveBeenCalledWith("/")
  })

  it("still clears cookies and redirects even if the backend call fails", async () => {
    mockCookieStore.get.mockReturnValue({ value: "the-access-token" })
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))

    await logout()

    expect(mockCookieStore.delete).toHaveBeenCalledWith("access_token")
    expect(mockCookieStore.delete).toHaveBeenCalledWith("refresh_token")
    expect(redirect).toHaveBeenCalledWith("/")
  })

  it("skips the backend call and still clears cookies when there is no access token", async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await logout()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockCookieStore.delete).toHaveBeenCalledWith("access_token")
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

describe("cancelDeletion", () => {
  it("sends a DELETE with the token as a query param", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    await cancelDeletion("the-token")

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("token=the-token")
    expect(init).toEqual(expect.objectContaining({ method: "DELETE" }))
  })

  it("returns success: true on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    const result = await cancelDeletion("the-token")
    expect(result).toEqual({ success: true })
  })

  it("surfaces the backend's description on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ description: "This link has already been used." }),
      }),
    )
    const result = await cancelDeletion("used-token")
    expect(result).toEqual({ success: false, error: "This link has already been used." })
  })

  it("falls back to a generic message when the error body has no description", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error("not json")
        },
      }),
    )
    const result = await cancelDeletion("bad-token")
    expect(result).toEqual({
      success: false,
      error: "The cancellation link is invalid or has expired.",
    })
  })

  it("returns an error when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))
    const result = await cancelDeletion("the-token")
    expect(result).toEqual({ success: false, error: expect.stringContaining("server") })
  })
})

describe("resendDeletionCancel", () => {
  it("posts the email to /auth/resend-deletion-cancel", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    await resendDeletionCancel("a@b.com")

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/auth\/resend-deletion-cancel$/)
    expect(JSON.parse(init.body)).toEqual({ mail: "a@b.com" })
  })

  it("returns success: true even when the server responds non-ok (mirrors backend always-200 intent, avoids disclosing whether a pending deletion exists for that email)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const result = await resendDeletionCancel("a@b.com")
    expect(result).toEqual({ success: true })
  })

  it("returns an error when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))
    const result = await resendDeletionCancel("a@b.com")
    expect(result).toEqual({ success: false, error: expect.stringContaining("server") })
  })
})

describe("logoutEverywhere", () => {
  it("calls the sign-out-everywhere endpoint, not the per-device one", async () => {
    mockCookieStore.get.mockReturnValue({ value: "the-access-token" })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    await logoutEverywhere()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/auth\/logout-all$/)
    expect(mockCookieStore.delete).toHaveBeenCalledWith("access_token")
    expect(mockCookieStore.delete).toHaveBeenCalledWith("refresh_token")
    expect(redirect).toHaveBeenCalledWith("/")
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

  it("sends the refresh token in the JSON body, matching what the backend actually reads", async () => {
    // Regression guard: the backend's /auth/refresh reads `refresh_token` from the
    // request body (request.get_json()), not from an Authorization header. Sending it
    // as a header only (with no body) makes the backend 400 on every refresh attempt,
    // silently logging users out ~15 minutes after login regardless of a still-valid
    // 30-day refresh token.
    mockCookieStore.get.mockReturnValue({ value: "old-refresh" })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "new-access", refresh_token: "new-refresh" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await refreshSession()

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ refresh_token: "old-refresh" })
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

  it("single-flights concurrent refreshes of the same token into one exchange", async () => {
    // Refresh tokens are single-use: presenting the same one twice is indistinguishable
    // from theft server-side and revokes that device's session (M17). Two requests
    // arriving together read the same cookie, so without this only one of them would
    // survive.
    mockCookieStore.get.mockReturnValue({ value: "shared-refresh" })
    let resolveExchange: (value: unknown) => void = () => {}
    const inFlight = new Promise((resolve) => {
      resolveExchange = resolve
    })
    const fetchMock = vi.fn().mockImplementation(async () => {
      await inFlight
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "new-access", refresh_token: "new-refresh" }),
      }
    })
    vi.stubGlobal("fetch", fetchMock)

    const both = Promise.all([refreshSession(), refreshSession()])
    resolveExchange(undefined)
    const results = await both

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(results).toEqual([true, true])
    // Both callers still write the rotated pair to their own cookie store.
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "refresh_token",
      "new-refresh",
      expect.any(Object),
    )
  })

  it("does not reuse a settled exchange for a later call with the same token", async () => {
    // Holding the result past the in-flight window would hand a valid new pair to a
    // replayed token, which is the exact attack reuse detection exists to catch.
    mockCookieStore.get.mockReturnValue({ value: "shared-refresh" })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "new-access", refresh_token: "new-refresh" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await refreshSession()
    await refreshSession()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

// Helper
function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v))
  return fd
}
