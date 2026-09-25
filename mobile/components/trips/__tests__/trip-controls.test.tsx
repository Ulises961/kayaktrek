import { fireEvent, render, waitFor } from "@testing-library/react-native"
import type { ReactNode } from "react"
import { Alert } from "react-native"

import { TRIP_STATE } from "@shared/dtos/trip"

import { MUTATION_STATUS, enqueueMutation, pushQueuedMutations } from "../../../lib/db/mutation-queue"
import { QueuedChangesContext, type QueuedChanges } from "../../../lib/network/queued-changes"
import { TripControls } from "../trip-controls"

jest.mock("../../../lib/db/mutation-queue", () => ({
  ...jest.requireActual("../../../lib/db/mutation-queue"),
  enqueueMutation: jest.fn(),
  pushQueuedMutations: jest.fn(),
}))

const mockEnqueue = enqueueMutation as jest.Mock
const mockPush = pushQueuedMutations as jest.Mock

const UNDER_WAY = { state: TRIP_STATE.HAPPENING, isPaused: false, dateTo: "2026-10-05" }

function withQueue(pending: QueuedChanges["pending"] = []) {
  const value: QueuedChanges = { pending, rejected: [], dismiss: jest.fn(), discardAll: jest.fn() }
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueuedChangesContext.Provider value={value}>{children}</QueuedChangesContext.Provider>
  }
  return Wrapper
}

function confirm(text: string) {
  const buttons = (Alert.alert as unknown as jest.Mock).mock.calls.at(-1)?.[2] as {
    text: string
    onPress?: () => Promise<void>
  }[]
  return buttons.find((button) => button.text === text)?.onPress?.()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockEnqueue.mockResolvedValue("m-1")
  mockPush.mockResolvedValue({ applied: 1, rejected: 0, kept: 0 })
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
})

describe("TripControls", () => {
  it("offers pause, finish and an extra day on a trip under way", async () => {
    const { getByTestId } = await render(<TripControls tripId="trip-1" status={UNDER_WAY} />, {
      wrapper: withQueue(),
    })

    expect(getByTestId("trip-pause")).toBeTruthy()
    expect(getByTestId("trip-finish")).toBeTruthy()
    expect(getByTestId("trip-extend")).toBeTruthy()
  })

  it("offers resume and abort on a paused trip", async () => {
    const { getByTestId, queryByTestId } = await render(
      <TripControls tripId="trip-1" status={{ ...UNDER_WAY, isPaused: true }} />,
      { wrapper: withQueue() },
    )

    expect(getByTestId("trip-resume")).toBeTruthy()
    expect(getByTestId("trip-abort")).toBeTruthy()
    expect(queryByTestId("trip-pause")).toBeNull()
  })

  it("shows nothing on a trip that isn't under way", async () => {
    const { toJSON } = await render(
      <TripControls tripId="trip-1" status={{ ...UNDER_WAY, state: TRIP_STATE.BUILDING }} />,
      { wrapper: withQueue() },
    )

    expect(toJSON()).toBeNull()
  })

  it("queues a pause once confirmed, and tries to send it straight away", async () => {
    const { getByTestId } = await render(<TripControls tripId="trip-1" status={UNDER_WAY} />, {
      wrapper: withQueue(),
    })

    await fireEvent.press(getByTestId("trip-pause"))
    await confirm("Pause")

    expect(mockEnqueue).toHaveBeenCalledWith({
      entityType: "trip",
      operation: "update",
      entityId: "trip-1",
      payload: { action: "pause" },
    })
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
  })

  it("does nothing until confirmed", async () => {
    const { getByTestId } = await render(<TripControls tripId="trip-1" status={UNDER_WAY} />, {
      wrapper: withQueue(),
    })

    await fireEvent.press(getByTestId("trip-finish"))

    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it("extends the trip by a day past its current end", async () => {
    const { getByTestId } = await render(<TripControls tripId="trip-1" status={UNDER_WAY} />, {
      wrapper: withQueue(),
    })

    await fireEvent.press(getByTestId("trip-extend"))
    await confirm("Add a day")

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "trip-1", payload: { dateTo: "2026-10-06" } }),
    )
  })

  // Until it reaches the server, the server still expects the old plan — and the
  // shore contact's missed-checkpoint alert runs off the server.
  it("says a queued change is recorded here but not sent, and what that means", async () => {
    const pausedHere = {
      mutationId: "m-1",
      entityType: "trip",
      operation: "update",
      entityId: "trip-1",
      payload: { action: "pause" },
      deviceTimestamp: "2026-10-02T09:00:00.000Z",
      status: MUTATION_STATUS.PENDING,
      reason: null,
    }

    const { getByText, getByTestId } = await render(<TripControls tripId="trip-1" status={UNDER_WAY} />, {
      wrapper: withQueue([pausedHere]),
    })

    expect(getByText(/Paused the trip/)).toBeTruthy()
    expect(getByText(/not sent yet/)).toBeTruthy()
    expect(getByText(/shore contact/)).toBeTruthy()
    // Shown paused on this phone already.
    expect(getByTestId("trip-resume")).toBeTruthy()
  })
})
