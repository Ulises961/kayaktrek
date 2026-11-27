import { fireEvent, render } from "@testing-library/react-native"
import type { ReactNode } from "react"

import { DIFFICULTY_LABELS } from "@shared/dtos/difficulty"
import { TRIP_STATE } from "@shared/dtos/trip"
import { daysBetween, formatDateRange, tripDayLabel } from "@shared/trips/format"

import { MUTATION_ENTITY, MUTATION_OPERATION, MUTATION_STATUS } from "../../../lib/db/mutation-queue"
import { QueuedChangesContext, type QueuedChanges } from "../../../lib/network/queued-changes"
import type { TripHeaderView } from "../../../lib/trips/use-trip-header"
import { TripHeader } from "../trip-header"

const TODAY = "2026-06-12"

const PLANNED: TripHeaderView = {
  destination: "Costa Brava",
  state: TRIP_STATE.BUILDING,
  dateFrom: "2026-06-10",
  dateTo: "2026-06-16",
  difficulty: "moderate",
  isPaused: false,
  pausedAt: null,
}

function queuedPause(tripId: string): QueuedChanges["pending"][number] {
  return {
    mutationId: `pause-${tripId}`,
    entityType: MUTATION_ENTITY.TRIP,
    operation: MUTATION_OPERATION.UPDATE,
    entityId: tripId,
    payload: { action: "pause" },
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

function renderHeader(props: Partial<React.ComponentProps<typeof TripHeader>> = {}) {
  return render(
    <TripHeader
      tripId="trip-1"
      trip={PLANNED}
      today={TODAY}
      compact={false}
      onBack={jest.fn()}
      onOpenActions={null}
      {...props}
    />,
    { wrapper: withQueue() },
  )
}

describe("TripHeader", () => {
  it("shows who the trip is and where it stands: title, state, difficulty and dates", async () => {
    const { getByText } = await renderHeader()

    expect(getByText("Costa Brava")).toBeTruthy()
    expect(getByText(DIFFICULTY_LABELS.moderate)).toBeTruthy()
    expect(getByText(formatDateRange(PLANNED.dateFrom, PLANNED.dateTo))).toBeTruthy()
  })

  it("counts the days of a planned trip, since none has started", async () => {
    const { getByText } = await renderHeader()

    expect(getByText(`(${daysBetween("2026-06-10", "2026-06-16")} days)`)).toBeTruthy()
  })

  it("says which day a trip under way is on", async () => {
    const trip: TripHeaderView = { ...PLANNED, state: TRIP_STATE.HAPPENING }

    const { getByText } = await renderHeader({ trip })

    const label = tripDayLabel({ ...trip, isPaused: false, pausedAt: null }, TODAY)
    expect(label).not.toBeNull()
    expect(getByText(label as string)).toBeTruthy()
  })

  it("says the trip is paused, and on which day", async () => {
    const trip: TripHeaderView = {
      ...PLANNED,
      state: TRIP_STATE.HAPPENING,
      isPaused: true,
      pausedAt: "2026-06-11T09:00:00Z",
    }

    const { getByText } = await renderHeader({ trip })

    expect(getByText(tripDayLabel(trip, TODAY) as string)).toBeTruthy()
  })

  it("collapses to the title row on a tab that wants the room (the itinerary map)", async () => {
    const { getByText, queryByText } = await renderHeader({ compact: true })

    expect(getByText("Costa Brava")).toBeTruthy()
    expect(queryByText(DIFFICULTY_LABELS.moderate)).toBeNull()
    expect(queryByText(formatDateRange(PLANNED.dateFrom, PLANNED.dateTo))).toBeNull()
  })

  it("leaves difficulty out when the cache has none, as it does offline", async () => {
    const { queryByText } = await renderHeader({ trip: { ...PLANNED, difficulty: null } })

    expect(queryByText(DIFFICULTY_LABELS.moderate)).toBeNull()
  })

  it("goes back to the trip list from the back button", async () => {
    const onBack = jest.fn()
    const { getByTestId } = await renderHeader({ onBack })

    await fireEvent.press(getByTestId("trip-back"))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it("has no actions button when there is nothing to do to the trip", async () => {
    const { queryByTestId } = await renderHeader({ onOpenActions: null })

    expect(queryByTestId("trip-actions")).toBeNull()
  })

  it("opens the actions from the ••• button", async () => {
    const onOpenActions = jest.fn()
    const { getByTestId } = await renderHeader({ onOpenActions })

    await fireEvent.press(getByTestId("trip-actions"))

    expect(onOpenActions).toHaveBeenCalledTimes(1)
  })

  // The shore contact's missed-checkpoint alert runs off what the server knows. A pause that
  // is still only on this phone must be visible without opening a menu.
  it("says on every tab that a change is recorded here but not sent yet", async () => {
    const { getByTestId, getByText } = await render(
      <TripHeader
        tripId="trip-1"
        trip={{ ...PLANNED, state: TRIP_STATE.HAPPENING }}
        today={TODAY}
        compact
        onBack={jest.fn()}
        onOpenActions={null}
      />,
      { wrapper: withQueue([queuedPause("trip-1")]) },
    )

    expect(getByTestId("trip-unsent-banner")).toBeTruthy()
    expect(getByText(/not sent yet/i)).toBeTruthy()
  })

  it("shows no unsent banner when everything has been sent", async () => {
    const { queryByTestId } = await renderHeader()

    expect(queryByTestId("trip-unsent-banner")).toBeNull()
  })

  it("ignores queued changes that belong to another trip", async () => {
    const { queryByTestId } = await render(
      <TripHeader
        tripId="trip-1"
        trip={PLANNED}
        today={TODAY}
        compact={false}
        onBack={jest.fn()}
        onOpenActions={null}
      />,
      { wrapper: withQueue([queuedPause("trip-other")]) },
    )

    expect(queryByTestId("trip-unsent-banner")).toBeNull()
  })
})
