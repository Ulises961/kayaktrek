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
import { listBlocks, blockPaddler, unblockPaddler } from "../actions"

beforeEach(() => vi.clearAllMocks())

describe("listBlocks", () => {
  it("returns the blocks list on success", async () => {
    const blocks = [
      {
        id: "01952f1a-0000-7000-8000-000000000001",
        created: "2026-08-01T00:00:00Z",
        blocked: {
          id: "01952f1a-0000-7000-8000-000000000002",
          username: "seapaddler",
          name: "Maren",
          surname: "Vik",
          avatarUrl: null,
        },
      },
    ]
    vi.mocked(apiGet).mockResolvedValue(blocks)
    const result = await listBlocks()
    expect(result).toEqual(blocks)
    expect(apiGet).toHaveBeenCalledWith("/api/blocks")
  })

  it("returns an empty list when the request fails", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("boom"))
    expect(await listBlocks()).toEqual([])
  })

  it("returns an empty list when the response is not an array", async () => {
    vi.mocked(apiGet).mockResolvedValue(null)
    expect(await listBlocks()).toEqual([])
  })
})

describe("blockPaddler", () => {
  it("posts the blocked identifiers and revalidates", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    const result = await blockPaddler({ userId: "abc" })
    expect(apiPost).toHaveBeenCalledWith("/api/blocks", {
      blockedUsername: undefined,
      blockedId: "abc",
    })
    expect(revalidatePath).toHaveBeenCalledWith("/paddlers")
    expect(result).toEqual({ success: true })
  })

  it("maps a 409 to an already-blocked message", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("POST … failed: 409"))
    const result = await blockPaddler({ username: "bob" })
    expect(result).toEqual({ success: false, error: "You have already blocked this paddler." })
  })

  it("maps a 404 to a not-found message", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("POST … failed: 404"))
    const result = await blockPaddler({ username: "ghost" })
    expect(result).toEqual({ success: false, error: "That paddler could not be found." })
  })

  it("returns a generic error for other failures", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("Internal Server Error"))
    const result = await blockPaddler({ userId: "abc" })
    expect(result).toEqual({ success: false, error: "Failed to block paddler." })
  })
})

describe("unblockPaddler", () => {
  it("deletes by block id and revalidates", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    const result = await unblockPaddler("xyz")
    expect(apiDelete).toHaveBeenCalledWith("/api/blocks/xyz")
    expect(revalidatePath).toHaveBeenCalledWith("/paddlers")
    expect(result).toEqual({ success: true })
  })

  it("returns an error on failure", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("404 Not Found"))
    const result = await unblockPaddler("xyz")
    expect(result).toEqual({ success: false, error: "Failed to unblock paddler." })
  })
})
