import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import type { ReactNode } from "react"
import { Alert } from "react-native"

import { TRIP_STATE } from "@shared/dtos/trip"

import { MUTATION_ENTITY, MUTATION_OPERATION, MUTATION_STATUS } from "../../../lib/db/mutation-queue"
import { QueuedChangesContext, type QueuedChanges } from "../../../lib/network/queued-changes"
import { startTrip } from "../../../lib/trips/actions"
import type { TripHeaderView } from "../../../lib/trips/use-trip-header"
import { TripActionsSheet, offersTripActions } from "../trip-actions-sheet"

jest.mock("../../../lib/trips/actions", () => ({ startTrip: jest.fn() }))
jest.mock("../../../lib/db/mutation-queue", () => ({
  ...jest.requireActual("../../../lib/db/mutation-queue"),
  enqueueMutation: jest.fn(),
}))
jest.mock("../../../lib/db/push-pending", () => ({ requestPush: jest.fn() }))

const mockStartTrip = startTrip as jest.Mock

const PLANNED: TripHeaderView = {
  destination: "Costa Brava",
  state: TRIP_STATE.BUILDING,
  dateFrom: "2026-06-10",
  dateTo: "2026-06-16",
  difficulty: null,
  isPaused: false,
  pausedAt: null,
}
const UNDER_WAY: TripHeaderView = { ...PLANNED, state: TRIP_STATE.HAPPENING }

function queuedFinish(): QueuedChanges["pending"][number] {
  return {
    mutationId: "m-1",
    entityType: MUTATION_ENTITY.TRIP,
    operation: MUTATION_OPERATION.UPDATE,
    entityId: "trip-1",
    payload: { action: "finish" },
    deviceTimestamp: "2026-06-12T08:00:00Z",
    status: MUTATION_STATUS.PENDING,
    reason: null,
  }
}

function withQueue(pending: QueuedChanges["pending"] = []) {
  const value: QueuedChanges = { pending, rejected: [], dismiss: jest.fn(), discardAll: jest.fn() }
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueuedChangesContext.Provider value={value}>{children}</QueuedChangesContext.Provider>
  }
  return Wrapper
}

function renderSheet(trip: TripHeaderView, props: Partial<React.ComponentProps<typeof TripActionsSheet>> = {}) {
  return render(
    <TripActionsSheet visible tripId="trip-1" trip={trip} onClose={jest.fn()} onStarted={jest.fn()} {...props} />,
    { wrapper: withQueue() },
  )
}

beforeEach(() => jest.clearAllMocks())

describe("TripActionsSheet", () => {
  it("offers a planned trip's leader the start of the trip", async () => {
    const { getByTestId } = await renderSheet(PLANNED)

    expect(getByTestId("trip-start")).toBeTruthy()
  })

  it("offers a trip under way its pause, finish and extra day", async () => {
    const { getByTestId, queryByTestId } = await renderSheet(UNDER_WAY)

    expect(getByTestId("trip-pause")).toBeTruthy()
    expect(getByTestId("trip-finish")).toBeTruthy()
    expect(getByTestId("trip-extend")).toBeTruthy()
    expect(queryByTestId("trip-start")).toBeNull()
  })

  it("renders nothing while closed", async () => {
    const { queryByTestId } = await renderSheet(UNDER_WAY, { visible: false })

    expect(queryByTestId("trip-pause")).toBeNull()
  })

  it("still says a trip finished on this phone has not been sent", async () => {
    const { getByText } = await render(
      <TripActionsSheet
        visible
        tripId="trip-1"
        trip={{ ...UNDER_WAY, state: TRIP_STATE.PAST }}
        onClose={jest.fn()}
        onStarted={jest.fn()}
      />,
      { wrapper: withQueue([queuedFinish()]) },
    )

    expect(getByText(/not sent yet/i)).toBeTruthy()
  })

  it("closes from its close button", async () => {
    const onClose = jest.fn()
    const { getByTestId } = await renderSheet(UNDER_WAY, { onClose })

    await fireEvent.press(getByTestId("trip-actions-close"))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("closes and tells the screen once the trip has been started", async () => {
    mockStartTrip.mockResolvedValue(undefined)
    const onClose = jest.fn()
    const onStarted = jest.fn()
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
    const { getByTestId } = await renderSheet(PLANNED, { onClose, onStarted })

    await fireEvent.press(getByTestId("trip-start"))
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[]
    await act(async () => {
      buttons.find((button) => button.text === "Start")?.onPress?.()
    })

    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1))
    expect(mockStartTrip).toHaveBeenCalledWith("trip-1")
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe("offersTripActions", () => {
  it("is true for the leader of a planned trip and of one under way", () => {
    expect(offersTripActions({ isLeader: true, state: TRIP_STATE.BUILDING, hasUnsentChange: false })).toBe(true)
    expect(offersTripActions({ isLeader: true, state: TRIP_STATE.HAPPENING, hasUnsentChange: false })).toBe(true)
  })

  it("is false for crew, whatever the state", () => {
    expect(offersTripActions({ isLeader: false, state: TRIP_STATE.BUILDING, hasUnsentChange: false })).toBe(false)
    expect(offersTripActions({ isLeader: false, state: TRIP_STATE.HAPPENING, hasUnsentChange: true })).toBe(false)
  })

  it("is false for a finished trip with nothing waiting to be sent", () => {
    expect(offersTripActions({ isLeader: true, state: TRIP_STATE.PAST, hasUnsentChange: false })).toBe(false)
  })

  it("stays true for a trip finished on this phone, whose change has not been sent", () => {
    expect(offersTripActions({ isLeader: true, state: TRIP_STATE.PAST, hasUnsentChange: true })).toBe(true)
  })

  it("is false until the trip has loaded", () => {
    expect(offersTripActions({ isLeader: true, state: null, hasUnsentChange: false })).toBe(false)
  })
})
