import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT")
  }),
}))
vi.mock("next/navigation", () => ({ redirect }))

const { refreshSession } = vi.hoisted(() => ({
  refreshSession: vi.fn(),
}))
vi.mock("@/lib/auth/actions", () => ({ refreshSession }))

import { cookies } from "next/headers"
import { apiUpload, apiPut, apiPost, apiDelete, apiGet } from "../client"

const mockCookieStore = {
  get: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)
  mockCookieStore.get.mockReturnValue({ value: "access-token" })
})

describe("apiUpload", () => {
  it("retries once after a successful refresh on 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 401, ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "1" }) })
    vi.stubGlobal("fetch", fetchMock)
    refreshSession.mockResolvedValue(true)

    const result = await apiUpload("/api/upload", new FormData())

    expect(result).toEqual({ id: "1" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(redirect).not.toHaveBeenCalled()
  })

  it("throws instead of retrying again when still 401 after the one retry (matches apiFetch)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 401, ok: false })
    vi.stubGlobal("fetch", fetchMock)
    refreshSession.mockResolvedValue(true)

    await expect(apiUpload("/api/upload", new FormData())).rejects.toThrow(
      "POST /api/upload failed: 401",
    )

    // One-shot: the initial attempt plus exactly one retry, never an unbounded loop.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(redirect).not.toHaveBeenCalled()
  })

  it("redirects to /login immediately when the refresh itself fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 401, ok: false })
    vi.stubGlobal("fetch", fetchMock)
    refreshSession.mockResolvedValue(false)

    await expect(apiUpload("/api/upload", new FormData())).rejects.toThrow("NEXT_REDIRECT")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(redirect).toHaveBeenCalledWith("/login")
  })
})

describe("apiPut", () => {
  it("surfaces the backend error message on failure, like apiPost/apiPatch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: "Name is required" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiPut("/api/thing/1", { name: "" })).rejects.toThrow("Name is required")
  })

  it("falls back to a status-only message when the body has no message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json")
      },
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiPut("/api/thing/1", { name: "x" })).rejects.toThrow(
      "PUT /api/thing/1 failed: 500",
    )
  })
})

// The backend's error handler always shapes failures as {error: <category>,
// message: <detail>} (Api/error_handlers.py) — these lock down that the thrown
// Error's .message is EXACTLY the clean backend message, with no
// "METHOD /path failed: <status> —" technical prefix glued on. That prefix
// leaking into user-facing UI (e.g. a toast/pill built from e.message) was the
// M8 §8.3 close-day bug this pins down.
describe("clean backend message extraction (no technical prefix when a message exists)", () => {
  it("apiPost surfaces exactly the backend message, not the method/path/status prefix", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: "Conflict",
        message: "There's no itinerary day scheduled for that date.",
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiPost("/api/live/trip/1/close-day", {})).rejects.toThrow(
      "There's no itinerary day scheduled for that date.",
    )
    try {
      await apiPost("/api/live/trip/1/close-day", {})
    } catch (e) {
      expect((e as Error).message).toBe("There's no itinerary day scheduled for that date.")
    }
  })

  it("apiPost flattens a Marshmallow-style field-error object into a readable string", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Bad Request", message: { date: ["Not a valid date."] } }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiPost("/api/thing", {})).rejects.toThrow("date: Not a valid date.")
  })

  it("apiPost falls back to the technical message when the body has no message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiPost("/api/thing", {})).rejects.toThrow("POST /api/thing failed: 500")
  })

  it("apiDelete surfaces the backend message instead of a bare status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Conflict", message: "Still referenced by an active trip." }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiDelete("/api/thing/1")).rejects.toThrow("Still referenced by an active trip.")
  })

  it("apiGet surfaces the backend message instead of a bare status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "Forbidden", message: "You do not have access to this trip." }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiGet("/api/thing/1")).rejects.toThrow("You do not have access to this trip.")
  })
})
