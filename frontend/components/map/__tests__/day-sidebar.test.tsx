import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { DaySidebar } from "../day-sidebar"
import type { Day } from "@/lib/dtos/day"
import type { Point } from "@/lib/dtos/point"
import type { SlideState } from "@/lib/itinerary/map-reducer"

const ITIN_ID = "01952f1a-0000-7000-8000-000000000001"
const D1_ID = "01952f1a-0000-7000-8000-000000000010"
const P1_ID = "01952f1a-0000-7000-8000-000000000021"
const P2_ID = "01952f1a-0000-7000-8000-000000000022"
const P3_ID = "01952f1a-0000-7000-8000-000000000023"

const points: Point[] = [
  { id: P1_ID, type: "stop", dayId: D1_ID, latitude: 44, longitude: 14 },
  { id: P2_ID, type: "position", dayId: D1_ID, latitude: 44.1, longitude: 14.1, name: "Harbour" },
  { id: P3_ID, type: "position", dayId: D1_ID, latitude: 44.2, longitude: 14.2 },
]

const pointOrder = [P1_ID, P2_ID, P3_ID]

const day1: Day = {
  id: D1_ID,
  dayNumber: 1,
  itineraryId: ITIN_ID,
  startPointId: P1_ID,
  endPointId: P2_ID,
}

const defaultProps = {
  days: [day1],
  points,
  pointOrder,
  slideState: null as SlideState | null,
  distanceUnit: "nm" as const,
  onEditDay: vi.fn(),
  onDeleteDay: vi.fn(),
  onDateChange: vi.fn(),
  onAddDay: vi.fn(),
}

describe("DaySidebar", () => {
  it("shows a prompt when no days exist", () => {
    render(<DaySidebar {...defaultProps} days={[]} points={[]} pointOrder={[]} />)
    expect(screen.getByText(/switch to assign days mode/i)).toBeTruthy()
  })

  it("renders a card for each day", () => {
    render(<DaySidebar {...defaultProps} />)
    expect(screen.getByText(/day 1/i)).toBeTruthy()
  })

  it("shows positional label (Point 1) for unnamed start point", () => {
    render(<DaySidebar {...defaultProps} />)
    expect(screen.getByText("Point 1")).toBeTruthy()
  })

  it("shows point name in END slot when point has a name", () => {
    render(<DaySidebar {...defaultProps} />)
    expect(screen.getByText("Harbour")).toBeTruthy()
  })

  it("shows hovered point label in END slot during slide for the active day", () => {
    const slideState: SlideState = {
      dayId: D1_ID,
      boundaryPointId: P1_ID,
      firstAssignableId: P1_ID,
      hoveredPointId: P3_ID,
    }
    render(<DaySidebar {...defaultProps} slideState={slideState} />)
    expect(screen.getByText("Point 3")).toBeTruthy()
  })

  it("shows slide prompt in END slot when slide is active but nothing hovered yet", () => {
    const slideState: SlideState = {
      dayId: D1_ID,
      boundaryPointId: P1_ID,
      firstAssignableId: P1_ID,
      hoveredPointId: null,
    }
    render(<DaySidebar {...defaultProps} slideState={slideState} />)
    expect(screen.getByText(/hover a marker/i)).toBeTruthy()
  })

  it("shows click prompt in START slot when day1 has no boundary yet", () => {
    const slideState: SlideState = {
      dayId: D1_ID,
      boundaryPointId: null,
      firstAssignableId: null,
      hoveredPointId: null,
    }
    const day: Day = { id: D1_ID, dayNumber: 1, itineraryId: ITIN_ID }
    render(<DaySidebar {...defaultProps} days={[day]} slideState={slideState} />)
    expect(screen.getByText(/click a marker/i)).toBeTruthy()
  })

  it("shows reassign and delete buttons on the last day in a multi-day list", () => {
    const D2_ID = "01952f1a-0000-7000-8000-000000000011"
    const day2: Day = { id: D2_ID, dayNumber: 2, itineraryId: ITIN_ID, startPointId: P2_ID, endPointId: P3_ID }
    render(<DaySidebar {...defaultProps} days={[day1, day2]} />)
    // Two reassign buttons — one per day; both should be present
    const reassignButtons = screen.getAllByRole("button", { name: /reassign/i })
    const deleteButtons = screen.getAllByRole("button", { name: /delete day/i })
    expect(reassignButtons).toHaveLength(2)
    expect(deleteButtons).toHaveLength(2)
  })

  it("calls onEditDay with the day id when reassign is clicked", () => {
    const onEditDay = vi.fn()
    render(<DaySidebar {...defaultProps} onEditDay={onEditDay} />)
    fireEvent.click(screen.getByRole("button", { name: /reassign/i }))
    expect(onEditDay).toHaveBeenCalledWith(D1_ID)
  })

  it("calls onDeleteDay with the day id when × is clicked", () => {
    const onDeleteDay = vi.fn()
    render(<DaySidebar {...defaultProps} onDeleteDay={onDeleteDay} />)
    fireEvent.click(screen.getByRole("button", { name: /delete day/i }))
    expect(onDeleteDay).toHaveBeenCalledWith(D1_ID)
  })

  it("calls onDateChange with ISO date when a valid DD/MM/YYYY is entered", () => {
    const onDateChange = vi.fn()
    const { container } = render(<DaySidebar {...defaultProps} onDateChange={onDateChange} />)
    const input = container.querySelector("input[placeholder='DD/MM/YYYY']") as HTMLInputElement
    fireEvent.change(input, { target: { value: "01/06/2026" } })
    expect(onDateChange).toHaveBeenCalledWith(D1_ID, "2026-06-01")
  })

  it("does not call onDateChange while the date is incomplete", () => {
    const onDateChange = vi.fn()
    const { container } = render(<DaySidebar {...defaultProps} onDateChange={onDateChange} />)
    const input = container.querySelector("input[placeholder='DD/MM/YYYY']") as HTMLInputElement
    fireEvent.change(input, { target: { value: "01/06" } })
    expect(onDateChange).not.toHaveBeenCalled()
  })

  it("calls onAddDay when the add day button is clicked", () => {
    const onAddDay = vi.fn()
    render(<DaySidebar {...defaultProps} onAddDay={onAddDay} />)
    fireEvent.click(screen.getByRole("button", { name: /add day/i }))
    expect(onAddDay).toHaveBeenCalledOnce()
  })

  it("hides day cards after collapse toggle and shows them again on expand", () => {
    render(<DaySidebar {...defaultProps} />)
    expect(screen.queryByText(/day 1/i)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /collapse/i }))
    expect(screen.queryByText(/day 1/i)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /days/i }))
    expect(screen.queryByText(/day 1/i)).toBeTruthy()
  })
})
