import { fireEvent, render, waitFor } from "@testing-library/react-native"

import TripListScreen from "../app/(app)/(drawer)/(trips)/index"
import { getTrips } from "../lib/trips/actions"

jest.mock("../lib/trips/actions", () => ({
  getTrips: jest.fn(),
}))

const mockGetTrips = getTrips as jest.Mock

describe("TripListScreen", () => {
  beforeEach(() => {
    mockGetTrips.mockReset()
  })

  it("renders each trip's destination once the fetch resolves", async () => {
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
  })

  it("shows an empty state, not a blank list, when there are no trips", async () => {
    mockGetTrips.mockResolvedValue({ items: [], total: 0, page: 1, pages: 0 })

    const { findByText } = await render(<TripListScreen />)

    expect(await findByText("No trips yet")).toBeTruthy()
  })

  it("surfaces the thrown error message and offers a retry that re-fetches", async () => {
    mockGetTrips.mockRejectedValueOnce(new Error("Could not reach the server."))
    mockGetTrips.mockResolvedValueOnce({ items: [], total: 0, page: 1, pages: 0 })

    const { findByText, getByText } = await render(<TripListScreen />)

    expect(await findByText("Could not reach the server.")).toBeTruthy()

    await fireEvent.press(getByText("Try again"))

    await waitFor(() => {
      expect(mockGetTrips).toHaveBeenCalledTimes(2)
    })
  })
})
