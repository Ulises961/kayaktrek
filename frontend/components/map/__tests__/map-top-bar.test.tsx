import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MapTopBar } from "../map-top-bar"

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

describe("MapTopBar — navigation", () => {
  it("renders a back link to the trip", () => {
    render(<MapTopBar {...BASE_PROPS} />)
    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toBe("/trips/01952f1a-0000-7000-8000-000000000001")
  })

  it("displays the trip name in the back link", () => {
    render(<MapTopBar {...BASE_PROPS} />)
    expect(screen.getByText("Cinque Terre")).toBeInTheDocument()
  })

  it("links back to /itinerary when tripId is null", () => {
    render(<MapTopBar {...BASE_PROPS} tripId={null} />)
    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toBe("/itinerary")
  })

  it("shows 'Itineraries' label when tripId is null", () => {
    render(<MapTopBar {...BASE_PROPS} tripId={null} />)
    expect(screen.getByText("Itineraries")).toBeInTheDocument()
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

describe("MapTopBar — mode pill and edit/done buttons", () => {
  it("shows 'Viewing' pill in view mode", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} />)
    expect(screen.getByText("Viewing")).toBeInTheDocument()
  })

  it("shows 'Editing' pill in edit mode", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={false} />)
    expect(screen.getByText("Editing")).toBeInTheDocument()
  })

  it("shows 'Edit route' button for leader in view mode with building tripState", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} isLeader={true} tripState="building" />)
    expect(screen.getByRole("button", { name: "Edit route" })).toBeInTheDocument()
  })

  it("shows 'Edit route' button for leader in view mode with happening tripState", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} isLeader={true} tripState="happening" />)
    expect(screen.getByRole("button", { name: "Edit route" })).toBeInTheDocument()
  })

  it("shows 'Edit route' button for leader in view mode with null tripState", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} isLeader={true} tripState={null} />)
    expect(screen.getByRole("button", { name: "Edit route" })).toBeInTheDocument()
  })

  it("hides 'Edit route' button for crew", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} isLeader={false} tripState="building" />)
    expect(screen.queryByRole("button", { name: "Edit route" })).not.toBeInTheDocument()
  })

  it("hides 'Edit route' button in past tripState", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} isLeader={true} tripState="past" />)
    expect(screen.queryByRole("button", { name: "Edit route" })).not.toBeInTheDocument()
  })

  it("hides 'Edit route' button when already in edit mode", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={false} isLeader={true} tripState="building" />)
    expect(screen.queryByRole("button", { name: "Edit route" })).not.toBeInTheDocument()
  })

  it("shows 'Done' button in edit mode", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={false} />)
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument()
  })

  it("hides 'Done' button in view mode", () => {
    render(<MapTopBar {...BASE_PROPS} viewMode={true} />)
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument()
  })

  it("calls onToggleViewMode when 'Edit route' is clicked", async () => {
    const onToggleViewMode = vi.fn()
    render(<MapTopBar {...BASE_PROPS} viewMode={true} isLeader={true} tripState="building" onToggleViewMode={onToggleViewMode} />)
    await userEvent.click(screen.getByRole("button", { name: "Edit route" }))
    expect(onToggleViewMode).toHaveBeenCalledOnce()
  })

  it("calls onToggleViewMode when 'Done' is clicked", async () => {
    const onToggleViewMode = vi.fn()
    render(<MapTopBar {...BASE_PROPS} viewMode={false} onToggleViewMode={onToggleViewMode} />)
    await userEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onToggleViewMode).toHaveBeenCalledOnce()
  })
})
