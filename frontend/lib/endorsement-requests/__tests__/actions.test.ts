import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiDelete } from "@/lib/api/client"
import { listEndorsementRequests, requestEndorsement, deleteEndorsementRequest } from "../actions"

beforeEach(() => vi.clearAllMocks())

const REQUEST_FIXTURE = {
  id: "01952f1a-0000-7000-8000-000000000001",
  status: "pending" as const,
  created: "2026-08-01T00:00:00Z",
  respondedAt: null,
  requester: {
    id: "01952f1a-0000-7000-8000-000000000002",
    username: "paddler1",
    name: "Person",
    surname: "One",
    avatarUrl: null,
  },
  addressee: {
    id: "01952f1a-0000-7000-8000-000000000003",
    username: "paddler2",
    name: "Person",
    surname: "Two",
    avatarUrl: null,
  },
  log: {
    id: "01952f1a-0000-7000-8000-000000000004",
    date: "2026-08-01",
    distance: 10.5,
    hours: 2,
    tripId: "01952f1a-0000-7000-8000-000000000005",
  },
}

describe("listEndorsementRequests", () => {
  it("queries the requested direction and returns parsed requests", async () => {
    const requests = [REQUEST_FIXTURE]
    vi.mocked(apiGet).mockResolvedValue(requests)
    const result = await listEndorsementRequests("incoming")
    expect(apiGet).toHaveBeenCalledWith("/api/endorsement-requests?direction=incoming")
    expect(result).toEqual(requests)
  })

  it("returns empty array on error", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("boom"))
    const result = await listEndorsementRequests("incoming")
    expect(result).toEqual([])
  })

  it("returns empty array when response is not an array", async () => {
    vi.mocked(apiGet).mockResolvedValue(null)
    const result = await listEndorsementRequests("incoming")
    expect(result).toEqual([])
  })
})

describe("requestEndorsement", () => {
  it("posts the log and addressee identifiers and revalidates", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    const result = await requestEndorsement("log-1", { userId: "user-1" })
    expect(apiPost).toHaveBeenCalledWith("/api/endorsement-requests", {
      logId: "log-1",
      addresseeUsername: undefined,
      addresseeId: "user-1",
    })
    expect(revalidatePath).toHaveBeenCalledWith("/logs")
    expect(result).toEqual({ success: true })
  })

  it("maps a 409 to an already-endorsed message", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("POST … failed: 409"))
    const result = await requestEndorsement("log-1", { userId: "user-1" })
    expect(result).toEqual({
      success: false,
      error: "You've already asked this paddler, or they've endorsed it.",
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

  it("maps a 422 to a not-trip-linked message", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("POST … failed: 422"))
    const result = await requestEndorsement("log-1", { userId: "user-1" })
    expect(result).toEqual({
      success: false,
      error: "This log isn't linked to a trip, so it can't be endorsed.",
    })
  })

  it("returns a generic error for other failures", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("Internal Server Error"))
    const result = await requestEndorsement("log-1", { userId: "user-1" })
    expect(result).toEqual({
      success: false,
      error: "Failed to send endorsement request.",
    })
  })
})

describe("deleteEndorsementRequest", () => {
  it("deletes by request id and revalidates", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    const result = await deleteEndorsementRequest("req-1")
    expect(apiDelete).toHaveBeenCalledWith("/api/endorsement-requests/req-1")
    expect(revalidatePath).toHaveBeenCalledWith("/logs")
    expect(result).toEqual({ success: true })
  })

  it("returns an error on failure", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("Not found"))
    const result = await deleteEndorsementRequest("req-1")
    expect(result).toEqual({ success: false, error: "Failed to remove endorsement request." })
  })
})
