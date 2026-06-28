import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  isRedirectError: vi.fn().mockReturnValue(false),
}))

import { apiGet, apiPost, apiDelete } from "@/lib/api/client"
import { listBlocks, blockPaddler, unblockPaddler } from "../actions"

beforeEach(() => vi.clearAllMocks())

describe("listBlocks", () => {
  it("returns an empty list when the request fails", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("boom"))
    expect(await listBlocks()).toEqual([])
  })
})

describe("blockPaddler", () => {
  it("posts the blocked identifiers", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    const result = await blockPaddler({ userId: "abc" })
    expect(apiPost).toHaveBeenCalledWith("/api/blocks", {
      blockedUsername: undefined,
      blockedId: "abc",
    })
    expect(result).toEqual({ success: true })
  })

  it("maps a 409 to an already-blocked message", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("POST … failed: 409"))
    const result = await blockPaddler({ username: "bob" })
    expect(result).toEqual({ success: false, error: "You have already blocked this paddler." })
  })
})

describe("unblockPaddler", () => {
  it("deletes by block id", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await unblockPaddler("xyz")
    expect(apiDelete).toHaveBeenCalledWith("/api/blocks/xyz")
  })
})
