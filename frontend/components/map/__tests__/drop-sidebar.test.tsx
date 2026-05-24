import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { DropSidebar } from "../drop-sidebar"
import type { Point } from "@/lib/dtos/point"

const P1: Point = { id: "01952f1a-0000-7000-8000-000000000021", type: "position", latitude: 44, longitude: 14 }
const P2: Point = { id: "01952f1a-0000-7000-8000-000000000022", type: "stop", latitude: 44.1, longitude: 14.1, name: "Camp" }
const P3: Point = { id: "01952f1a-0000-7000-8000-000000000023", type: "interest", latitude: 44.2, longitude: 14.2 }

const pointOrder = [P1.id!, P2.id!, P3.id!]

const defaultProps = {
  points: [P1, P2, P3],
  pointOrder,
  activePointId: null as string | null,
  onActivePointChange: vi.fn(),
  onPointChange: vi.fn(),
  onPointDelete: vi.fn(),
  onFetchPois: vi.fn(),
  poiResults: [] as Point[],
  onPoiSelect: vi.fn(),
}

describe("DropSidebar", () => {
  it("renders a row for each point in pointOrder", () => {
    render(<DropSidebar {...defaultProps} />)
    expect(screen.getAllByRole("button", { name: /expand point/i })).toHaveLength(3)
  })

  it("shows a prompt when no points exist", () => {
    render(<DropSidebar {...defaultProps} points={[]} pointOrder={[]} />)
    expect(screen.getByText(/click on the map/i)).toBeTruthy()
  })

  it("expands the item whose id matches activePointId", () => {
    render(<DropSidebar {...defaultProps} activePointId={P1.id!} />)
    expect(screen.getByPlaceholderText(/name/i)).toBeTruthy()
  })

  it("calls onActivePointChange with the point id when row header is clicked", () => {
    const onActivePointChange = vi.fn()
    render(<DropSidebar {...defaultProps} onActivePointChange={onActivePointChange} />)
    fireEvent.click(screen.getAllByRole("button", { name: /expand point/i })[0])
    expect(onActivePointChange).toHaveBeenCalledWith(P1.id)
  })

  it("calls onActivePointChange with null to collapse when active row is clicked again", () => {
    const onActivePointChange = vi.fn()
    render(<DropSidebar {...defaultProps} activePointId={P1.id!} onActivePointChange={onActivePointChange} />)
    fireEvent.click(screen.getAllByRole("button", { name: /expand point/i })[0])
    expect(onActivePointChange).toHaveBeenCalledWith(null)
  })

  it("collapses the sidebar and hides points when collapse button is clicked", () => {
    render(<DropSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole("button", { name: /collapse/i }))
    expect(screen.queryByRole("button", { name: /expand point/i })).toBeNull()
  })

  it("restores the sidebar when the collapsed tab is clicked", () => {
    render(<DropSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole("button", { name: /collapse/i }))
    fireEvent.click(screen.getByRole("button", { name: /show points/i }))
    expect(screen.getAllByRole("button", { name: /expand point/i })).toHaveLength(3)
  })
})
