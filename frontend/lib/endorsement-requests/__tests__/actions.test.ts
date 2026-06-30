import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

import { apiGet, apiPost, apiDelete } from "@/lib/api/client"
import { listEndorsementRequests, requestEndorsement, deleteEndorsementRequest } from "../actions"

beforeEach(() => vi.clearAllMocks())

describe("listEndorsementRequests", () => {
  it("queries the requested direction", async () => {
    vi.mocked(apiGet).mockResolvedValue([])
    await listEndorsementRequests("incoming")
    expect(apiGet).toHaveBeenCalledWith("/api/endorsement-requests?direction=incoming")
  })
})

describe("requestEndorsement", () => {
  it("posts the log and addressee identifiers", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    const result = await requestEndorsement("log-1", { userId: "user-1" })
    expect(apiPost).toHaveBeenCalledWith("/api/endorsement-requests", {
      logId: "log-1",
      addresseeUsername: undefined,
      addresseeId: "user-1",
    })
    expect(result).toEqual({ success: true })
  })

  it("maps a 422 to a not-trip-linked message", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("POST … failed: 422"))
    const result = await requestEndorsement("log-1", { userId: "user-1" })
    expect(result).toEqual({
      success: false,
      error: "This log isn't linked to a trip, so it can't be endorsed.",
    })
  })

  it("maps a 403 to a not-allowed message", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("POST … failed: 403"))
    const result = await requestEndorsement("log-1", { userId: "user-1" })
    expect(result).toEqual({
      success: false,
      error: "You can't ask this paddler to endorse this log.",
    })
  })
})

describe("deleteEndorsementRequest", () => {
  it("deletes by request id", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await deleteEndorsementRequest("req-1")
    expect(apiDelete).toHaveBeenCalledWith("/api/endorsement-requests/req-1")
  })
})
