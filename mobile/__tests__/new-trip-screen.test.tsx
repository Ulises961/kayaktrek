import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { TripFieldsSchema } from "@shared/dtos/trip"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"

import NewTripScreen from "../app/(app)/(drawer)/(trips)/trips/new"
import { createTrip } from "../lib/trips/actions"

const mockReplace = jest.fn()

jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useRouter: () => ({ replace: mockReplace }),
  }
})
jest.mock("../lib/trips/actions", () => ({ createTrip: jest.fn() }))

const mockCreateTrip = createTrip as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateTrip.mockResolvedValue("trip-9")
})

describe("NewTripScreen", () => {
  it("creates the trip from the form and opens its hub", async () => {
    const { getByPlaceholderText, getByTestId } = await render(<NewTripScreen />, {
      wrapper: WithCachedSurfaces,
    })

    await fireEvent.changeText(getByPlaceholderText("e.g. Shetland"), "  Shetland ")
    await fireEvent.changeText(getByPlaceholderText("Optional"), "Round Unst")
    await fireEvent.press(getByTestId("trip-form-submit"))

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/trips/trip-9"))
    // Trimmed, and the blank dates are absent rather than "".
    expect(mockCreateTrip).toHaveBeenCalledWith({
      destination: "Shetland",
      description: "Round Unst",
      dateFrom: undefined,
      dateTo: undefined,
    })
  })

  it("shows the server's message and stays on the form when creation fails", async () => {
    mockCreateTrip.mockRejectedValue(new Error("Could not reach the server."))
    const { getByTestId, findByTestId } = await render(<NewTripScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(getByTestId("trip-form-submit"))

    expect((await findByTestId("trip-form-error")).props.children).toBe("Could not reach the server.")
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("shows the schema's own message, not a stack of issues, when validation fails", async () => {
    // What createTrip throws for dates the wrong way round (TripFieldsSchema parses first).
    mockCreateTrip.mockImplementation(async () => {
      TripFieldsSchema.parse({ dateFrom: "2026-12-05", dateTo: "2026-12-01" })
    })
    const { getByTestId, findByTestId } = await render(<NewTripScreen />, { wrapper: WithCachedSurfaces })

    await fireEvent.press(getByTestId("trip-form-submit"))

    expect((await findByTestId("trip-form-error")).props.children).toBe(
      "End date must be on or after the start date.",
    )
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
