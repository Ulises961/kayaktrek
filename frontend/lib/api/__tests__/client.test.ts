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
import { apiUpload, apiPut } from "../client"

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
