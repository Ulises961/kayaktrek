import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const {
  mockUseCollapseSidebar,
  mockUseFullBleedContent,
  mockUseBreadcrumbs,
  mockUseSearchParams,
  mockUsePositionWatch,
  mockUseLivePositions,
  mockGetStreamTicket,
  mockCloseDay,
} = vi.hoisted(() => ({
  mockUseCollapseSidebar: vi.fn(),
  mockUseFullBleedContent: vi.fn(),
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

vi.mock("@/hooks/use-collapse-sidebar", () => ({
  useCollapseSidebar: mockUseCollapseSidebar,
}))

vi.mock("@/hooks/use-full-bleed-content", () => ({
  useFullBleedContent: mockUseFullBleedContent,
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
      onMarkerClick?: (pointId: string) => void
      livePositions?: unknown[]
    }) {
      return (
        <div data-testid="map-core" data-live-position-count={props.livePositions?.length ?? 0}>
          <button onClick={() => props.onMarkerClick?.("p1")}>simulate-marker-click</button>
        </div>
      )
    },
}))

vi.mock("../point-list-pane", () => ({
  PointListPane: () => <div data-testid="point-list-pane" />,
}))

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
    expect(mockUseFullBleedContent).toHaveBeenCalled()
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

    expect(screen.getByTestId("day-rail")).toBeInTheDocument() // back in view mode
    expect(screen.getByText("Acquiring location…")).toBeInTheDocument()
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
    expect(screen.getByText("Sharing position · 2 crew live")).toBeInTheDocument()
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
    expect(screen.getByText("Location denied")).toBeInTheDocument()
  })

  it("auto-enters navigate mode from ?navigate=1 when showNavigate is true", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("navigate=1"))
    render(
      <MapBuilder
        itinerary={ITINERARY}
        tripId={TRIP_ID}
        tripName="Cinque Terre"
        showNavigate={true}
      />,
    )
    expect(screen.getByRole("button", { name: "Navigate" })).toHaveAttribute("aria-pressed", "true")
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
