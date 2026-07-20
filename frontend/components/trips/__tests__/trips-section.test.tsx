import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trips/actions", () => ({
  listTrips: vi.fn(),
}))

import { listTrips } from "@/lib/trips/actions"
import { TripsSection, PLANNING_SORT_OPTIONS } from "../trips-section"
import { TRIP_STATE, TRIP_SORT, type Trip, type TripPage } from "@/lib/dtos/trip"

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

const NO_FILTERS = {}

beforeEach(() => {
  vi.clearAllMocks()
  mockListTrips.mockResolvedValue(page([]))
})

describe("TripsSection", () => {
  it("renders the initial trips without re-querying", () => {
    render(
      <TripsSection
        label="Planning"
        state={TRIP_STATE.BUILDING}
        initial={page([trip({ destination: "Fjords" })])}
        defaultSort={TRIP_SORT.SOONEST}
        filters={NO_FILTERS}
      />,
    )
    expect(screen.getByText("Fjords")).toBeInTheDocument()
    expect(mockListTrips).not.toHaveBeenCalled()
  })

  it("renders nothing when the section has no trips", () => {
    const { container } = render(
      <TripsSection
        label="Happening"
        state={TRIP_STATE.HAPPENING}
        initial={page([])}
        defaultSort={TRIP_SORT.LATEST_END}
        filters={NO_FILTERS}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("renders every trip in the section", () => {
    render(
      <TripsSection
        label="Planning"
        state={TRIP_STATE.BUILDING}
        initial={page(
          [trip({ destination: "Fjords" }), trip({ id: "b", destination: "Skerries" })],
          {
            total: 2,
          },
        )}
        defaultSort={TRIP_SORT.SOONEST}
        filters={NO_FILTERS}
      />,
    )
    expect(screen.getByText("Fjords")).toBeInTheDocument()
    expect(screen.getByText("Skerries")).toBeInTheDocument()
  })

  it("re-queries page 1 with the new sort and replaces items", async () => {
    mockListTrips.mockResolvedValue(page([trip({ id: "new", destination: "Sooner" })]))
    render(
      <TripsSection
        label="Planning"
        state={TRIP_STATE.BUILDING}
        initial={page([trip({ destination: "Later" })])}
        defaultSort={TRIP_SORT.SOONEST}
        sortOptions={PLANNING_SORT_OPTIONS}
        filters={NO_FILTERS}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText(/sort trips/i), TRIP_SORT.LATEST)
    await waitFor(() =>
      expect(mockListTrips).toHaveBeenCalledWith({
        state: TRIP_STATE.BUILDING,
        sort: TRIP_SORT.LATEST,
        page: 1,
      }),
    )
    await waitFor(() => expect(screen.getByText("Sooner")).toBeInTheDocument())
    expect(screen.queryByText("Later")).not.toBeInTheDocument()
  })

  it("does not offer a sort dropdown when sortOptions is omitted", () => {
    render(
      <TripsSection
        label="Happening"
        state={TRIP_STATE.HAPPENING}
        initial={page([trip()])}
        defaultSort={TRIP_SORT.LATEST_END}
        filters={NO_FILTERS}
      />,
    )
    expect(screen.queryByLabelText(/sort trips/i)).not.toBeInTheDocument()
  })

  it("refetches page 1 when the shared filters change", async () => {
    mockListTrips.mockResolvedValue(page([trip({ id: "filtered", destination: "Only match" })]))
    const { rerender } = render(
      <TripsSection
        label="Planning"
        state={TRIP_STATE.BUILDING}
        initial={page([trip({ destination: "Original" })])}
        defaultSort={TRIP_SORT.SOONEST}
        filters={{ difficulty: undefined }}
      />,
    )
    rerender(
      <TripsSection
        label="Planning"
        state={TRIP_STATE.BUILDING}
        initial={page([trip({ destination: "Original" })])}
        defaultSort={TRIP_SORT.SOONEST}
        filters={{ difficulty: "easy" }}
      />,
    )
    await waitFor(() =>
      expect(mockListTrips).toHaveBeenCalledWith({
        state: TRIP_STATE.BUILDING,
        sort: TRIP_SORT.SOONEST,
        page: 1,
        difficulty: "easy",
      }),
    )
    await waitFor(() => expect(screen.getByText("Only match")).toBeInTheDocument())
  })

  it("appends the next page on Load more, preserving prior items", async () => {
    mockListTrips.mockResolvedValue(
      page([trip({ id: "next", destination: "Second" })], { page: 2 }),
    )
    render(
      <TripsSection
        label="Planning"
        state={TRIP_STATE.BUILDING}
        initial={page([trip({ destination: "First" })], { pages: 2, total: 2 })}
        defaultSort={TRIP_SORT.SOONEST}
        filters={NO_FILTERS}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /load more/i }))
    await waitFor(() => expect(screen.getByText("Second")).toBeInTheDocument())
    expect(screen.getByText("First")).toBeInTheDocument()
  })

  it("does not show Load more once all pages are loaded", () => {
    render(
      <TripsSection
        label="Planning"
        state={TRIP_STATE.BUILDING}
        initial={page([trip()], { page: 1, pages: 1 })}
        defaultSort={TRIP_SORT.SOONEST}
        filters={NO_FILTERS}
      />,
    )
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument()
  })

  it("reports emptiness via onEmptyChange", () => {
    const onEmptyChange = vi.fn()
    render(
      <TripsSection
        label="Happening"
        state={TRIP_STATE.HAPPENING}
        initial={page([])}
        defaultSort={TRIP_SORT.LATEST_END}
        filters={NO_FILTERS}
        onEmptyChange={onEmptyChange}
      />,
    )
    expect(onEmptyChange).toHaveBeenCalledWith(true)
  })
})
