import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")
  return { ...actual, apiGet: vi.fn() }
})

import { apiGet } from "@/lib/api/client"
import { refreshPendingRequests } from "../poll"

const mockApiGet = vi.mocked(apiGet)

beforeEach(() => {
  mockApiGet.mockReset()
})

describe("refreshPendingRequests", () => {
  it("reads the summary endpoint and returns its counts", async () => {
    mockApiGet.mockResolvedValue({ tripInvitations: 2, buddyRequests: 1, endorsementRequests: 0 })

    const result = await refreshPendingRequests()

    expect(mockApiGet).toHaveBeenCalledWith("/api/pending-requests/summary")
    expect(result).toEqual({ tripInvitations: 2, buddyRequests: 1, endorsementRequests: 0 })
  })

  it("returns null when the request fails, so the caller keeps what it had", async () => {
    mockApiGet.mockRejectedValue(new Error("network down"))

    expect(await refreshPendingRequests()).toBeNull()
  })

  it("returns null for an answer that is not the summary", async () => {
    mockApiGet.mockResolvedValue({ tripInvitations: "many" })

    expect(await refreshPendingRequests()).toBeNull()
  })

  it("lets a dead session's redirect through instead of swallowing it", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    })
    mockApiGet.mockRejectedValue(redirect)

    await expect(refreshPendingRequests()).rejects.toBe(redirect)
  })
})
