import { render } from "@testing-library/react-native"

import TripDetailsScreen from "../app/(app)/(drawer)/(trips)/trips/[id]/details"
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

describe("TripDetailsScreen", () => {
  it("renders destination, dates, state and difficulty once loaded", async () => {
    mockGetTrip.mockResolvedValue({
      id: "trip-1",
      destination: "Costa Brava",
      state: "building",
      difficulty: "moderate",
      dateFrom: "2026-06-10",
      dateTo: "2026-06-14",
      description: "A relaxed week along the coast.",
    })

    const { findByText, getByText } = await render(<TripDetailsScreen />)

    expect(await findByText("Costa Brava")).toBeTruthy()
    expect(getByText("Moderate")).toBeTruthy()
    expect(getByText("A relaxed week along the coast.")).toBeTruthy()
  })

  it("omits the difficulty and description sections when unset, without crashing", async () => {
    mockGetTrip.mockResolvedValue({
      id: "trip-1",
      destination: "Costa Brava",
      state: "building",
      dateFrom: null,
      dateTo: null,
    })

    const { findByText, queryByText } = await render(<TripDetailsScreen />)

    expect(await findByText("Costa Brava")).toBeTruthy()
    expect(queryByText("Difficulty")).toBeNull()
    expect(queryByText("Description")).toBeNull()
  })

  it("surfaces a thrown error instead of hanging on the spinner", async () => {
    mockGetTrip.mockRejectedValue(new Error("Could not reach the server."))

    const { findByText } = await render(<TripDetailsScreen />)

    expect(await findByText("Could not reach the server.")).toBeTruthy()
  })
})
