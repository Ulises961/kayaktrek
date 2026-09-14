import { render, waitFor } from "@testing-library/react-native"

import FloatPlanScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/float-plan"
import { getLogistics, getTrip } from "../lib/trips/actions"
import { loadOfflineCrew } from "../lib/db/offline-float-plan"
import { loadTripListCache } from "../lib/db/trip-list-cache"

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "trip-1" }),
  Stack: { Screen: () => null },
}))

jest.mock("../lib/trips/actions", () => ({
  getTrip: jest.fn(),
  getLogistics: jest.fn(),
}))

jest.mock("../lib/db/offline-float-plan", () => ({
  loadOfflineCrew: jest.fn(),
}))

jest.mock("../lib/db/trip-list-cache", () => ({
  loadTripListCache: jest.fn(),
}))

const mockGetTrip = getTrip as jest.Mock
const mockGetLogistics = getLogistics as jest.Mock
const mockLoadOfflineCrew = loadOfflineCrew as jest.Mock
const mockLoadTripListCache = loadTripListCache as jest.Mock

describe("FloatPlanScreen", () => {
  beforeEach(() => {
    mockGetTrip.mockReset()
    mockGetLogistics.mockReset().mockResolvedValue({})
    mockLoadOfflineCrew.mockReset().mockResolvedValue([])
    mockLoadTripListCache.mockReset().mockResolvedValue([])
  })

  it("renders the crew manifest and shore contact once the fetch resolves", async () => {
    mockGetTrip.mockResolvedValue({
      state: "building",
      travellers: [
        { id: "m1", role: "leader", user: { name: "Sam", surname: "Lee" }, vesselMake: "Valley" },
      ],
    })
    mockGetLogistics.mockResolvedValue({ shoreContactName: "Jo Shore" })

    const { findByText } = await render(<FloatPlanScreen />)

    expect(await findByText("Sam Lee")).toBeTruthy()
    expect(await findByText("Jo Shore")).toBeTruthy()
  })

  it("falls back to the cached crew manifest offline, and says shore contact needs a connection", async () => {
    mockGetTrip.mockRejectedValue(new Error("Network request failed"))
    mockLoadOfflineCrew.mockResolvedValue([
      { id: "m1", role: "leader", user: { name: "Cached", surname: "Paddler" }, vesselMake: "P&H" },
    ])
    mockLoadTripListCache.mockResolvedValue([{ id: "trip-1", state: "happening" }])

    const { findByText } = await render(<FloatPlanScreen />)

    expect(await findByText("Cached Paddler")).toBeTruthy()
    expect(await findByText("Shore contact needs a connection.")).toBeTruthy()
    expect(await findByText(/Offline/)).toBeTruthy()
  })

  it("surfaces the error when there is nothing cached to fall back to", async () => {
    mockGetTrip.mockRejectedValue(new Error("Could not reach the server."))

    const { findByText } = await render(<FloatPlanScreen />)

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })

  it("does not surface an error while the cache is loading", async () => {
    mockGetTrip.mockRejectedValue(new Error("offline"))
    mockLoadOfflineCrew.mockResolvedValue([
      { id: "m1", role: "crew", user: { name: "A", surname: "B" } },
    ])

    const { findByText } = await render(<FloatPlanScreen />)
    await waitFor(() => expect(mockLoadOfflineCrew).toHaveBeenCalledWith("trip-1"))
    expect(await findByText("A B")).toBeTruthy()
  })
})
