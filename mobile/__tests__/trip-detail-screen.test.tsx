import { render, waitFor } from "@testing-library/react-native"

import TripDetailScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/index"
import { startSyncTrigger } from "../lib/db/sync-trigger"
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

const mockGetTrip = getTrip as jest.Mock
const mockStartSyncTrigger = startSyncTrigger as jest.Mock

beforeEach(() => {
  mockGetTrip.mockReset()
  mockStartSyncTrigger.mockReset()
  mockStartSyncTrigger.mockReturnValue(jest.fn())
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

  it("surfaces a thrown error", async () => {
    mockGetTrip.mockRejectedValue(new Error("Could not reach the server."))

    const { findByText } = await render(<TripDetailScreen />)

    expect(await findByText("Could not reach the server.")).toBeTruthy()
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
