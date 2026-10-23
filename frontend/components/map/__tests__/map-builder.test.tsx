import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const {
  mockUseCollapseSidebar,
  mockUseContentLayout,
  mockUseBreadcrumbs,
  mockUseSearchParams,
  mockUsePositionWatch,
  mockUseLivePositions,
  mockGetStreamTicket,
  mockCloseDay,
} = vi.hoisted(() => ({
  mockUseCollapseSidebar: vi.fn(),
  mockUseContentLayout: vi.fn(),
  mockUseBreadcrumbs: vi.fn(),
  mockUseSearchParams: vi.fn(() => new URLSearchParams()),
  mockUsePositionWatch: vi.fn((): { status: string; lastSentAt: Date | null } => ({
    status: "off",
    lastSentAt: null,
  })),
  mockUseLivePositions: vi.fn((): { positions: { userId: string }[]; status: string } => ({
    positions: [],
    status: "idle",
  })),
  mockGetStreamTicket: vi.fn().mockResolvedValue(null),
  mockCloseDay: vi.fn().mockResolvedValue({ success: true }),
}))

const { mockToastError, mockToastInfo, mockToastDismiss } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastInfo: vi.fn(),
  mockToastDismiss: vi.fn(),
}))
vi.mock("sonner", () => ({
  toast: { error: mockToastError, info: mockToastInfo, dismiss: mockToastDismiss },
}))

vi.mock("@/hooks/use-collapse-sidebar", () => ({
  useCollapseSidebar: mockUseCollapseSidebar,
}))

vi.mock("@/hooks/use-content-layout", () => ({
  useContentLayout: mockUseContentLayout,
}))

vi.mock("@/hooks/use-breadcrumbs", () => ({
  useBreadcrumbs: mockUseBreadcrumbs,
}))

vi.mock("next/navigation", () => ({
  useSearchParams: mockUseSearchParams,
}))

vi.mock("@/hooks/use-position-watch", () => ({
  usePositionWatch: mockUsePositionWatch,
}))

vi.mock("@/hooks/use-live-positions", () => ({
  useLivePositions: mockUseLivePositions,
}))

vi.mock("@/lib/live/actions", () => ({
  getStreamTicket: mockGetStreamTicket,
  closeDay: mockCloseDay,
}))

vi.mock("next/dynamic", () => ({
  default: (_importFn: unknown, _opts?: unknown) =>
    function MockMapCore(props: {
      points?: { id?: string; latitude?: number | null; longitude?: number | null }[]
      onMarkerClick?: (pointId: string) => void
      onMapClick?: (lat: number, lng: number) => void
      onMarkerDragEnd?: (pointId: string, lat: number, lng: number) => void
      onLegClick?: (afterPointId: string, lat: number, lng: number) => void
      livePositions?: unknown[]
      discardablePointId?: string | null
      onUndoPendingPoint?: () => void
    }) {
      return (
        <div
          data-testid="map-core"
          data-live-position-count={props.livePositions?.length ?? 0}
          data-discardable-point-id={props.discardablePointId ?? ""}
        >
          {/* Exposes the points MapBuilder is actually rendering so tests can assert on
              optimistic-update outcomes (confirm/rollback/revert), not just that a handler
              prop exists. */}
          <div data-testid="map-core-points">{JSON.stringify(props.points ?? [])}</div>
          <button onClick={() => props.onMarkerClick?.("p1")}>simulate-marker-click</button>
          <button onClick={() => props.onMapClick?.(44.5, 14.5)}>simulate-map-click</button>
          <button onClick={() => props.onMarkerDragEnd?.("p1", 45, 15)}>
            simulate-marker-drag-end
          </button>
          <button onClick={() => props.onLegClick?.("p1", 44.2, 14.2)}>simulate-leg-click</button>
          <button onClick={() => props.onUndoPendingPoint?.()}>simulate-undo-pending-point</button>
        </div>
      )
    },
}))

vi.mock("../point-list-pane", async () => {
  const { useMapBuilder } = await import("@/lib/itinerary/map-builder-context")
  return {
    PointListPane: () => {
      const { draft } = useMapBuilder()
      return <div data-testid="point-list-pane" data-draft={draft === null ? "null" : "set"} />
    },
  }
})

vi.mock("../day-rail", () => ({
  DayRail: () => <div data-testid="day-rail" />,
}))

vi.mock("../feature-drawer", () => ({
  FeatureDrawer: () => <div data-testid="feature-drawer" />,
}))

vi.mock("../point-detail-sheet", async () => {
  const { useMapBuilder } = await import("@/lib/itinerary/map-builder-context")
  return {
    PointDetailSheet: () => {
      const { selectedPointId, selectedDayId } = useMapBuilder()
      return (
        <div data-testid="selected-info">
          {selectedPointId ?? "none"}|{selectedDayId ?? "none"}
        </div>
      )
    },
  }
})

vi.mock("@/lib/itinerary/actions", () => ({
  createDay: vi.fn().mockResolvedValue({ success: false }),
  updateDay: vi.fn().mockResolvedValue({ success: true }),
  deleteDay: vi.fn().mockResolvedValue({ success: true }),
  createPoint: vi.fn().mockResolvedValue({ success: false }),
  ensureStagingDay: vi.fn().mockResolvedValue({ success: false, error: "no staging day" }),
  setPointOrder: vi.fn().mockResolvedValue({ success: true }),
  updatePoint: vi.fn().mockResolvedValue({ success: true }),
  deletePoint: vi.fn().mockResolvedValue({ success: true }),
  assignPointsToDay: vi.fn().mockResolvedValue({ success: true }),
  updateItinerary: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/profile/actions", () => ({
  setUnitPreference: vi.fn().mockResolvedValue({ success: true }),
}))

import { MapBuilder } from "../map-builder"
import type { Itinerary } from "@/lib/dtos/itinerary"
import { setUnitPreference } from "@/lib/profile/actions"
import {
  createPoint,
  updatePoint,
  deletePoint,
  ensureStagingDay,
  setPointOrder,
} from "@/lib/itinerary/actions"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000030"
const ITINERARY_ID = "01952f1a-0000-7000-8000-000000000020"

const ITINERARY: Itinerary = {
  id: ITINERARY_ID,
  isPublic: false,
  totalMiles: 0,
  tripId: TRIP_ID,
  days: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks resets call history but not a prior test's .mockReturnValue —
  // restore the shared hoisted mocks to their defaults so tests never leak state.
  mockUseSearchParams.mockReturnValue(new URLSearchParams())
  mockUsePositionWatch.mockReturnValue({ status: "off", lastSentAt: null })
  mockUseLivePositions.mockReturnValue({ positions: [], status: "idle" })
  mockGetStreamTicket.mockResolvedValue(null)
})

describe("MapBuilder", () => {
  it("collapses the sidebar on mount", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(mockUseCollapseSidebar).toHaveBeenCalled()
  })

  it("requests full-bleed content on mount", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(mockUseContentLayout).toHaveBeenCalled()
  })

  it("renders the map top bar, pushing the trip name into the header breadcrumb", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(mockUseBreadcrumbs).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ label: "Cinque Terre" })]),
    )
  })

  it("renders the map core", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(screen.getByTestId("map-core")).toBeInTheDocument()
  })

  it("renders the day strip in view mode (default)", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(screen.getByTestId("day-rail")).toBeInTheDocument()
  })

  it("does not render point list pane in view mode (default)", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(screen.queryByTestId("point-list-pane")).not.toBeInTheDocument()
  })

  it("renders the point list pane in edit mode after clicking 'Edit'", async () => {
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        isLeader={true}
        tripState="building"
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Edit" }))
    expect(screen.getByTestId("point-list-pane")).toBeInTheDocument()
  })

  it("returns to view mode and shows day strip after clicking 'View'", async () => {
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        isLeader={true}
        tripState="building"
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Edit" }))
    await userEvent.click(screen.getByRole("button", { name: "View" }))
    expect(screen.getByTestId("day-rail")).toBeInTheDocument()
    expect(screen.queryByTestId("point-list-pane")).not.toBeInTheDocument()
  })

  it("counts only numbered days (excludes Day 0)", () => {
    const withDays: Itinerary = {
      ...ITINERARY,
      days: [{ dayNumber: 0 }, { dayNumber: 1 }, { dayNumber: 2 }],
    }
    render(<MapBuilder itinerary={withDays} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(within(screen.getByTestId("stats-strip")).getByText("2 days")).toBeInTheDocument()
  })

  it("shows 0 days for an empty itinerary", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(within(screen.getByTestId("stats-strip")).getByText("0 days")).toBeInTheDocument()
  })

  it("initializes the distance unit from initialDistanceUnit", () => {
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        initialDistanceUnit={DISTANCE_UNIT.KM}
      />,
    )
    expect(
      within(screen.getByTestId("stats-strip")).getByRole("button", { name: "km" }),
    ).toHaveClass("bg-muted")
  })

  it("persists the unit preference when the toggle is clicked", async () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    await userEvent.click(
      within(screen.getByTestId("stats-strip")).getByRole("button", { name: "km" }),
    )
    expect(setUnitPreference).toHaveBeenCalledWith(DISTANCE_UNIT.KM)
  })

  it("view mode: clicking a map marker selects the point and its day", async () => {
    const withPoint: Itinerary = {
      ...ITINERARY,
      days: [
        {
          dayNumber: 1,
          id: "day-1",
          points: [{ id: "p1", type: "stop", latitude: 44, longitude: 14, dayId: "day-1" }],
        },
      ],
    }
    render(<MapBuilder itinerary={withPoint} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(screen.getByTestId("selected-info")).toHaveTextContent("none|none")
    await userEvent.click(screen.getByText("simulate-marker-click"))
    expect(screen.getByTestId("selected-info")).toHaveTextContent("p1|day-1")
  })

  it("edit mode: clicking a map marker does not touch view-mode selection", async () => {
    const withPoint: Itinerary = {
      ...ITINERARY,
      days: [
        {
          dayNumber: 1,
          id: "day-1",
          points: [{ id: "p1", type: "stop", latitude: 44, longitude: 14, dayId: "day-1" }],
        },
      ],
    }
    render(
      <MapBuilder
        itinerary={withPoint}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        isLeader={true}
        tripState="building"
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Edit" }))
    await userEvent.click(screen.getByText("simulate-marker-click"))
    expect(screen.queryByTestId("selected-info")).not.toBeInTheDocument()
  })
})

describe("MapBuilder — dropping a point on the map", () => {
  const withDay0: Itinerary = {
    ...ITINERARY,
    days: [{ dayNumber: 0, id: "day-0", points: [] }],
  }

  it("does not mark the draft dirty when there is no numbered day to walk the point into", async () => {
    // Day 0 only (bootstrap state) — there is no last day for the tail rule to
    // extend, so Save days must stay disabled until "Add day" creates one.
    vi.mocked(createPoint).mockResolvedValueOnce({
      success: true,
      point: {
        id: "confirmed-1",
        type: "position",
        latitude: 44.5,
        longitude: 14.5,
        dayId: "day-0",
      },
    })
    render(<MapBuilder itinerary={withDay0} tripId={TRIP_ID} tripName="Cinque Terre" />)
    await userEvent.click(screen.getByRole("button", { name: "Edit" }))

    await userEvent.click(screen.getByText("simulate-map-click"))

    await waitFor(() =>
      expect(screen.getByTestId("map-core-points")).toHaveTextContent(/"id":"confirmed-1"/),
    )
    expect(screen.getByTestId("point-list-pane")).toHaveAttribute("data-draft", "null")
  })

  it("marks the draft dirty as soon as a point lands in day 0 with a numbered day present", async () => {
    // The point isn't reassigned to the last day server-side until Save — this
    // only needs to enable the button, via the same implicit-draft mechanism a
    // boundary drag uses.
    const withNumberedDay: Itinerary = {
      ...ITINERARY,
      days: [
        { dayNumber: 0, id: "day-0", points: [] },
        {
          dayNumber: 1,
          id: "day-1",
          startPointId: "p1",
          endPointId: "p1",
          points: [{ id: "p1", type: "stop", latitude: 44.0, longitude: 14.0, dayId: "day-1" }],
        },
      ],
    }
    vi.mocked(createPoint).mockResolvedValueOnce({
      success: true,
      point: {
        id: "confirmed-1",
        type: "position",
        latitude: 44.5,
        longitude: 14.5,
        dayId: "day-0",
      },
    })
    render(<MapBuilder itinerary={withNumberedDay} tripId={TRIP_ID} tripName="Cinque Terre" />)
    await userEvent.click(screen.getByRole("button", { name: "Edit" }))

    expect(screen.getByTestId("point-list-pane")).toHaveAttribute("data-draft", "null")

    await userEvent.click(screen.getByText("simulate-map-click"))

    await waitFor(() =>
      expect(screen.getByTestId("point-list-pane")).toHaveAttribute("data-draft", "set"),
    )
  })

  it("confirms the optimistically-added point with the server id on success", async () => {
    vi.mocked(createPoint).mockResolvedValueOnce({
      success: true,
      point: {
        id: "confirmed-1",
        type: "position",
        latitude: 44.5,
        longitude: 14.5,
        dayId: "day-0",
      },
    })
    render(<MapBuilder itinerary={withDay0} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-map-click"))

    await waitFor(() =>
      expect(screen.getByTestId("map-core-points")).toHaveTextContent(/"id":"confirmed-1"/),
    )
    expect(screen.getByTestId("map-core-points")).not.toHaveTextContent(/tmp-/)
  })

  it("rolls back the optimistically-added point when createPoint fails, leaving no orphan on the map", async () => {
    vi.mocked(createPoint).mockResolvedValueOnce({
      success: false,
      error: "Failed to create point.",
    })
    render(<MapBuilder itinerary={withDay0} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-map-click"))

    await waitFor(() => expect(createPoint).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId("map-core-points")).toHaveTextContent("[]"))
  })
})

describe("MapBuilder — discarding the tail point", () => {
  const withDay0: Itinerary = {
    ...ITINERARY,
    days: [{ dayNumber: 0, id: "day-0", points: [] }],
  }

  it("exposes the confirmed tail point as discardablePointId so the marker can offer a discard control", async () => {
    vi.mocked(createPoint).mockResolvedValueOnce({
      success: true,
      point: {
        id: "confirmed-1",
        type: "position",
        latitude: 44.5,
        longitude: 14.5,
        dayId: "day-0",
      },
    })
    render(<MapBuilder itinerary={withDay0} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-map-click"))

    await waitFor(() =>
      expect(screen.getByTestId("map-core")).toHaveAttribute(
        "data-discardable-point-id",
        "confirmed-1",
      ),
    )
  })

  it("withholds discardablePointId while the tail is still an unconfirmed optimistic add", async () => {
    // Deleting the real point requires its server id — undoing before createPoint
    // resolves would delete nothing and orphan the row createPoint is about to
    // persist, so the discard control must not be offered yet.
    let resolveCreate!: (value: Awaited<ReturnType<typeof createPoint>>) => void
    vi.mocked(createPoint).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )
    render(<MapBuilder itinerary={withDay0} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-map-click"))

    expect(screen.getByTestId("map-core")).toHaveAttribute("data-discardable-point-id", "")

    resolveCreate({
      success: true,
      point: { id: "confirmed-1", type: "position", latitude: 44.5, longitude: 14.5 },
    })
    await waitFor(() =>
      expect(screen.getByTestId("map-core")).toHaveAttribute(
        "data-discardable-point-id",
        "confirmed-1",
      ),
    )
  })

  it("hands the discard control to the new tail once the old tail is removed", async () => {
    vi.mocked(createPoint)
      .mockResolvedValueOnce({
        success: true,
        point: {
          id: "confirmed-1",
          type: "position",
          latitude: 44.5,
          longitude: 14.5,
          dayId: "day-0",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        point: {
          id: "confirmed-2",
          type: "position",
          latitude: 44.7,
          longitude: 14.7,
          dayId: "day-0",
        },
      })
    render(<MapBuilder itinerary={withDay0} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-map-click"))
    await waitFor(() =>
      expect(screen.getByTestId("map-core")).toHaveAttribute(
        "data-discardable-point-id",
        "confirmed-1",
      ),
    )

    await userEvent.click(screen.getByText("simulate-map-click"))
    await waitFor(() =>
      expect(screen.getByTestId("map-core")).toHaveAttribute(
        "data-discardable-point-id",
        "confirmed-2",
      ),
    )

    await userEvent.click(screen.getByText("simulate-undo-pending-point"))

    await waitFor(() =>
      expect(screen.getByTestId("map-core")).toHaveAttribute(
        "data-discardable-point-id",
        "confirmed-1",
      ),
    )
    expect(deletePoint).toHaveBeenCalledWith("confirmed-2")
  })

  it("removes the point on the map and deletes it server-side when the discard control is used", async () => {
    vi.mocked(createPoint).mockResolvedValueOnce({
      success: true,
      point: {
        id: "confirmed-1",
        type: "position",
        latitude: 44.5,
        longitude: 14.5,
        dayId: "day-0",
      },
    })
    render(<MapBuilder itinerary={withDay0} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-map-click"))
    await waitFor(() =>
      expect(screen.getByTestId("map-core-points")).toHaveTextContent(/"id":"confirmed-1"/),
    )

    await userEvent.click(screen.getByText("simulate-undo-pending-point"))

    await waitFor(() => expect(screen.getByTestId("map-core-points")).toHaveTextContent("[]"))
    expect(deletePoint).toHaveBeenCalledWith("confirmed-1")
  })
})

describe("MapBuilder — an itinerary that arrived without its Day 0", () => {
  // A clone of a hand-built route used to reach the builder with no staging day, and
  // every map click returned from the handler without a request, a toast, or a marker.
  const withoutDay0: Itinerary = { ...ITINERARY, days: [] }

  it("provisions the staging day and drops the point into it", async () => {
    vi.mocked(ensureStagingDay).mockResolvedValueOnce({
      success: true,
      day: { id: "healed-day-0", dayNumber: 0, points: [] },
    })
    vi.mocked(createPoint).mockResolvedValueOnce({
      success: true,
      point: {
        id: "confirmed-1",
        type: "position",
        latitude: 44.5,
        longitude: 14.5,
        dayId: "healed-day-0",
      },
    })
    render(<MapBuilder itinerary={withoutDay0} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-map-click"))

    await waitFor(() => expect(ensureStagingDay).toHaveBeenCalledWith(ITINERARY_ID))
    expect(createPoint).toHaveBeenCalledWith("healed-day-0", {
      type: "position",
      latitude: 44.5,
      longitude: 14.5,
    })
    await waitFor(() =>
      expect(screen.getByTestId("map-core-points")).toHaveTextContent(/"id":"confirmed-1"/),
    )
  })

  it("provisions it once, not on every click", async () => {
    vi.mocked(ensureStagingDay).mockResolvedValueOnce({
      success: true,
      day: { id: "healed-day-0", dayNumber: 0, points: [] },
    })
    vi.mocked(createPoint).mockResolvedValue({
      success: true,
      point: {
        id: "confirmed-1",
        type: "position",
        latitude: 44.5,
        longitude: 14.5,
        dayId: "healed-day-0",
      },
    })
    render(<MapBuilder itinerary={withoutDay0} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-map-click"))
    await waitFor(() => expect(createPoint).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByText("simulate-map-click"))
    await waitFor(() => expect(createPoint).toHaveBeenCalledTimes(2))

    expect(ensureStagingDay).toHaveBeenCalledTimes(1)
  })

  it("tells the user and adds nothing when the staging day cannot be provisioned", async () => {
    vi.mocked(ensureStagingDay).mockResolvedValueOnce({
      success: false,
      error: "Failed to prepare the itinerary for editing.",
    })
    render(<MapBuilder itinerary={withoutDay0} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-map-click"))

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("Failed to prepare the itinerary for editing."),
    )
    expect(createPoint).not.toHaveBeenCalled()
    // No optimistic marker left stranded on the map either.
    expect(screen.getByTestId("map-core-points")).toHaveTextContent("[]")
  })
})

describe("MapBuilder — dropping a point on a leg", () => {
  // Points could only ever be appended to the tail: create had no way to express a
  // position in the chain, and `pointOrder` — the client's canonical order since
  // M4b — had no verb to send it back.
  const withRoute: Itinerary = {
    ...ITINERARY,
    days: [
      {
        dayNumber: 0,
        id: "day-0",
        points: [
          { id: "p1", type: "stop", latitude: 44, longitude: 14, dayId: "day-0" },
          { id: "p2", type: "stop", latitude: 45, longitude: 15, dayId: "day-0" },
        ],
      },
    ],
  }

  const inserted = {
    id: "inserted-1",
    type: "position" as const,
    latitude: 44.2,
    longitude: 14.2,
    dayId: "day-0",
  }

  it("splices the point between the two it was dropped between, on the map and on the server", async () => {
    vi.mocked(createPoint).mockResolvedValueOnce({ success: true, point: inserted })
    render(<MapBuilder itinerary={withRoute} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-leg-click"))

    await waitFor(() => expect(createPoint).toHaveBeenCalled())
    expect(createPoint).toHaveBeenCalledWith("day-0", {
      type: "position",
      latitude: 44.2,
      longitude: 14.2,
      afterPointId: "p1",
    })

    // The rendered route is the one that matters: between p1 and p2, not appended.
    await waitFor(() => {
      const ids = JSON.parse(screen.getByTestId("map-core-points").textContent!).map(
        (p: { id: string }) => p.id,
      )
      expect(ids).toEqual(["p1", "inserted-1", "p2"])
    })
  })

  it("sends the whole order once the real id exists, never with the temp one", async () => {
    vi.mocked(createPoint).mockResolvedValueOnce({ success: true, point: inserted })
    render(<MapBuilder itinerary={withRoute} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-leg-click"))

    await waitFor(() =>
      expect(setPointOrder).toHaveBeenCalledWith(ITINERARY_ID, ["p1", "inserted-1", "p2"]),
    )
    // An order carrying a temp id is a set the server cannot match — it would 409
    // for a reason of our own making.
    for (const [, order] of vi.mocked(setPointOrder).mock.calls) {
      expect(order.some((id) => id.startsWith("tmp-"))).toBe(false)
    }
  })

  it("rolls the insert off the map and says why when the create fails", async () => {
    vi.mocked(createPoint).mockResolvedValueOnce({
      success: false,
      error: "Failed to create point.",
    })
    render(<MapBuilder itinerary={withRoute} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-leg-click"))

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Failed to create point."))
    const ids = JSON.parse(screen.getByTestId("map-core-points").textContent!).map(
      (p: { id: string }) => p.id,
    )
    expect(ids).toEqual(["p1", "p2"])
    // Nothing to reconcile — the point was never created.
    expect(setPointOrder).not.toHaveBeenCalled()
  })

  it("keeps the point and reports the failure when only the order save fails", async () => {
    // `afterPointId` already put the point in the right place server-side, so the
    // route on screen is the route that was saved — rolling it back would be a lie.
    vi.mocked(createPoint).mockResolvedValueOnce({ success: true, point: inserted })
    vi.mocked(setPointOrder).mockResolvedValueOnce({
      success: false,
      error: "Failed to save the route order.",
    })
    render(<MapBuilder itinerary={withRoute} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-leg-click"))

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("Failed to save the route order."),
    )
    const ids = JSON.parse(screen.getByTestId("map-core-points").textContent!).map(
      (p: { id: string }) => p.id,
    )
    expect(ids).toEqual(["p1", "inserted-1", "p2"])
  })
})

describe("MapBuilder — dragging a point marker", () => {
  const withPoint: Itinerary = {
    ...ITINERARY,
    days: [
      {
        dayNumber: 1,
        id: "day-1",
        points: [{ id: "p1", type: "stop", latitude: 44, longitude: 14, dayId: "day-1" }],
      },
    ],
  }

  it("persists the dragged position via updatePoint", async () => {
    vi.mocked(updatePoint).mockResolvedValueOnce({
      success: true,
      point: { id: "p1", type: "stop", latitude: 45, longitude: 15, dayId: "day-1" },
    })
    render(<MapBuilder itinerary={withPoint} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-marker-drag-end"))

    await waitFor(() =>
      expect(updatePoint).toHaveBeenCalledWith("p1", { latitude: 45, longitude: 15 }),
    )
    expect(screen.getByTestId("map-core-points")).toHaveTextContent(/"latitude":45/)
  })

  it("reverts the marker to its original position when the drag-end save fails", async () => {
    vi.mocked(updatePoint).mockResolvedValueOnce({
      success: false,
      error: "Failed to update point.",
    })
    render(<MapBuilder itinerary={withPoint} tripId={TRIP_ID} tripName="Cinque Terre" />)

    await userEvent.click(screen.getByText("simulate-marker-drag-end"))

    // The drag was attempted (and failed) at the dragged-to coordinates...
    await waitFor(() =>
      expect(updatePoint).toHaveBeenCalledWith("p1", { latitude: 45, longitude: 15 }),
    )
    // ...but the marker ends up back where it started, not stuck at an unsaved position.
    await waitFor(() =>
      expect(screen.getByTestId("map-core-points")).toHaveTextContent(/"latitude":44/),
    )
    expect(screen.getByTestId("map-core-points")).not.toHaveTextContent(/"latitude":45/)
  })
})

describe("MapBuilder — Navigate mode", () => {
  it("does not render the Navigate segment when showNavigate is false", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(screen.queryByRole("button", { name: "Navigate" })).not.toBeInTheDocument()
  })

  it("renders the Navigate segment when showNavigate is true", () => {
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
      />,
    )
    expect(screen.getByRole("button", { name: "Navigate" })).toBeInTheDocument()
  })

  it("forces view mode and shows the status chip when Navigate is toggled on from edit mode", async () => {
    mockUsePositionWatch.mockReturnValue({ status: "acquiring", lastSentAt: null })
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
        isLeader={true}
        tripState="happening"
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Edit" }))
    expect(screen.getByTestId("point-list-pane")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))
    await userEvent.click(screen.getByRole("button", { name: /start sharing/i }))

    expect(screen.getByTestId("day-rail")).toBeInTheDocument() // back in view mode
    expect(screen.getByText("Acquiring location…")).toBeInTheDocument()
  })

  it("shows the consent dialog naming who receives the position, and does not enter navigate mode until confirmed", async () => {
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))

    // The trigger is legitimately hidden from the accessibility tree while the modal
    // is open (Radix suppresses background content for a screen reader), so the proof
    // navigate mode hasn't started is its absence, not a pressed-state check on a
    // button that can't be queried right now.
    expect(screen.getByText(/share your live position/i)).toBeInTheDocument()
    expect(screen.queryByTestId("navigate-chrome")).not.toBeInTheDocument()
  })

  it("leaves navigate mode off when the consent dialog is cancelled", async () => {
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))

    expect(screen.getByRole("button", { name: "Navigate" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
    expect(screen.queryByText(/share your live position/i)).not.toBeInTheDocument()
  })

  it("does not show the consent dialog again when turning navigate off", async () => {
    mockUsePositionWatch.mockReturnValue({ status: "acquiring", lastSentAt: null })
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))
    await userEvent.click(screen.getByRole("button", { name: /start sharing/i }))
    expect(screen.getByRole("button", { name: "Navigate" })).toHaveAttribute("aria-pressed", "true")

    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))

    expect(screen.queryByText(/share your live position/i)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Navigate" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })

  it("shows the sharing label with the live crew count once position sending starts", async () => {
    mockUsePositionWatch.mockReturnValue({ status: "sending", lastSentAt: new Date() })
    mockUseLivePositions.mockReturnValue({
      positions: [{ userId: "u1" }, { userId: "u2" }],
      status: "live",
    })
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))
    await userEvent.click(screen.getByRole("button", { name: /start sharing/i }))
    // The chip drops "position" and "crew" on a phone, so the sentence is split
    // across `sr-only` spans rather than being one text node. Asserted on the
    // element's text content, which is what a screen reader reads and is therefore
    // the thing that must stay whole at every width — `getByText` would only prove
    // the label happens to be unsplit today.
    expect(screen.getByTestId("navigate-chrome")).toHaveTextContent(
      "Sharing position · 2 crew live",
    )
    expect(screen.getByTestId("map-core")).toHaveAttribute("data-live-position-count", "2")
  })

  it("shows the Close day control to the leader in navigate mode", async () => {
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
        isLeader={true}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))
    await userEvent.click(screen.getByRole("button", { name: /start sharing/i }))
    expect(screen.getByRole("button", { name: /close day/i })).toBeInTheDocument()
  })

  it("hides the Close day control from crew in navigate mode", async () => {
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
        isLeader={false}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))
    await userEvent.click(screen.getByRole("button", { name: /start sharing/i }))
    expect(screen.queryByRole("button", { name: /close day/i })).not.toBeInTheDocument()
  })

  it("leaving View for Edit also exits Navigate mode (Edit and Navigate are mutually exclusive)", async () => {
    mockUsePositionWatch.mockReturnValue({ status: "acquiring", lastSentAt: null })
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
        isLeader={true}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))
    await userEvent.click(screen.getByRole("button", { name: /start sharing/i }))
    expect(screen.getByText("Acquiring location…")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Edit" }))

    expect(screen.getByTestId("point-list-pane")).toBeInTheDocument() // back in edit mode
    expect(screen.queryByText("Acquiring location…")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /close day/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Navigate" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })

  it("shows a denied label when location access is denied", async () => {
    mockUsePositionWatch.mockReturnValue({ status: "denied", lastSentAt: null })
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))
    await userEvent.click(screen.getByRole("button", { name: /start sharing/i }))
    expect(screen.getByText("Location denied")).toBeInTheDocument()
  })

  it("opens the consent dialog (rather than entering navigate mode directly) from ?navigate=1", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("navigate=1"))
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
      />,
    )
    // Trigger is hidden from the a11y tree while the modal is open — see the note in
    // the button-click version of this assertion above.
    expect(screen.getByText(/share your live position/i)).toBeInTheDocument()
    expect(screen.queryByTestId("navigate-chrome")).not.toBeInTheDocument()
  })

  it("enters navigate mode from ?navigate=1 once the deep-link-triggered dialog is confirmed", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("navigate=1"))
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: /start sharing/i }))

    expect(screen.getByRole("button", { name: "Navigate" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByText(/share your live position/i)).not.toBeInTheDocument()
  })

  it("ignores ?navigate=1 when the caller is not allowed to navigate", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("navigate=1"))
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={false}
      />,
    )
    expect(screen.queryByRole("button", { name: "Navigate" })).not.toBeInTheDocument()
    expect(screen.getByTestId("day-rail")).toBeInTheDocument()
  })
})

describe("MapBuilder — Navigate mode when inReach is the source (M29)", () => {
  function renderWithInReach() {
    return render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
        inReachIsSource={true}
        tripState="happening"
      />,
    )
  }

  it("enters Navigate on the first press and asks nothing: nothing from the device is shared", async () => {
    renderWithInReach()

    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))

    expect(screen.queryByText(/share your live position/i)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Navigate" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("navigate-chrome")).toBeInTheDocument()
  })

  it("never turns the phone's position sharing on", async () => {
    renderWithInReach()
    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))

    expect(mockUsePositionWatch).not.toHaveBeenCalledWith(TRIP_ID, true)
    expect(mockUsePositionWatch).toHaveBeenLastCalledWith(TRIP_ID, false)
  })

  it("says where the position comes from, with the live crew count", async () => {
    mockUseLivePositions.mockReturnValue({
      positions: [{ userId: "u1" }, { userId: "u2" }],
      status: "live",
    })
    renderWithInReach()
    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))

    // The same split-across-`sr-only` chip as the device label, so the sentence is
    // asserted whole on the element's text content.
    expect(screen.getByTestId("navigate-chrome")).toHaveTextContent("inReach · 2 crew live")
    expect(screen.queryByText("Acquiring location…")).not.toBeInTheDocument()
    expect(screen.queryByText("Location denied")).not.toBeInTheDocument()
  })

  it("still shows the crew's positions on the map", async () => {
    mockUseLivePositions.mockReturnValue({
      positions: [{ userId: "u1" }, { userId: "u2" }],
      status: "live",
    })
    renderWithInReach()
    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))

    expect(screen.getByTestId("map-core")).toHaveAttribute("data-live-position-count", "2")
  })

  it("enters Navigate straight from ?navigate=1, with no dialog", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("navigate=1"))
    renderWithInReach()

    expect(screen.queryByText(/share your live position/i)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Navigate" })).toHaveAttribute("aria-pressed", "true")
    expect(mockUsePositionWatch).not.toHaveBeenCalledWith(TRIP_ID, true)
  })

  it("turns Navigate off again with one press", async () => {
    renderWithInReach()
    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))

    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))

    expect(screen.getByRole("button", { name: "Navigate" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
    expect(screen.queryByTestId("navigate-chrome")).not.toBeInTheDocument()
  })

  it("leaves Navigate exactly as it was when inReach is not the source", async () => {
    mockUsePositionWatch.mockReturnValue({ status: "acquiring", lastSentAt: null })
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
        inReachIsSource={false}
        tripState="happening"
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))
    expect(screen.getByText(/share your live position/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /start sharing/i }))

    expect(mockUsePositionWatch).toHaveBeenLastCalledWith(TRIP_ID, true)
    expect(screen.getByText("Acquiring location…")).toBeInTheDocument()
  })
})

describe("MapBuilder — other people's changes (M36)", () => {
  // The builder seeds its reducer from the itinerary prop once, so a router.refresh() that
  // brings someone else's edit changed nothing on screen until it applied the new props.
  function itineraryWithPointNamed(name: string): Itinerary {
    return {
      ...ITINERARY,
      days: [
        {
          id: "day-0",
          dayNumber: 0,
          points: [
            {
              id: "p1",
              name,
              type: "position",
              latitude: 44.1,
              longitude: 14.1,
              dayId: "day-0",
            },
          ],
        },
      ],
    } as unknown as Itinerary
  }

  it("shows another person's edit once the page re-renders with it, with nothing to confirm", () => {
    const { rerender } = render(
      <MapBuilder
        itinerary={itineraryWithPointNamed("Cala")}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
      />,
    )
    expect(screen.getByTestId("map-core-points")).toHaveTextContent("Cala")

    rerender(
      <MapBuilder
        itinerary={itineraryWithPointNamed("Cala Mondragó")}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
      />,
    )

    expect(screen.getByTestId("map-core-points")).toHaveTextContent("Cala Mondragó")
    expect(mockToastInfo).not.toHaveBeenCalled()
  })

  it("leaves a point the user is still naming alone, and offers the other version instead", async () => {
    vi.mocked(createPoint).mockResolvedValue({
      success: true,
      point: {
        id: "confirmed-1",
        type: "position",
        latitude: 44.5,
        longitude: 14.5,
        dayId: "day-0",
      },
    })
    const { rerender } = render(
      <MapBuilder
        itinerary={itineraryWithPointNamed("Cala")}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
      />,
    )
    // A dropped point stays "pending" — waiting to be named — after it is saved.
    await userEvent.click(screen.getByText("simulate-map-click"))
    await waitFor(() =>
      expect(screen.getByTestId("map-core-points")).toHaveTextContent("confirmed-1"),
    )

    rerender(
      <MapBuilder
        itinerary={itineraryWithPointNamed("Cala Mondragó")}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
      />,
    )

    await waitFor(() =>
      expect(mockToastInfo).toHaveBeenCalledWith(
        expect.stringMatching(/someone else changed this route/i),
        expect.objectContaining({
          action: expect.objectContaining({ label: "Load their version" }),
        }),
      ),
    )
    // Their edit is not applied over the point being named...
    expect(screen.getByTestId("map-core-points")).not.toHaveTextContent("Cala Mondragó")
    expect(screen.getByTestId("map-core-points")).toHaveTextContent("confirmed-1")

    // ...until the user chooses it, which drops the unsaved point and shows theirs.
    const offer = mockToastInfo.mock.calls[0][1] as { action: { onClick: () => void } }
    act(() => offer.action.onClick())

    expect(screen.getByTestId("map-core-points")).toHaveTextContent("Cala Mondragó")
    expect(screen.getByTestId("map-core-points")).not.toHaveTextContent("confirmed-1")
  })
})
