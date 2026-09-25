import { render } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"

import TripDetailScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/index"
import { startSyncTrigger } from "../lib/db/sync-trigger"
import { loadTripListCache } from "../lib/db/trip-list-cache"
import { isTripLeader } from "../lib/db/trip-role"
import { getTrip } from "../lib/trips/actions"

jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useLocalSearchParams: () => ({ id: "trip-1" }),
    useIsFocused: () => true,
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
jest.mock("../lib/db/trip-role", () => ({ isTripLeader: jest.fn() }))

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
const mockIsTripLeader = isTripLeader as jest.Mock

beforeEach(() => {
  mockIsTripLeader.mockReset()
  mockIsTripLeader.mockResolvedValue(false)
  mockGetTrip.mockReset()
  mockStartSyncTrigger.mockReset()
  mockStartSyncTrigger.mockReturnValue(jest.fn())
  mockLoadTripListCache.mockReset()
  mockLoadTripListCache.mockResolvedValue([])
})

describe("TripDetailScreen", () => {
  // M9d WP5: the leader's pause/finish/extend controls on a trip under way.
  it("gives the leader of a trip under way its controls", async () => {
    mockIsTripLeader.mockResolvedValue(true)
    mockGetTrip.mockResolvedValue({
      id: "trip-1",
      destination: "Costa Brava",
      state: "happening",
      dateTo: "2026-10-05",
    })

    const { findByTestId } = await render(<TripDetailScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByTestId("trip-pause")).toBeTruthy()
  })

  it("gives crew no trip controls", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", destination: "Costa Brava", state: "happening" })

    const { findByText, queryByTestId } = await render(<TripDetailScreen />, { wrapper: WithCachedSurfaces })
    await findByText("Costa Brava")

    expect(queryByTestId("trip-pause")).toBeNull()
  })

  it("shows the trip's destination and state once loaded", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", destination: "Costa Brava", state: "building" })

    const { findByText } = await render(<TripDetailScreen />, { wrapper: WithCachedSurfaces })

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

    const { findByText, getByText, queryByText } = await render(<TripDetailScreen />, { wrapper: WithCachedSurfaces })
    await findByText("Costa Brava")

    expect(getByText("Moderate")).toBeTruthy()
    expect(getByText("A relaxed week along the coast.")).toBeTruthy()
    // Web has no "Details" tab either — this is the identity card, not a link out.
    expect(queryByText("Details")).toBeNull()
  })

  it("links to every remaining hub destination at web parity (M30 WP2)", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", destination: "Costa Brava", state: "building" })

    const { findByText, getByText } = await render(<TripDetailScreen />, { wrapper: WithCachedSurfaces })
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

    const { findByText } = await render(<TripDetailScreen />, { wrapper: WithCachedSurfaces })

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
      const { findByText, queryByText } = await render(<TripDetailScreen />, { wrapper: WithCachedSurfaces })

      expect(await findByText("Costa Brava")).toBeTruthy()
      expect(queryByText("Could not reach the server.")).toBeNull()
      expect(queryByText("Elsewhere")).toBeNull()
    })

    it("keeps every hub destination reachable", async () => {
      const { findByText, getByText } = await render(<TripDetailScreen />, { wrapper: WithCachedSurfaces })
      await findByText("Costa Brava")

      expect(getByText("Itinerary")).toBeTruthy()
      expect(getByText("Crew")).toBeTruthy()
      expect(getByText("Logistics")).toBeTruthy()
      expect(getByText("Float plan")).toBeTruthy()
      expect(getByText("Items")).toBeTruthy()
    })

    it("says the data is cached rather than presenting it as live", async () => {
      const { findByText } = await render(<TripDetailScreen />, { wrapper: WithCachedSurfaces })

      expect(await findByText(/Can't reach the server\./)).toBeTruthy()
      expect(await findByText(/Last synced 2 days ago/)).toBeTruthy()
    })

    it("omits difficulty and description, which the trip-list cache does not carry", async () => {
      const { findByText, queryByText } = await render(<TripDetailScreen />, { wrapper: WithCachedSurfaces })
      await findByText("Costa Brava")

      expect(queryByText("Difficulty")).toBeNull()
      expect(queryByText("Description")).toBeNull()
    })
  })

  // The sync trigger used to be started here, scoped to this one trip. It moved
  // to the authenticated app root in M9c WP7 (see __tests__/app-layout.test.tsx)
  // — sync scope should not be a side effect of which screen someone opened.
  it("does not start a sync trigger of its own", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", destination: "Costa Brava", state: "building" })

    const { findByText } = await render(<TripDetailScreen />, { wrapper: WithCachedSurfaces })
    await findByText("Costa Brava")

    expect(mockStartSyncTrigger).not.toHaveBeenCalled()
  })
})
