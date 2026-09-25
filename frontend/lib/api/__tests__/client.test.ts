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
import {
  apiUpload,
  apiPut,
  apiPost,
  apiDelete,
  apiGet,
  ApiError,
  rethrowUnlessClientError,
} from "../client"

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

// apiUpload above implements the one-shot 401-refresh-and-retry guard with its own
// duplicated copy of the logic (it can't share `apiFetch` because of the FormData body /
// Content-Type constraint noted in client.ts). The get/post/put/patch/delete quintet all
// funnel through the shared internal `apiFetch`, which is a separate implementation of the
// same guard and was previously only exercised indirectly via apiUpload's tests — a
// regression in `apiFetch`'s retry-once logic specifically would not have been caught here.
describe("apiFetch retry-once guard (via apiGet/apiPost, the shared internal implementation)", () => {
  it("retries once after a successful refresh on 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 401, ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "1" }) })
    vi.stubGlobal("fetch", fetchMock)
    refreshSession.mockResolvedValue(true)

    const result = await apiGet("/api/thing/1")

    expect(result).toEqual({ id: "1" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(redirect).not.toHaveBeenCalled()
  })

  it("throws instead of retrying again when still 401 after the one retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)
    refreshSession.mockResolvedValue(true)

    await expect(apiGet("/api/thing/1")).rejects.toThrow("GET /api/thing/1 failed: 401")

    // One-shot: the initial attempt plus exactly one retry, never an unbounded loop.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(redirect).not.toHaveBeenCalled()
  })

  it("redirects to /login immediately when the refresh itself fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 401, ok: false })
    vi.stubGlobal("fetch", fetchMock)
    refreshSession.mockResolvedValue(false)

    await expect(apiGet("/api/thing/1")).rejects.toThrow("NEXT_REDIRECT")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(redirect).toHaveBeenCalledWith("/login")
  })

  // apiPost/apiPatch/apiDelete deliberately disable the retry guard when the caller passes
  // extraHeaders — that's the elevated-token path (re-auth-gated actions like certifications,
  // see lib/certifications/actions.ts's `elevated()`), where a 401 means the short-lived
  // elevated token is bad, not the session's access token. Retrying via a session refresh
  // there would be meaningless: it would never fix an elevated-token failure and would mask it
  // behind an unrelated session-refresh cycle.
  it("does not attempt a session refresh when extraHeaders are present (elevated-token calls)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ status: 401, ok: false, json: async () => ({ message: "bad token" }) })
    vi.stubGlobal("fetch", fetchMock)
    refreshSession.mockResolvedValue(true)

    await expect(
      apiPost("/api/user/me/certifications", {}, { "X-Elevated-Token": "tok" }),
    ).rejects.toThrow("bad token")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refreshSession).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
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

describe("failure classification", () => {
  it("apiGet rejects with an ApiError carrying the response status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: "Gone" }) }),
    )

    const error = await apiGet("/api/trip/1").catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).message).toBe("Gone")
  })

  it("bounds every request with a timeout signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)

    await apiGet("/api/trip/1")

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it("lets a request that timed out reject as-is instead of looking like a missing resource", async () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout))

    await expect(apiGet("/api/trip/1")).rejects.toBe(timeout)
  })
})

describe("rethrowUnlessClientError", () => {
  const apiError = (status: number) => new ApiError(`GET /x failed: ${status}`, status)

  it.each([400, 403, 404, 422])("swallows a %i so the caller can render not-found", (status) => {
    expect(() => rethrowUnlessClientError(apiError(status))).not.toThrow()
  })

  it.each([429, 500, 502, 503])("rethrows a %i so the error boundary shows it", (status) => {
    const error = apiError(status)
    expect(() => rethrowUnlessClientError(error)).toThrow(error)
  })

  it("rethrows a timeout, a network failure and a parse error", () => {
    const timeout = new DOMException("timeout", "TimeoutError")
    const parse = new SyntaxError("Unexpected token")
    expect(() => rethrowUnlessClientError(timeout)).toThrow(timeout)
    expect(() => rethrowUnlessClientError(new TypeError("fetch failed"))).toThrow("fetch failed")
    expect(() => rethrowUnlessClientError(parse)).toThrow(parse)
  })

  it("rethrows Next's redirect signal", () => {
    const redirectSignal = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    })
    expect(() => rethrowUnlessClientError(redirectSignal)).toThrow(redirectSignal)
  })
})
