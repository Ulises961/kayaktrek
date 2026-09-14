import { fireEvent, render, waitFor } from "@testing-library/react-native"

import TripListScreen from "../app/(app)/(drawer)/(trips)/index"
import { getTrips } from "../lib/trips/actions"
import { loadTripListCache, saveTripListCache } from "../lib/db/trip-list-cache"

jest.mock("../lib/trips/actions", () => ({
  getTrips: jest.fn(),
}))

// database.ts eagerly constructs a native SQLiteAdapter at import time — never
// usable under Jest (see lib/db/__tests__/sync.test.ts for the same pattern).
// Needed here because trip-list-cache's mock below pulls in the real module
// via requireActual (for toTripCardData), which still imports database.ts.
jest.mock("../lib/db/database", () => ({ database: {} }))

jest.mock("../lib/db/trip-list-cache", () => {
  const actual = jest.requireActual("../lib/db/trip-list-cache")
  return {
    ...actual,
    saveTripListCache: jest.fn().mockResolvedValue(undefined),
    loadTripListCache: jest.fn().mockResolvedValue([]),
  }
})

const mockGetTrips = getTrips as jest.Mock
const mockSaveTripListCache = saveTripListCache as jest.Mock
const mockLoadTripListCache = loadTripListCache as jest.Mock

describe("TripListScreen", () => {
  beforeEach(() => {
    mockGetTrips.mockReset()
    mockSaveTripListCache.mockReset().mockResolvedValue(undefined)
    mockLoadTripListCache.mockReset().mockResolvedValue([])
  })

  it("renders each trip's destination once the fetch resolves, and caches the result", async () => {
    mockGetTrips.mockResolvedValue({
      items: [
        { id: "t1", destination: "Costa Brava", state: "building", dateFrom: null, dateTo: null },
        { id: "t2", destination: "Anglesey", state: "past", dateFrom: null, dateTo: null },
      ],
      total: 2,
      page: 1,
      pages: 1,
    })

    const { findByText } = await render(<TripListScreen />)

    expect(await findByText("Costa Brava")).toBeTruthy()
    expect(await findByText("Anglesey")).toBeTruthy()
    await waitFor(() => expect(mockSaveTripListCache).toHaveBeenCalled())
  })

  it("shows an empty state, not a blank list, when there are no trips", async () => {
    mockGetTrips.mockResolvedValue({ items: [], total: 0, page: 1, pages: 0 })

    const { findByText } = await render(<TripListScreen />)

    expect(await findByText("No trips yet")).toBeTruthy()
  })

  it("surfaces the thrown error message and offers a retry that re-fetches, when there is no cache to fall back to", async () => {
    mockGetTrips.mockRejectedValueOnce(new Error("Could not reach the server."))
    mockGetTrips.mockResolvedValueOnce({ items: [], total: 0, page: 1, pages: 0 })

    const { findByText, getByText } = await render(<TripListScreen />)

    expect(await findByText("Could not reach the server.")).toBeTruthy()

    await fireEvent.press(getByText("Try again"))

    await waitFor(() => {
      expect(mockGetTrips).toHaveBeenCalledTimes(2)
    })
  })

  it("falls back to the cached trip list, with an offline notice, when the fetch fails", async () => {
    mockGetTrips.mockRejectedValue(new Error("Network request failed"))
    mockLoadTripListCache.mockResolvedValue([
      { id: "t1", destination: "Cached Fjord", state: "building", dateFrom: null, dateTo: null, travellerCount: 1 },
    ])

    const { findByText } = await render(<TripListScreen />)

    expect(await findByText("Cached Fjord")).toBeTruthy()
    expect(await findByText("Offline — showing your last synced trips")).toBeTruthy()
  })
})
