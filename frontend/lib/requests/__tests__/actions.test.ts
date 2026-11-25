import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }))
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")
  return { ...actual, apiGet: vi.fn() }
})

import { getSession } from "@/lib/auth/session"
import { apiGet } from "@/lib/api/client"
import { EMPTY_PENDING_SUMMARY } from "../pending"
import { getPendingRequestsSummary } from "../actions"

const mockGetSession = vi.mocked(getSession)
const mockApiGet = vi.mocked(apiGet)

beforeEach(() => {
  mockGetSession.mockReset()
  mockApiGet.mockReset()
})

describe("getPendingRequestsSummary", () => {
  it("is empty without calling the API when nobody is signed in", async () => {
    mockGetSession.mockResolvedValue(null)

    expect(await getPendingRequestsSummary()).toEqual(EMPTY_PENDING_SUMMARY)
    expect(mockApiGet).not.toHaveBeenCalled()
  })

  it("reads the three counts from the one summary endpoint, not three lists", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1" } as Awaited<ReturnType<typeof getSession>>)
    const counts = {
      tripInvitations: 1,
      buddyRequests: 2,
      endorsementRequests: 3,
      acceptedTripInvitations: 4,
      acceptedBuddyRequests: 5,
    }
    mockApiGet.mockResolvedValue(counts)

    const summary = await getPendingRequestsSummary()

    expect(mockApiGet).toHaveBeenCalledTimes(1)
    expect(mockApiGet).toHaveBeenCalledWith("/api/pending-requests/summary")
    expect(summary).toEqual(counts)
  })

  // The layout renders this on every page; a failing badge must never take the page down.
  it("falls back to empty when the endpoint fails", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1" } as Awaited<ReturnType<typeof getSession>>)
    mockApiGet.mockRejectedValue(new Error("backend down"))

    expect(await getPendingRequestsSummary()).toEqual(EMPTY_PENDING_SUMMARY)
  })

  it("lets a dead session's redirect through", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1" } as Awaited<ReturnType<typeof getSession>>)
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    })
    mockApiGet.mockRejectedValue(redirect)

    await expect(getPendingRequestsSummary()).rejects.toBe(redirect)
  })
})
