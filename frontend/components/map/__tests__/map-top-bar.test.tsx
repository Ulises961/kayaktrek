import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MapTopBar } from "../map-top-bar"

const { mockUseBreadcrumbs } = vi.hoisted(() => ({ mockUseBreadcrumbs: vi.fn() }))

vi.mock("@/hooks/use-breadcrumbs", () => ({
  useBreadcrumbs: mockUseBreadcrumbs,
}))

const BASE_PROPS = {
  tripId: "01952f1a-0000-7000-8000-000000000001",
  tripName: "Cinque Terre",
  distanceUnit: "nm" as const,
  onDistanceUnitChange: vi.fn(),
  totalDistance: 12.5,
  dayCount: 2,
  isSaving: false,
  avgSpeedKnots: 2.5,
  onAvgSpeedKnotsChange: vi.fn(),
  viewMode: false,
  onToggleViewMode: vi.fn(),
  isLeader: true,
  tripState: null as null | "building" | "happening" | "past",
}

beforeEach(() => vi.clearAllMocks())

// Helper: scope queries to the desktop stats strip (the authoritative element).
// The compact mobile row renders the same values but is visually a secondary strip.
const statsStrip = () => screen.getByTestId("stats-strip")

describe("MapTopBar — breadcrumb (pushed to the global header, not rendered locally)", () => {
  it("pushes Trips / tripName / Itinerary when tripId is present", () => {
    render(<MapTopBar {...BASE_PROPS} />)
    expect(mockUseBreadcrumbs).toHaveBeenCalledWith([
      { label: "Trips", href: "/trips" },
      { label: "Cinque Terre", href: "/trips/01952f1a-0000-7000-8000-000000000001" },
      { label: "Itinerary" },
    ])
  })

  it("pushes Itineraries / Itinerary when tripId is null", () => {
    render(<MapTopBar {...BASE_PROPS} tripId={null} />)
    expect(mockUseBreadcrumbs).toHaveBeenCalledWith([
      { label: "Itineraries", href: "/itinerary" },
      { label: "Itinerary" },
    ])
  })

  it("does not render breadcrumb text itself", () => {
    render(<MapTopBar {...BASE_PROPS} />)
    expect(screen.queryByText("Trips")).not.toBeInTheDocument()
  })
})

describe("MapTopBar — stats strip", () => {
  it("displays the formatted distance", () => {
    render(<MapTopBar {...BASE_PROPS} totalDistance={12.5} distanceUnit="nm" />)
    expect(within(statsStrip()).getByText("12.5")).toBeInTheDocument()
  })

  it("displays the day count", () => {
    render(<MapTopBar {...BASE_PROPS} dayCount={2} />)
    expect(within(statsStrip()).getByText("2 days")).toBeInTheDocument()
  })

  it("uses singular 'day' for dayCount of 1", () => {
    render(<MapTopBar {...BASE_PROPS} dayCount={1} />)
    expect(within(statsStrip()).getByText("1 day")).toBeInTheDocument()
  })

  it("hides saving indicator when not saving", () => {
    render(<MapTopBar {...BASE_PROPS} isSaving={false} />)
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument()
  })

  it("shows 'Saving…' when saving", () => {
    render(<MapTopBar {...BASE_PROPS} isSaving={true} />)
    expect(screen.getByText("Saving…")).toBeInTheDocument()
  })
})

describe("MapTopBar — unit toggle", () => {
  it("renders both unit buttons (desktop strip + mobile row)", () => {
    render(<MapTopBar {...BASE_PROPS} distanceUnit="nm" />)
    expect(screen.getAllByRole("button", { name: "nm" })).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: "km" })).toHaveLength(2)
  })

  it("calls onDistanceUnitChange with 'km' when km is clicked", async () => {
    render(<MapTopBar {...BASE_PROPS} distanceUnit="nm" />)
    await userEvent.click(screen.getAllByRole("button", { name: "km" })[0])
    expect(BASE_PROPS.onDistanceUnitChange).toHaveBeenCalledWith("km")
  })

  it("calls onDistanceUnitChange with 'nm' when nm is clicked", async () => {
    render(<MapTopBar {...BASE_PROPS} distanceUnit="km" />)
    await userEvent.click(screen.getAllByRole("button", { name: "nm" })[0])
    expect(BASE_PROPS.onDistanceUnitChange).toHaveBeenCalledWith("nm")
  })

  it("converts distance to km when unit is km", () => {
    render(<MapTopBar {...BASE_PROPS} totalDistance={10} distanceUnit="km" />)
    // 10 nm × 1.852 = 18.520 → "18.5"
    expect(within(statsStrip()).getByText("18.5")).toBeInTheDocument()
  })
})

describe("MapTopBar — View/Edit segmented control", () => {
  it("marks View as the active segment in view mode", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} />)
    expect(screen.getByRole("button", { name: "View" })).toHaveAttribute("aria-pressed", "true")
  })

  it("marks Edit as the active segment in edit mode", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={false} />)
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true")
  })

  it("enables Edit for leader in view mode with building tripState", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} isLeader={true} tripState="building" />)
    expect(screen.getByRole("button", { name: "Edit" })).not.toBeDisabled()
  })

  it("enables Edit for leader in view mode with happening tripState", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} isLeader={true} tripState="happening" />)
    expect(screen.getByRole("button", { name: "Edit" })).not.toBeDisabled()
  })

  it("enables Edit for leader in view mode with null tripState", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} isLeader={true} tripState={null} />)
    expect(screen.getByRole("button", { name: "Edit" })).not.toBeDisabled()
  })

  it("disables Edit for crew", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} isLeader={false} tripState="building" />)
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled()
  })

  it("disables Edit in past tripState", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} isLeader={true} tripState="past" />)
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled()
  })

  it("keeps Edit enabled while already in edit mode, regardless of leader/tripState", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={false} isLeader={false} tripState="past" />)
    expect(screen.getByRole("button", { name: "Edit" })).not.toBeDisabled()
  })

  it("calls onToggleViewMode when Edit is clicked from view mode", async () => {
    const onToggleViewMode = vi.fn()
    render(
      <MapTopBar
        {...BASE_PROPS}
        viewMode={true}
        isLeader={true}
        tripState="building"
        onToggleViewMode={onToggleViewMode}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Edit" }))
    expect(onToggleViewMode).toHaveBeenCalledOnce()
  })

  it("calls onToggleViewMode when View is clicked from edit mode", async () => {
    const onToggleViewMode = vi.fn()
    render(<MapTopBar {...BASE_PROPS} viewMode={false} onToggleViewMode={onToggleViewMode} />)
    await userEvent.click(screen.getByRole("button", { name: "View" }))
    expect(onToggleViewMode).toHaveBeenCalledOnce()
  })

  it("does not call onToggleViewMode when clicking the already-active segment", async () => {
    const onToggleViewMode = vi.fn()
    render(<MapTopBar {...BASE_PROPS} viewMode={true} onToggleViewMode={onToggleViewMode} />)
    await userEvent.click(screen.getByRole("button", { name: "View" }))
    expect(onToggleViewMode).not.toHaveBeenCalled()
  })
})

describe("MapTopBar — Navigate segment", () => {
  it("is hidden by default", () => {
    render(<MapTopBar {...BASE_PROPS} />)
    expect(screen.queryByRole("button", { name: "Navigate" })).not.toBeInTheDocument()
  })

  it("is visible when showNavigate is true", () => {
    render(<MapTopBar {...BASE_PROPS} showNavigate={true} />)
    expect(screen.getByRole("button", { name: "Navigate" })).toBeInTheDocument()
  })

  it("marks Navigate as pressed when navigateMode is true", () => {
    render(<MapTopBar {...BASE_PROPS} showNavigate={true} navigateMode={true} />)
    expect(screen.getByRole("button", { name: "Navigate" })).toHaveAttribute("aria-pressed", "true")
  })

  it("marks Navigate as not pressed when navigateMode is false", () => {
    render(<MapTopBar {...BASE_PROPS} showNavigate={true} navigateMode={false} />)
    expect(screen.getByRole("button", { name: "Navigate" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })

  it("calls onToggleNavigate when Navigate is clicked", async () => {
    const onToggleNavigate = vi.fn()
    render(<MapTopBar {...BASE_PROPS} showNavigate={true} onToggleNavigate={onToggleNavigate} />)
    await userEvent.click(screen.getByRole("button", { name: "Navigate" }))
    expect(onToggleNavigate).toHaveBeenCalledOnce()
  })
})
