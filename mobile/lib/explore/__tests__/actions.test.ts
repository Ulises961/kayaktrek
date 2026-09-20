import { apiGet } from "../../api/client"
import { fetchPublicItineraryDetail, searchPublicItineraries } from "../actions"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
}))

const mockApiGet = apiGet as jest.Mock

const anItem = {
  id: "itin-1",
  name: "Skye circuit",
  dayCount: 3,
  previewPositions: [
    [57.2, -6.3],
    [57.3, -6.1],
  ],
}

beforeEach(() => {
  mockApiGet.mockReset()
})

describe("searchPublicItineraries", () => {
  it("calls the explore endpoint with no query when nothing is filtered", async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 })

    await searchPublicItineraries({})

    // No trailing "?" — an empty query string must not produce one.
    expect(mockApiGet).toHaveBeenCalledWith("/api/itinerary/explore")
  })

  it("passes the filters through as the shared query string", async () => {
    mockApiGet.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 })

    await searchPublicItineraries({ name: "skye", page: 2 })

    expect(mockApiGet).toHaveBeenCalledWith("/api/itinerary/explore?name=skye&page=2")
  })

  it("parses the response through the shared schema", async () => {
    mockApiGet.mockResolvedValue({ items: [anItem], total: 1, page: 1, pages: 1 })

    const page = await searchPublicItineraries({})

    expect(page.items).toHaveLength(1)
    expect(page.items[0].name).toBe("Skye circuit")
    expect(page.items[0].previewPositions).toEqual(anItem.previewPositions)
  })

  it("fills in the schema's defaults when the backend omits them", async () => {
    // An item with neither dayCount nor previewPositions must still render a card
    // rather than crashing on `positions.length`.
    mockApiGet.mockResolvedValue({ items: [{ id: "itin-2" }] })

    const page = await searchPublicItineraries({})

    expect(page.items[0].dayCount).toBe(0)
    expect(page.items[0].previewPositions).toEqual([])
    expect(page.total).toBe(0)
    expect(page.pages).toBe(1)
  })

  it("throws when the payload does not match the schema", async () => {
    // Deliberately unlike web's server action, which swallows every failure into an
    // empty page. On mobile an empty list and a broken response must look different:
    // the screen's own catch renders a retryable error, and "no routes published yet"
    // is a real, different answer.
    mockApiGet.mockResolvedValue({ items: "not-an-array" })

    await expect(searchPublicItineraries({})).rejects.toThrow()
  })

  it("propagates a transport error unchanged so the screen can show the offline message", async () => {
    mockApiGet.mockRejectedValue(new Error("Could not reach the server. Please check your connection and try again."))

    await expect(searchPublicItineraries({})).rejects.toThrow("Could not reach the server")
  })
})

describe("fetchPublicItineraryDetail", () => {
  it("calls the public detail endpoint for the given route", async () => {
    mockApiGet.mockResolvedValue({ id: "itin-1", days: [] })

    await fetchPublicItineraryDetail("itin-1")

    expect(mockApiGet).toHaveBeenCalledWith("/api/itinerary/itin-1/public")
  })

  it("throws when the payload does not match the schema", async () => {
    mockApiGet.mockResolvedValue({ days: "not-an-array" })

    await expect(fetchPublicItineraryDetail("itin-1")).rejects.toThrow()
  })
})
