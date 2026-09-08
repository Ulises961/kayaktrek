import { apiDelete, apiGet } from "../../api/client"
import { deleteEndorsementRequest, listEndorsementRequests } from "../actions"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
  apiDelete: jest.fn(),
}))

const mockApiGet = apiGet as jest.Mock
const mockApiDelete = apiDelete as jest.Mock

const VALID_REQUEST = {
  id: "01958f60-0000-7000-8000-000000000002",
  status: "pending",
  requester: { id: "01958f60-0000-7000-8000-000000000003", username: "ada", name: "Ada" },
  addressee: { id: "01958f60-0000-7000-8000-000000000004", username: "me", name: "Me" },
  log: { id: "01958f60-0000-7000-8000-000000000005", date: "2026-06-01" },
}

beforeEach(() => {
  mockApiGet.mockReset()
  mockApiDelete.mockReset()
})

describe("listEndorsementRequests", () => {
  it("defaults to direction=incoming", async () => {
    mockApiGet.mockResolvedValue([VALID_REQUEST])
    const requests = await listEndorsementRequests()
    expect(mockApiGet).toHaveBeenCalledWith("/api/endorsement-requests?direction=incoming")
    expect(requests).toHaveLength(1)
  })

  it("returns an empty list, not a throw, when the response isn't an array", async () => {
    mockApiGet.mockResolvedValue({ error: "unexpected" })
    await expect(listEndorsementRequests()).resolves.toEqual([])
  })

  it("throws at the Zod boundary when an item in the array is malformed", async () => {
    mockApiGet.mockResolvedValue([{ status: "pending" }])
    await expect(listEndorsementRequests()).rejects.toThrow()
  })

  it("propagates a thrown network error unchanged", async () => {
    mockApiGet.mockRejectedValue(new Error("Network request failed"))
    await expect(listEndorsementRequests()).rejects.toThrow("Network request failed")
  })
})

describe("deleteEndorsementRequest", () => {
  it("deletes /api/endorsement-requests/<id>", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    await deleteEndorsementRequest("req-1")
    expect(mockApiDelete).toHaveBeenCalledWith("/api/endorsement-requests/req-1")
  })
})
