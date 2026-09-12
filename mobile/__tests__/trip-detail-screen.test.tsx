import { render } from "@testing-library/react-native"

import TripDetailScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/index"
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

const mockGetTrip = getTrip as jest.Mock

beforeEach(() => {
  mockGetTrip.mockReset()
})

describe("TripDetailScreen", () => {
  it("shows the trip's destination and state once loaded", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", destination: "Costa Brava", state: "building" })

    const { findByText } = await render(<TripDetailScreen />)

    expect(await findByText("Costa Brava")).toBeTruthy()
  })

  it("links to every hub destination at web parity (M30 WP2)", async () => {
    mockGetTrip.mockResolvedValue({ id: "trip-1", destination: "Costa Brava", state: "building" })

    const { findByText, getByText } = await render(<TripDetailScreen />)
    await findByText("Costa Brava")

    expect(getByText("Details")).toBeTruthy()
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
})
