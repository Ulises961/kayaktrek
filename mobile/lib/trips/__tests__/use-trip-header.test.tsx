import { renderHook, waitFor } from "@testing-library/react-native"

import { TRIP_STATE } from "@shared/dtos/trip"

import { loadTripListCache } from "../../db/trip-list-cache"
import { isTripLeader } from "../../db/trip-role"
import { getTrip } from "../actions"
import { useTripHeader } from "../use-trip-header"

jest.mock("../actions", () => ({ getTrip: jest.fn() }))
jest.mock("../../db/trip-list-cache", () => ({ loadTripListCache: jest.fn() }))
jest.mock("../../db/trip-role", () => ({ isTripLeader: jest.fn() }))
jest.mock("../../live/use-trip-changes", () => ({ useTripChanges: jest.fn() }))
// The real lookup needs a database; the age is not what is asserted here.
jest.mock("../../db/cache-freshness", () => ({
  ...jest.requireActual("../../db/cache-freshness"),
  readCachedAt: jest.fn(async () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
}))

const mockGetTrip = getTrip as jest.Mock
const mockLoadTripListCache = loadTripListCache as jest.Mock
const mockIsTripLeader = isTripLeader as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockIsTripLeader.mockResolvedValue(false)
  mockLoadTripListCache.mockResolvedValue([])
})

describe("useTripHeader", () => {
  it("reads the trip's header fields from the live trip", async () => {
    mockGetTrip.mockResolvedValue({
      id: "trip-1",
      destination: "Costa Brava",
      state: TRIP_STATE.HAPPENING,
      dateFrom: "2026-06-10",
      dateTo: "2026-06-14",
      difficulty: "moderate",
      isPaused: true,
      pausedAt: "2026-06-11T09:00:00Z",
    })

    const { result } = await renderHook(() => useTripHeader("trip-1"))

    await waitFor(() =>
      expect(result.current.trip).toEqual({
        destination: "Costa Brava",
        state: TRIP_STATE.HAPPENING,
        dateFrom: "2026-06-10",
        dateTo: "2026-06-14",
        difficulty: "moderate",
        isPaused: true,
        pausedAt: "2026-06-11T09:00:00Z",
      }),
    )
    expect(result.current.isOffline).toBe(false)
  })

  it("says whether the signed-in paddler leads the trip", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", state: TRIP_STATE.BUILDING })
    mockIsTripLeader.mockResolvedValue(true)

    const { result } = await renderHook(() => useTripHeader("trip-1"))

    await waitFor(() => expect(result.current.isLeader).toBe(true))
    expect(mockIsTripLeader).toHaveBeenCalledWith("trip-1")
  })

  it("surfaces the live error when the cache has nothing for this trip either", async () => {
    mockGetTrip.mockRejectedValue(new Error("Could not reach the server."))

    const { result } = await renderHook(() => useTripHeader("trip-1"))

    await waitFor(() => expect(result.current.error).toBe("Could not reach the server."))
    expect(result.current.trip).toBeNull()
  })

  // The header sits above every tab, so an error here would strand each cache those tabs
  // already hold. Going offline used to turn the whole trip into a dead end.
  describe("offline", () => {
    beforeEach(() => {
      mockGetTrip.mockRejectedValue(new Error("Could not reach the server."))
      mockLoadTripListCache.mockResolvedValue([
        { id: "trip-other", destination: "Elsewhere", state: TRIP_STATE.PAST, dateFrom: null, dateTo: null },
        {
          id: "trip-1",
          destination: "Costa Brava",
          state: TRIP_STATE.BUILDING,
          dateFrom: "2026-06-10",
          dateTo: "2026-06-14",
          travellerCount: 3,
        },
      ])
    })

    it("falls back to this trip's cached summary, not another trip's and not an error", async () => {
      const { result } = await renderHook(() => useTripHeader("trip-1"))

      await waitFor(() => expect(result.current.trip?.destination).toBe("Costa Brava"))
      expect(result.current.error).toBeNull()
      expect(result.current.isOffline).toBe(true)
    })

    it("has no difficulty or pause, which the trip-list cache does not carry", async () => {
      const { result } = await renderHook(() => useTripHeader("trip-1"))

      await waitFor(() => expect(result.current.trip).not.toBeNull())
      expect(result.current.trip).toMatchObject({ difficulty: null, isPaused: false, pausedAt: null })
    })
  })
})
