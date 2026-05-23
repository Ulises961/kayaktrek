import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MapTopBar } from "../map-top-bar"

const BASE_PROPS = {
  tripId: "01952f1a-0000-7000-8000-000000000001",
  tripName: "Cinque Terre",
  mode: "drop" as const,
  onModeChange: vi.fn(),
  distanceUnit: "nm" as const,
  onDistanceUnitChange: vi.fn(),
  totalDistance: 12.5,
  dayCount: 2,
  isSaving: false,
}

beforeEach(() => vi.clearAllMocks())

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
})

describe("MapTopBar — mode toggle", () => {
  it("renders both mode buttons", () => {
    render(<MapTopBar {...BASE_PROPS} />)
    expect(screen.getByRole("button", { name: "Drop points" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Assign days" })).toBeInTheDocument()
  })

  it("calls onModeChange with 'assign' when Assign days is clicked", async () => {
    render(<MapTopBar {...BASE_PROPS} />)
    await userEvent.click(screen.getByRole("button", { name: "Assign days" }))
    expect(BASE_PROPS.onModeChange).toHaveBeenCalledWith("assign")
  })

  it("calls onModeChange with 'drop' when Drop points is clicked", async () => {
    render(<MapTopBar {...BASE_PROPS} mode="assign" />)
    await userEvent.click(screen.getByRole("button", { name: "Drop points" }))
    expect(BASE_PROPS.onModeChange).toHaveBeenCalledWith("drop")
  })
})

describe("MapTopBar — stats strip", () => {
  it("displays the formatted distance", () => {
    render(<MapTopBar {...BASE_PROPS} totalDistance={12.5} distanceUnit="nm" />)
    expect(screen.getByText("12.5")).toBeInTheDocument()
  })

  it("displays the day count", () => {
    render(<MapTopBar {...BASE_PROPS} dayCount={2} />)
    expect(screen.getByText("2 days")).toBeInTheDocument()
  })

  it("uses singular 'day' for dayCount of 1", () => {
    render(<MapTopBar {...BASE_PROPS} dayCount={1} />)
    expect(screen.getByText("1 day")).toBeInTheDocument()
  })

  it("shows 'All changes saved' when not saving", () => {
    render(<MapTopBar {...BASE_PROPS} isSaving={false} />)
    expect(screen.getByText("All changes saved")).toBeInTheDocument()
  })

  it("shows 'Saving…' when saving", () => {
    render(<MapTopBar {...BASE_PROPS} isSaving={true} />)
    expect(screen.getByText("Saving…")).toBeInTheDocument()
  })
})

describe("MapTopBar — unit toggle", () => {
  it("renders both unit buttons", () => {
    render(<MapTopBar {...BASE_PROPS} distanceUnit="nm" />)
    expect(screen.getByRole("button", { name: "nm" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "km" })).toBeInTheDocument()
  })

  it("calls onDistanceUnitChange with 'km' when km is clicked", async () => {
    render(<MapTopBar {...BASE_PROPS} distanceUnit="nm" />)
    await userEvent.click(screen.getByRole("button", { name: "km" }))
    expect(BASE_PROPS.onDistanceUnitChange).toHaveBeenCalledWith("km")
  })

  it("calls onDistanceUnitChange with 'nm' when nm is clicked", async () => {
    render(<MapTopBar {...BASE_PROPS} distanceUnit="km" />)
    await userEvent.click(screen.getByRole("button", { name: "nm" }))
    expect(BASE_PROPS.onDistanceUnitChange).toHaveBeenCalledWith("nm")
  })

  it("converts distance to km when unit is km", () => {
    render(<MapTopBar {...BASE_PROPS} totalDistance={10} distanceUnit="km" />)
    // 10 nm × 1.852 = 18.520 → "18.5"
    expect(screen.getByText("18.5")).toBeInTheDocument()
  })
})

describe("MapTopBar — remove last waypoint", () => {
  it("shows the button in drop mode when the handler is provided", () => {
    render(<MapTopBar {...BASE_PROPS} mode="drop" onRemoveLastWaypoint={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Remove last waypoint" })).toBeInTheDocument()
  })

  it("does not show the button in assign mode", () => {
    render(<MapTopBar {...BASE_PROPS} mode="assign" onRemoveLastWaypoint={vi.fn()} />)
    expect(screen.queryByRole("button", { name: "Remove last waypoint" })).not.toBeInTheDocument()
  })

  it("does not show the button when handler is not provided", () => {
    render(<MapTopBar {...BASE_PROPS} mode="drop" />)
    expect(screen.queryByRole("button", { name: "Remove last waypoint" })).not.toBeInTheDocument()
  })

  it("calls onRemoveLastWaypoint when clicked", async () => {
    const onRemove = vi.fn()
    render(<MapTopBar {...BASE_PROPS} mode="drop" onRemoveLastWaypoint={onRemove} />)
    await userEvent.click(screen.getByRole("button", { name: "Remove last waypoint" }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
