import { apiDelete, apiGet, apiPost } from "../../api/client"
import {
  acceptConnection,
  listConnections,
  removeConnection,
  requestConnection,
  searchPaddlers,
} from "../actions"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiDelete: jest.fn(),
}))

const mockApiGet = apiGet as jest.Mock
const mockApiPost = apiPost as jest.Mock
const mockApiDelete = apiDelete as jest.Mock

const VALID_PADDLER = {
  id: "01958f60-0000-7000-8000-000000000010",
  username: "ada",
  name: "Ada",
  certifications: [],
  relationship: "none",
}
const VALID_PAGE = { items: [VALID_PADDLER], total: 1, page: 1, pages: 1 }
const VALID_CONNECTION = {
  id: "01958f60-0000-7000-8000-000000000020",
  status: "pending",
  requester: { username: "me", name: "Me" },
  addressee: { username: "ada", name: "Ada" },
}

beforeEach(() => {
  mockApiGet.mockReset()
  mockApiPost.mockReset()
  mockApiDelete.mockReset()
})

describe("searchPaddlers", () => {
  it("hits /api/user/search/paddlers with the term and default page", async () => {
    mockApiGet.mockResolvedValue(VALID_PAGE)
    await searchPaddlers("ada")
    expect(mockApiGet).toHaveBeenCalledWith("/api/user/search/paddlers?q=ada&page=1")
  })

  it("propagates a thrown network error unchanged", async () => {
    mockApiGet.mockRejectedValue(new Error("Network request failed"))
    await expect(searchPaddlers("ada")).rejects.toThrow("Network request failed")
  })

  it("throws at the Zod boundary when a result is missing a required field", async () => {
    mockApiGet.mockResolvedValue({ items: [{ username: "ada" }], total: 1, page: 1, pages: 1 })
    await expect(searchPaddlers("ada")).rejects.toThrow()
  })
})

describe("listConnections", () => {
  it("hits /api/connections with no filter by default", async () => {
    mockApiGet.mockResolvedValue([VALID_CONNECTION])
    await listConnections()
    expect(mockApiGet).toHaveBeenCalledWith("/api/connections")
  })

  it("appends the status filter when given", async () => {
    mockApiGet.mockResolvedValue([VALID_CONNECTION])
    await listConnections("pending")
    expect(mockApiGet).toHaveBeenCalledWith("/api/connections?status=pending")
  })

  it("returns an empty list, not a throw, when the response isn't an array", async () => {
    mockApiGet.mockResolvedValue({ error: "unexpected" })
    await expect(listConnections()).resolves.toEqual([])
  })
})

describe("requestConnection", () => {
  it("posts to /api/connections/request with the target", async () => {
    mockApiPost.mockResolvedValue(VALID_CONNECTION)
    await requestConnection({ username: "ada" })
    expect(mockApiPost).toHaveBeenCalledWith("/api/connections/request", {
      addresseeUsername: "ada",
      addresseeId: undefined,
    })
  })

  it("propagates a thrown 409 (already connected) error unchanged", async () => {
    mockApiPost.mockRejectedValue(new Error("A connection already exists with this paddler"))
    await expect(requestConnection({ username: "ada" })).rejects.toThrow("already exists")
  })
})

describe("acceptConnection", () => {
  it("posts to /api/connections/<id>/accept", async () => {
    mockApiPost.mockResolvedValue({ ...VALID_CONNECTION, status: "accepted" })
    await acceptConnection("conn-1")
    expect(mockApiPost).toHaveBeenCalledWith("/api/connections/conn-1/accept", {})
  })
})

describe("removeConnection", () => {
  it("deletes /api/connections/<id> — covers both decline and unfriend", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    await removeConnection("conn-1")
    expect(mockApiDelete).toHaveBeenCalledWith("/api/connections/conn-1")
  })
})
