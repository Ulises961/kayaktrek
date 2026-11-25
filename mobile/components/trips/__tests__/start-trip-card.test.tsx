import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { Alert } from "react-native"

import { TRIP_STATE } from "@shared/dtos/trip"

import { startTrip } from "../../../lib/trips/actions"
import { StartTripCard } from "../start-trip-card"

jest.mock("../../../lib/trips/actions", () => ({ startTrip: jest.fn() }))

const mockStartTrip = startTrip as jest.Mock

// Presses the confirm dialog's button the way a thumb would.
async function confirm(text: string) {
  const buttons = (Alert.alert as unknown as jest.Mock).mock.calls.at(-1)?.[2] as {
    text: string
    onPress?: () => void
  }[]
  // Inside act, so the card's state updates after the start settles are not left outside it.
  await act(async () => {
    buttons.find((button) => button.text === text)?.onPress?.()
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockStartTrip.mockResolvedValue(undefined)
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

describe("StartTripCard", () => {
  it("asks before it starts, and starts nothing if the paddler cancels", async () => {
    const { getByTestId } = await render(
      <StartTripCard tripId="trip-1" state={TRIP_STATE.BUILDING} onStarted={jest.fn()} />,
    )

    await fireEvent.press(getByTestId("trip-start"))

    expect(Alert.alert).toHaveBeenCalledWith("Start the trip?", expect.any(String), expect.any(Array))
    expect(mockStartTrip).not.toHaveBeenCalled()
  })

  it("starts the trip on confirm and tells its screen to reload", async () => {
    const onStarted = jest.fn()
    const { getByTestId } = await render(
      <StartTripCard tripId="trip-1" state={TRIP_STATE.BUILDING} onStarted={onStarted} />,
    )

    await fireEvent.press(getByTestId("trip-start"))
    await confirm("Start")

    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1))
    expect(mockStartTrip).toHaveBeenCalledWith("trip-1")
  })

  it("shows the server's reason when the start is refused, and does not report it started", async () => {
    mockStartTrip.mockRejectedValue(new Error("Could not reach the server."))
    const onStarted = jest.fn()
    const { getByTestId, findByTestId } = await render(
      <StartTripCard tripId="trip-1" state={TRIP_STATE.BUILDING} onStarted={onStarted} />,
    )

    await fireEvent.press(getByTestId("trip-start"))
    await confirm("Start")

    expect((await findByTestId("start-trip-error")).props.children).toBe("Could not reach the server.")
    expect(onStarted).not.toHaveBeenCalled()
  })

  it.each([TRIP_STATE.HAPPENING, TRIP_STATE.PAST, null])("is not offered when the trip is %s", async (state) => {
    const { queryByTestId } = await render(<StartTripCard tripId="trip-1" state={state} onStarted={jest.fn()} />)

    expect(queryByTestId("trip-start")).toBeNull()
  })
})
