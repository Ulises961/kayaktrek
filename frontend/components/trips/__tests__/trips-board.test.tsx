import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trips/actions", () => ({
  listTrips: vi.fn(),
}))

import { listTrips } from "@/lib/trips/actions"
import { TripsBoard } from "../trips-board"
import { TRIP_STATE, type Trip, type TripPage } from "@/lib/dtos/trip"

const mockListTrips = vi.mocked(listTrips)

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "01952f1a-0000-7000-8000-000000000030",
    destination: "Untitled trip",
    state: TRIP_STATE.BUILDING,
    dateFrom: null,
    dateTo: null,
    travellers: [],
    ...overrides,
  } as Trip
}

function page(items: Trip[], overrides: Partial<TripPage> = {}): TripPage {
  return { items, total: items.length, page: 1, pages: 1, ...overrides }
}

const EMPTY = page([])

async function openFilters() {
  await userEvent.click(screen.getByRole("button", { name: /filters/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListTrips.mockResolvedValue(EMPTY)
})

describe("TripsBoard", () => {
  it("renders each bucket's initial trips under its own section", () => {
    render(
      <TripsBoard
        initialHappening={page([trip({ destination: "Live one" })])}
        initialPlanning={page([trip({ destination: "Upcoming" })])}
        initialPast={page([trip({ destination: "Done" })])}
      />,
    )
    expect(screen.getByText("Live one")).toBeInTheDocument()
    expect(screen.getByText("Upcoming")).toBeInTheDocument()
    expect(screen.getByText("Done")).toBeInTheDocument()
  })

  it("changing the difficulty filter refetches all three sections", async () => {
    mockListTrips.mockResolvedValue(EMPTY)
    render(
      <TripsBoard
        initialHappening={page([trip({ destination: "Live one" })])}
        initialPlanning={page([trip({ destination: "Upcoming" })])}
        initialPast={page([trip({ destination: "Done" })])}
      />,
    )
    await openFilters()
    await userEvent.selectOptions(screen.getByLabelText(/filter by difficulty/i), "easy")
    await waitFor(() => {
      const calledStates = mockListTrips.mock.calls.map(([args]) => args.state)
      expect(calledStates).toEqual(
        expect.arrayContaining([TRIP_STATE.HAPPENING, TRIP_STATE.BUILDING, TRIP_STATE.PAST]),
      )
    })
    for (const call of mockListTrips.mock.calls) {
      expect(call[0].difficulty).toBe("easy")
    }
  })

  it("shows a filters-empty message once every section is empty and a filter is active", async () => {
    mockListTrips.mockResolvedValue(EMPTY)
    render(
      <TripsBoard
        initialHappening={page([trip({ destination: "Live one" })])}
        initialPlanning={page([trip({ destination: "Upcoming" })])}
        initialPast={page([trip({ destination: "Done" })])}
      />,
    )
    expect(screen.queryByText(/no trips match these filters/i)).not.toBeInTheDocument()
    await openFilters()
    await userEvent.selectOptions(screen.getByLabelText(/filter by difficulty/i), "expert")
    await waitFor(() =>
      expect(screen.getByText(/no trips match these filters/i)).toBeInTheDocument(),
    )
  })

  it("does not show the filters-empty message when no filter is active", () => {
    render(<TripsBoard initialHappening={EMPTY} initialPlanning={EMPTY} initialPast={EMPTY} />)
    expect(screen.queryByText(/no trips match these filters/i)).not.toBeInTheDocument()
  })

  it("clears the difficulty and distance filters via Clear filters", async () => {
    render(
      <TripsBoard
        initialHappening={page([trip({ destination: "Live one" })])}
        initialPlanning={page([trip({ destination: "Upcoming" })])}
        initialPast={page([trip({ destination: "Done" })])}
      />,
    )
    await openFilters()
    await userEvent.selectOptions(screen.getByLabelText(/filter by difficulty/i), "easy")
    await waitFor(() => expect(mockListTrips).toHaveBeenCalled())

    mockListTrips.mockClear()
    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }))
    await waitFor(() => {
      for (const call of mockListTrips.mock.calls) {
        expect(call[0].difficulty).toBeUndefined()
      }
    })
    expect(screen.getByLabelText(/filter by difficulty/i)).toHaveValue("")
  })
})
