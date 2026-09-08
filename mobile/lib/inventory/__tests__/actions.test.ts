import { apiDelete, apiGet, apiPost } from "../../api/client"
import {
  addRequirement,
  contributeItem,
  getMyItems,
  removeRequirement,
  unclaimRequirement,
} from "../actions"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiDelete: jest.fn(),
}))

const mockApiGet = apiGet as jest.Mock
const mockApiPost = apiPost as jest.Mock
const mockApiDelete = apiDelete as jest.Mock

const VALID_REQUIREMENT = { id: "01958f60-0000-7000-8000-000000000040", name: "First aid kit" }
const VALID_ITEM = { id: "01958f60-0000-7000-8000-000000000050", name: "Spare paddle" }

beforeEach(() => {
  mockApiGet.mockReset()
  mockApiPost.mockReset()
  mockApiDelete.mockReset()
})

describe("getMyItems", () => {
  it("hits GET /api/item/all", async () => {
    mockApiGet.mockResolvedValue([VALID_ITEM])
    const items = await getMyItems()
    expect(mockApiGet).toHaveBeenCalledWith("/api/item/all")
    expect(items).toHaveLength(1)
  })

  it("throws at the Zod boundary when an item is missing a required field", async () => {
    mockApiGet.mockResolvedValue([{ id: "x" }])
    await expect(getMyItems()).rejects.toThrow()
  })
})

describe("addRequirement", () => {
  it("posts to /api/inventory/<id>/requirements with name and category", async () => {
    mockApiPost.mockResolvedValue(VALID_REQUIREMENT)
    await addRequirement("inv-1", { name: "First aid kit", category: "Safety" })
    expect(mockApiPost).toHaveBeenCalledWith("/api/inventory/inv-1/requirements", {
      name: "First aid kit",
      category: "Safety",
    })
  })

  it("propagates a thrown error unchanged", async () => {
    mockApiPost.mockRejectedValue(new Error("Network request failed"))
    await expect(addRequirement("inv-1", { name: "x" })).rejects.toThrow(
      "Network request failed",
    )
  })
})

describe("removeRequirement", () => {
  it("deletes /api/inventory/<id>/requirements/<reqId>", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    await removeRequirement("inv-1", "req-1")
    expect(mockApiDelete).toHaveBeenCalledWith("/api/inventory/inv-1/requirements/req-1")
  })
})

describe("contributeItem", () => {
  it("posts the itemId to the contribute endpoint", async () => {
    mockApiPost.mockResolvedValue(VALID_REQUIREMENT)
    await contributeItem("inv-1", "req-1", "item-1")
    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/inventory/inv-1/requirements/req-1/contribute",
      { itemId: "item-1" },
    )
  })

  it("propagates a thrown 400 (item can't cover this requirement) error unchanged", async () => {
    mockApiPost.mockRejectedValue(new Error("itemId is required"))
    await expect(contributeItem("inv-1", "req-1", "")).rejects.toThrow("itemId is required")
  })
})

describe("unclaimRequirement", () => {
  it("deletes the contribute endpoint to withdraw", async () => {
    mockApiDelete.mockResolvedValue(undefined)
    await unclaimRequirement("inv-1", "req-1")
    expect(mockApiDelete).toHaveBeenCalledWith(
      "/api/inventory/inv-1/requirements/req-1/contribute",
    )
  })
})
