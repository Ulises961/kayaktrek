import { render, waitFor } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"

import FloatPlanScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/(tabs)/float-plan"
import { getLogistics, getTrip } from "../lib/trips/actions"
import { loadOfflineCrew } from "../lib/db/offline-float-plan"
import { loadTripListCache } from "../lib/db/trip-list-cache"

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "trip-1" }),
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  Link: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock("../lib/auth/session", () => ({ getSession: jest.fn(async () => ({ userId: "me-id" })) }))

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

// M9c WP7: every offline branch below now reads how old its cache is. The real
// lookup needs a database; the age itself is asserted as a relative offset so
// the expectation can't rot into an absolute date as the suite gets older.
jest.mock("../lib/db/cache-freshness", () => ({
  ...jest.requireActual("../lib/db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
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

  // M9d WP7: a paddler keeps their own vessel and emergency contact current,
  // signal or not, from their own row.
  it("offers Edit my details on the paddler's own row only", async () => {
    mockGetTrip.mockResolvedValue({
      state: "happening",
      travellers: [
        { id: "m1", role: "leader", user: { id: "leader-id", name: "Sam" } },
        { id: "m2", role: "crew", user: { id: "me-id", name: "Ana" } },
      ],
    })

    const { findAllByTestId } = await render(<FloatPlanScreen />, { wrapper: WithCachedSurfaces })

    expect(await findAllByTestId("edit-my-details")).toHaveLength(1)
  })

  it("renders the crew manifest and shore contact once the fetch resolves", async () => {
    mockGetTrip.mockResolvedValue({
      state: "building",
      travellers: [
        { id: "m1", role: "leader", user: { name: "Sam", surname: "Lee" }, vesselMake: "Valley" },
      ],
    })
    mockGetLogistics.mockResolvedValue({ shoreContactName: "Jo Shore" })

    const { findByText } = await render(<FloatPlanScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Sam Lee")).toBeTruthy()
    expect(await findByText("Jo Shore")).toBeTruthy()
  })

  it("falls back to the cached crew manifest offline, and says shore contact needs a connection", async () => {
    mockGetTrip.mockRejectedValue(new Error("Network request failed"))
    mockLoadOfflineCrew.mockResolvedValue([
      { id: "m1", role: "leader", user: { name: "Cached", surname: "Paddler" }, vesselMake: "P&H" },
    ])
    mockLoadTripListCache.mockResolvedValue([{ id: "trip-1", state: "happening" }])

    const { findByText } = await render(<FloatPlanScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Cached Paddler")).toBeTruthy()
    expect(await findByText("Shore contact needs a connection.")).toBeTruthy()
    expect(await findByText(/Can't reach the server\./)).toBeTruthy()
    expect(await findByText(/Last synced 2 days ago/)).toBeTruthy()
  })

  it("surfaces the error when there is nothing cached to fall back to", async () => {
    mockGetTrip.mockRejectedValue(new Error("Could not reach the server."))

    const { findByText } = await render(<FloatPlanScreen />, { wrapper: WithCachedSurfaces })

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })

  it("does not surface an error while the cache is loading", async () => {
    mockGetTrip.mockRejectedValue(new Error("offline"))
    mockLoadOfflineCrew.mockResolvedValue([
      { id: "m1", role: "crew", user: { name: "A", surname: "B" } },
    ])

    const { findByText } = await render(<FloatPlanScreen />, { wrapper: WithCachedSurfaces })
    await waitFor(() => expect(mockLoadOfflineCrew).toHaveBeenCalledWith("trip-1"))
    expect(await findByText("A B")).toBeTruthy()
  })
})
