import { apiDelete, apiGet, apiPost } from "../../api/client"
import { blockPaddler, listBlocks, unblockPaddler } from "../actions"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiDelete: jest.fn(),
}))

const mockApiGet = apiGet as jest.Mock
const mockApiPost = apiPost as jest.Mock
const mockApiDelete = apiDelete as jest.Mock

const VALID_BLOCK = {
  id: "01958f60-0000-7000-8000-000000000030",
  blocked: { username: "troll", name: "Troll" },
}

beforeEach(() => {
  mockApiGet.mockReset()
  mockApiPost.mockReset()
  mockApiDelete.mockReset()
})

describe("listBlocks", () => {
  it("hits GET /api/blocks", async () => {
    mockApiGet.mockResolvedValue([VALID_BLOCK])
    const blocks = await listBlocks()
    expect(mockApiGet).toHaveBeenCalledWith("/api/blocks")
    expect(blocks).toHaveLength(1)
  })

  it("returns an empty list, not a throw, when the response isn't an array", async () => {
    mockApiGet.mockResolvedValue({ error: "unexpected" })
    await expect(listBlocks()).resolves.toEqual([])
  })

  it("throws at the Zod boundary when an item is malformed", async () => {
    mockApiGet.mockResolvedValue([{ id: "x" }])
    await expect(listBlocks()).rejects.toThrow()
  })
})

describe("blockPaddler", () => {
  it("posts to /api/blocks with the target", async () => {
    mockApiPost.mockResolvedValue(VALID_BLOCK)
    await blockPaddler({ username: "troll" })
    expect(mockApiPost).toHaveBeenCalledWith("/api/blocks", {
      blockedUsername: "troll",
      blockedId: undefined,
    })
  })

  it("propagates a thrown 409 (already blocked) error unchanged", async () => {
    mockApiPost.mockRejectedValue(new Error("You have already blocked this paddler."))
    await expect(blockPaddler({ username: "troll" })).rejects.toThrow("already blocked")
  })
})

describe("unblockPaddler", () => {
  it("deletes /api/blocks/<id>", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    await unblockPaddler("block-1")
    expect(mockApiDelete).toHaveBeenCalledWith("/api/blocks/block-1")
  })
})
