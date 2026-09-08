import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/client"
import {
  addPackingItem,
  getPackingItems,
  removePackingItem,
  togglePackingItem,
} from "../personal-packing-actions"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiPatch: jest.fn(),
  apiDelete: jest.fn(),
}))

const mockApiGet = apiGet as jest.Mock
const mockApiPost = apiPost as jest.Mock
const mockApiPatch = apiPatch as jest.Mock
const mockApiDelete = apiDelete as jest.Mock

const VALID_ENTRY = { id: "01958f60-0000-7000-8000-000000000060", checked: false }

beforeEach(() => {
  mockApiGet.mockReset()
  mockApiPost.mockReset()
  mockApiPatch.mockReset()
  mockApiDelete.mockReset()
})

describe("getPackingItems", () => {
  it("hits GET /api/packing/trip/<tripId>", async () => {
    mockApiGet.mockResolvedValue([VALID_ENTRY])
    const items = await getPackingItems("trip-1")
    expect(mockApiGet).toHaveBeenCalledWith("/api/packing/trip/trip-1")
    expect(items).toHaveLength(1)
  })

  it("returns an empty list, not a throw, when the response isn't an array", async () => {
    mockApiGet.mockResolvedValue({ error: "unexpected" })
    await expect(getPackingItems("trip-1")).resolves.toEqual([])
  })
})

describe("addPackingItem", () => {
  it("posts to /api/packing/create with tripId and itemId", async () => {
    mockApiPost.mockResolvedValue(VALID_ENTRY)
    await addPackingItem("trip-1", "item-1")
    expect(mockApiPost).toHaveBeenCalledWith("/api/packing/create", {
      tripId: "trip-1",
      itemId: "item-1",
    })
  })
})

describe("togglePackingItem", () => {
  it("patches the checked flag", async () => {
    mockApiPatch.mockResolvedValue({ ...VALID_ENTRY, checked: true })
    await togglePackingItem("entry-1", true)
    expect(mockApiPatch).toHaveBeenCalledWith("/api/packing/entry-1", { checked: true })
  })
})

describe("removePackingItem", () => {
  it("deletes /api/packing/<id>", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    await removePackingItem("entry-1")
    expect(mockApiDelete).toHaveBeenCalledWith("/api/packing/entry-1")
  })
})
