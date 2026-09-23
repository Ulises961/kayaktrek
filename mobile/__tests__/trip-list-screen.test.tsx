import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"

import { TRIP_STATE } from "@shared/dtos/trip"

import TripListScreen from "../app/(app)/(drawer)/(trips)/index"
import { getTrips } from "../lib/trips/actions"
import { loadTripListCache, saveTripListCache } from "../lib/db/trip-list-cache"

jest.mock("../lib/trips/actions", () => ({
  getTrips: jest.fn(),
}))

// M9c WP7: every offline branch below now reads how old its cache is. The real
// lookup needs a database; the age itself is asserted as a relative offset so
// the expectation can't rot into an absolute date as the suite gets older.
jest.mock("../lib/db/cache-freshness", () => ({
  ...jest.requireActual("../lib/db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
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

    const { findByText } = await render(<TripListScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Costa Brava")).toBeTruthy()
    expect(await findByText("Anglesey")).toBeTruthy()
    await waitFor(() => expect(mockSaveTripListCache).toHaveBeenCalled())
  })

  it("shows an empty state, not a blank list, when there are no trips", async () => {
    mockGetTrips.mockResolvedValue({ items: [], total: 0, page: 1, pages: 0 })

    const { findByText } = await render(<TripListScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("No trips yet")).toBeTruthy()
  })

  it("surfaces the thrown error message and offers a retry that re-fetches, when there is no cache to fall back to", async () => {
    mockGetTrips.mockRejectedValueOnce(new Error("Could not reach the server."))
    mockGetTrips.mockResolvedValueOnce({ items: [], total: 0, page: 1, pages: 0 })

    const { findByText, getByText } = await render(<TripListScreen />, { wrapper: WithCachedSurfaces })

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

    const { findByText } = await render(<TripListScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Cached Fjord")).toBeTruthy()
    expect(await findByText(/Can't reach the server\./)).toBeTruthy()
  })

  // M9c WP7: "offline" alone never said whether the list was from an hour ago
  // or from last month, which is the difference between usable and misleading.
  it("says how old the cached list is, not just that it is cached", async () => {
    mockGetTrips.mockRejectedValue(new Error("Network request failed"))
    mockLoadTripListCache.mockResolvedValue([
      { id: "t1", destination: "Cached Fjord", state: "building", dateFrom: null, dateTo: null, travellerCount: 1 },
    ])

    const { findByText } = await render(<TripListScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText(/Last synced 2 days ago/)).toBeTruthy()
  })

  describe("grouping", () => {
    // Headings only. The ordering within and between groups is groupTrips' job and is
    // covered directly in lib/trips/__tests__/group-trips.test.ts — asserting it here
    // as well would need a test-only element rendering the order, which is a worse
    // trade than testing the pure function that decides it.
    // getTrips returns a paginated page, not a bare array.
    const page = (items: unknown[]) => ({ items, total: items.length, page: 1, pages: 1 })

    const HAPPENING = {
      id: "t-happening",
      destination: "Skye",
      state: TRIP_STATE.HAPPENING,
      dateFrom: "2026-09-19",
      dateTo: "2026-09-24",
      travellers: [],
    }
    const SOON = {
      id: "t-soon",
      destination: "Arran",
      state: TRIP_STATE.BUILDING,
      dateFrom: "2026-10-01",
      dateTo: "2026-10-04",
      travellers: [],
    }
    const OLD = {
      id: "t-old",
      destination: "Jura",
      state: TRIP_STATE.PAST,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-03",
      travellers: [],
    }

    it("heads each group the trips actually fall into", async () => {
      mockGetTrips.mockResolvedValue(page([OLD, SOON, HAPPENING]))

      const { findByTestId } = await render(<TripListScreen />, { wrapper: WithCachedSurfaces })

      expect(await findByTestId("group-happening")).toBeTruthy()
      expect(await findByTestId("group-building")).toBeTruthy()
      expect(await findByTestId("group-past")).toBeTruthy()
    })

    it("omits a heading for a group with no trips in it", async () => {
      // A paddler with nothing under way should not be shown an empty "On the water".
      mockGetTrips.mockResolvedValue(page([SOON]))

      const { findByTestId, queryByTestId } = await render(<TripListScreen />, { wrapper: WithCachedSurfaces })
      await findByTestId("group-building")

      expect(queryByTestId("group-happening")).toBeNull()
      expect(queryByTestId("group-past")).toBeNull()
    })

    it("still lists a trip whose state the backend left null", async () => {
      // `state` is nullish on the DTO. Dropping such a trip would lose it silently.
      mockGetTrips.mockResolvedValue(page([{ ...SOON, id: "t-stateless", state: null }]))

      const { findByText } = await render(<TripListScreen />, { wrapper: WithCachedSurfaces })

      expect(await findByText("Arran")).toBeTruthy()
    })
  })
})
