import { apiGet } from "../../api/client"
import { fetchWaveVectors, fetchWindVectors } from "../velocity"

jest.mock("../../api/client", () => ({
  apiGet: jest.fn(),
}))

const mockApiGet = apiGet as jest.Mock

const header = {
  parameterUnit: "m.s-1",
  la1: 54.2,
  la2: 54.0,
  lo1: -4.6,
  lo2: -4.4,
  nx: 2,
  ny: 2,
  dx: 0.2,
  dy: 0.2,
}

function gridResponse(source: string, east: (number | null)[], north: (number | null)[]) {
  return {
    source,
    grid: [
      { header: { ...header, parameterCategory: 2, parameterNumber: 2, parameterNumberName: "eastward_component" }, data: east },
      { header: { ...header, parameterCategory: 2, parameterNumber: 3, parameterNumberName: "northward_component" }, data: north },
    ],
  }
}

beforeEach(() => {
  mockApiGet.mockReset()
})

describe.each([
  ["fetchWindVectors", fetchWindVectors, "wind-vectors", "weather"],
  ["fetchWaveVectors", fetchWaveVectors, "wave-vectors", "marine"],
])("%s", (_name, fetchVectors, endpoint, source) => {
  it("requests the day's grid for the chosen hour", async () => {
    mockApiGet.mockResolvedValue(gridResponse(source, [1, 1, 1, 1], [2, 2, 2, 2]))

    await fetchVectors("day-1", 14)

    expect(mockApiGet).toHaveBeenCalledWith(`/api/day/day-1/${endpoint}?hour=14`)
  })

  it("returns the east and north layers, keeping masked cells as null", async () => {
    mockApiGet.mockResolvedValue(gridResponse(source, [1, null, 1, 1], [2, null, 2, 2]))

    const field = await fetchVectors("day-1", 12)

    expect(field).not.toBeNull()
    expect(field?.u).toEqual([1, null, 1, 1])
    expect(field?.v).toEqual([2, null, 2, 2])
    expect(field).toMatchObject({ nx: 2, ny: 2, north: 54.2, south: 54.0, west: -4.6, east: -4.4 })
  })

  it("returns null, not an error, when the day has no data (empty grid)", async () => {
    mockApiGet.mockResolvedValue({ source, grid: [] })

    await expect(fetchVectors("day-1", 12)).resolves.toBeNull()
  })

  it("rejects when the request fails, so the caller can decide what to show", async () => {
    mockApiGet.mockRejectedValue(new Error("Network request failed"))

    await expect(fetchVectors("day-1", 12)).rejects.toThrow("Network request failed")
  })

  it("rejects a response that does not match the grid contract", async () => {
    mockApiGet.mockResolvedValue({ source, grid: [{ header: { nx: "wide" }, data: "no" }] })

    await expect(fetchVectors("day-1", 12)).rejects.toThrow()
  })

  it("rejects a grid whose layers are not the east and north components", async () => {
    const response = gridResponse(source, [1, 1, 1, 1], [2, 2, 2, 2])
    response.grid = [response.grid[0]]
    mockApiGet.mockResolvedValue(response)

    await expect(fetchVectors("day-1", 12)).rejects.toThrow()
  })

  it("rejects a grid whose data length does not match nx * ny", async () => {
    mockApiGet.mockResolvedValue(gridResponse(source, [1, 1], [2, 2]))

    await expect(fetchVectors("day-1", 12)).rejects.toThrow()
  })
})
