import { render, waitFor } from "@testing-library/react-native"

import TripDetailScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/index"
import { startSyncTrigger } from "../lib/db/sync-trigger"
import { loadTripListCache } from "../lib/db/trip-list-cache"
import { getTrip } from "../lib/trips/actions"

jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useLocalSearchParams: () => ({ id: "trip-1" }),
  }
})
jest.mock("../lib/trips/actions", () => ({
  getTrip: jest.fn(),
}))
jest.mock("../lib/db/sync-trigger", () => ({
  startSyncTrigger: jest.fn(),
}))
jest.mock("../lib/db/trip-list-cache", () => ({
  loadTripListCache: jest.fn(),
}))

// M9c WP7: every offline branch below now reads how old its cache is. The real
// lookup needs a database; the age itself is asserted as a relative offset so
// the expectation can't rot into an absolute date as the suite gets older.
jest.mock("../lib/db/cache-freshness", () => ({
  ...jest.requireActual("../lib/db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
}))

const mockGetTrip = getTrip as jest.Mock
const mockStartSyncTrigger = startSyncTrigger as jest.Mock
const mockLoadTripListCache = loadTripListCache as jest.Mock

beforeEach(() => {
  mockGetTrip.mockReset()
  mockStartSyncTrigger.mockReset()
  mockStartSyncTrigger.mockReturnValue(jest.fn())
  mockLoadTripListCache.mockReset()
  mockLoadTripListCache.mockResolvedValue([])
})

describe("TripDetailScreen", () => {
  it("shows the trip's destination and state once loaded", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", destination: "Costa Brava", state: "building" })

    const { findByText } = await render(<TripDetailScreen />)

    expect(await findByText("Costa Brava")).toBeTruthy()
  })

  it("shows trip metadata inline in the identity card, not behind a Details link", async () => {
    mockGetTrip.mockResolvedValue({
      id: "trip-1",
      destination: "Costa Brava",
      state: "building",
      difficulty: "moderate",
      dateFrom: "2026-06-10",
      dateTo: "2026-06-14",
      description: "A relaxed week along the coast.",
    })

    const { findByText, getByText, queryByText } = await render(<TripDetailScreen />)
    await findByText("Costa Brava")

    expect(getByText("Moderate")).toBeTruthy()
    expect(getByText("A relaxed week along the coast.")).toBeTruthy()
    // Web has no "Details" tab either — this is the identity card, not a link out.
    expect(queryByText("Details")).toBeNull()
  })

  it("links to every remaining hub destination at web parity (M30 WP2)", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", destination: "Costa Brava", state: "building" })

    const { findByText, getByText } = await render(<TripDetailScreen />)
    await findByText("Costa Brava")

    expect(getByText("Itinerary")).toBeTruthy()
    expect(getByText("Crew")).toBeTruthy()
    expect(getByText("Logistics")).toBeTruthy()
    expect(getByText("Float plan")).toBeTruthy()
    expect(getByText("Items")).toBeTruthy()
  })

  it("surfaces a thrown error when the cache has nothing for this trip either", async () => {
    mockGetTrip.mockRejectedValue(new Error("Could not reach the server."))
    mockLoadTripListCache.mockResolvedValue([])

    const { findByText } = await render(<TripDetailScreen />)

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })

  // The hub is the only route to Itinerary/Crew/Logistics/Float plan/Items, so an
  // error screen here strands every cache those screens already have. Before this
  // fallback existed, going offline turned the whole trip into a dead end.
  describe("offline", () => {
    const cachedTrip = {
      id: "trip-1",
      destination: "Costa Brava",
      state: "building",
      dateFrom: "2026-06-10",
      dateTo: "2026-06-14",
      travellerCount: 3,
    }

    beforeEach(() => {
      mockGetTrip.mockRejectedValue(new Error("Could not reach the server."))
      mockLoadTripListCache.mockResolvedValue([
        { id: "trip-other", destination: "Elsewhere", state: "past", dateFrom: null, dateTo: null, travellerCount: 1 },
        cachedTrip,
      ])
    })

    it("falls back to this trip's cached summary instead of an error screen", async () => {
      const { findByText, queryByText } = await render(<TripDetailScreen />)

      expect(await findByText("Costa Brava")).toBeTruthy()
      expect(queryByText("Could not reach the server.")).toBeNull()
      expect(queryByText("Elsewhere")).toBeNull()
    })

    it("keeps every hub destination reachable", async () => {
      const { findByText, getByText } = await render(<TripDetailScreen />)
      await findByText("Costa Brava")

      expect(getByText("Itinerary")).toBeTruthy()
      expect(getByText("Crew")).toBeTruthy()
      expect(getByText("Logistics")).toBeTruthy()
      expect(getByText("Float plan")).toBeTruthy()
      expect(getByText("Items")).toBeTruthy()
    })

    it("says the data is cached rather than presenting it as live", async () => {
      const { findByText } = await render(<TripDetailScreen />)

      expect(await findByText(/Offline — showing your last synced trip/)).toBeTruthy()
      expect(await findByText(/Updated 2 days ago/)).toBeTruthy()
    })

    it("omits difficulty and description, which the trip-list cache does not carry", async () => {
      const { findByText, queryByText } = await render(<TripDetailScreen />)
      await findByText("Costa Brava")

      expect(queryByText("Difficulty")).toBeNull()
      expect(queryByText("Description")).toBeNull()
    })
  })

  it("starts the sync-down trigger for this trip so weather/sea/crew/inventory populate offline caches", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", destination: "Costa Brava", state: "building" })

    const { findByText } = await render(<TripDetailScreen />)
    await findByText("Costa Brava")

    expect(mockStartSyncTrigger).toHaveBeenCalledWith("trip-1")
  })

  it("stops the sync-down trigger on unmount", async () => {
    const stop = jest.fn()
    mockStartSyncTrigger.mockReturnValue(stop)
    mockGetTrip.mockResolvedValue({ id: "trip-1", destination: "Costa Brava", state: "building" })

    const { findByText, unmount } = await render(<TripDetailScreen />)
    await findByText("Costa Brava")
    unmount()

    await waitFor(() => expect(stop).toHaveBeenCalled())
  })
})
