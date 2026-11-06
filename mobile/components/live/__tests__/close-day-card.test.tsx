import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"
import { Alert } from "react-native"

import { formatDayDate } from "@shared/utils/date"

import { closeDay } from "@mobile/lib/live/actions"

import { CloseDayCard } from "../close-day-card"

jest.mock("@mobile/lib/live/actions", () => ({ closeDay: jest.fn() }))

const mockedCloseDay = closeDay as jest.Mock

function confirm(text: string) {
  const buttons = (Alert.alert as unknown as jest.Mock).mock.calls.at(-1)?.[2] as {
    text: string
    onPress?: () => Promise<void> | void
  }[]
  return buttons.find((button) => button.text === text)?.onPress?.()
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

describe("CloseDayCard", () => {
  it("asks first, and closes nothing until the leader confirms", async () => {
    await render(<CloseDayCard tripId="trip-1" />)

    await fireEvent.press(screen.getByText("Close day"))

    expect(Alert.alert).toHaveBeenCalledTimes(1)
    expect(mockedCloseDay).not.toHaveBeenCalled()
  })

  it("does nothing when the leader cancels", async () => {
    await render(<CloseDayCard tripId="trip-1" />)
    await fireEvent.press(screen.getByText("Close day"))

    await act(async () => {
      await confirm("Cancel")
    })

    expect(mockedCloseDay).not.toHaveBeenCalled()
    expect(screen.queryByText(/logs are being generated/i)).toBeNull()
  })

  it("closes the trip's day on confirming, and says which day and that the logs are on their way", async () => {
    mockedCloseDay.mockResolvedValue({ date: "2026-11-06" })
    await render(<CloseDayCard tripId="trip-1" />)
    await fireEvent.press(screen.getByText("Close day"))

    await act(async () => {
      await confirm("Close day")
    })

    expect(mockedCloseDay).toHaveBeenCalledWith("trip-1")
    expect(await screen.findByText(`${formatDayDate("2026-11-06")} closed. Logs are being generated.`)).toBeTruthy()
  })

  it("shows the server's reason when it refuses, instead of claiming a day closed", async () => {
    mockedCloseDay.mockRejectedValue(new Error("There's no itinerary day scheduled for that date."))
    await render(<CloseDayCard tripId="trip-1" />)
    await fireEvent.press(screen.getByText("Close day"))

    await act(async () => {
      await confirm("Close day")
    })

    expect(await screen.findByText("There's no itinerary day scheduled for that date.")).toBeTruthy()
    expect(screen.queryByText(/logs are being generated/i)).toBeNull()
  })

  it("replaces an earlier answer with the next one, so a retry does not leave an old reason on screen", async () => {
    mockedCloseDay.mockRejectedValueOnce(new Error("Could not reach the server.")).mockResolvedValueOnce({ date: "2026-11-06" })
    await render(<CloseDayCard tripId="trip-1" />)

    await fireEvent.press(screen.getByText("Close day"))
    await act(async () => {
      await confirm("Close day")
    })
    expect(await screen.findByText("Could not reach the server.")).toBeTruthy()

    await fireEvent.press(screen.getByText("Close day"))
    await act(async () => {
      await confirm("Close day")
    })

    await waitFor(() => expect(screen.queryByText("Could not reach the server.")).toBeNull())
    expect(await screen.findByText(/logs are being generated/i)).toBeTruthy()
  })
})
