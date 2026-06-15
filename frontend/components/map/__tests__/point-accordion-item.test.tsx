import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { PointAccordionItem } from "../point-accordion-item"
import type { Point } from "@/lib/dtos/point"

const P_ID = "01952f1a-0000-7000-8000-000000000021"

const basePoint: Point = {
  id: P_ID,
  type: "position",
  latitude: 44.0,
  longitude: 14.0,
}

const defaultProps = {
  point: basePoint,
  index: 1,
  isOpen: false,
  onToggle: vi.fn(),
  onPointChange: vi.fn(),
  onDelete: vi.fn(),
}

describe("PointAccordionItem", () => {
  it("renders collapsed row with index and type icon", () => {
    render(<PointAccordionItem {...defaultProps} />)
    expect(screen.getByText("1")).toBeTruthy()
    expect(screen.getByRole("button", { name: /expand point/i })).toBeTruthy()
  })

  it("shows point name in collapsed row when set", () => {
    render(<PointAccordionItem {...defaultProps} point={{ ...basePoint, name: "Harbour" }} />)
    expect(screen.getByText("Harbour")).toBeTruthy()
  })

  it("calls onToggle when row header is clicked", () => {
    const onToggle = vi.fn()
    render(<PointAccordionItem {...defaultProps} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole("button", { name: /expand point/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it("does not show expanded content when isOpen is false", () => {
    render(<PointAccordionItem {...defaultProps} />)
    expect(screen.queryByPlaceholderText(/name/i)).toBeNull()
  })

  it("shows type chips, name field, notes, and delete button when open", () => {
    render(<PointAccordionItem {...defaultProps} isOpen />)
    expect(screen.getByRole("button", { name: /stop/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /position/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /interest/i })).toBeTruthy()
    expect(screen.getByPlaceholderText(/name/i)).toBeTruthy()
    expect(screen.getByPlaceholderText(/notes/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /delete point/i })).toBeTruthy()
  })

  it("calls onPointChange with new type when a type chip is clicked", () => {
    const onPointChange = vi.fn()
    render(<PointAccordionItem {...defaultProps} isOpen onPointChange={onPointChange} />)
    fireEvent.click(screen.getByRole("button", { name: /stop/i }))
    expect(onPointChange).toHaveBeenCalledWith(P_ID, { type: "stop" })
  })

  it("does not call onPointChange when the already-active type chip is clicked", () => {
    const onPointChange = vi.fn()
    render(<PointAccordionItem {...defaultProps} isOpen onPointChange={onPointChange} />)
    fireEvent.click(screen.getByRole("button", { name: /position/i }))
    expect(onPointChange).not.toHaveBeenCalled()
  })

  it("calls onPointChange with name on blur", () => {
    const onPointChange = vi.fn()
    render(<PointAccordionItem {...defaultProps} isOpen onPointChange={onPointChange} />)
    const input = screen.getByPlaceholderText(/name/i)
    fireEvent.change(input, { target: { value: "New camp" } })
    fireEvent.blur(input)
    expect(onPointChange).toHaveBeenCalledWith(P_ID, { name: "New camp" })
  })

  it("calls onPointChange with notes on blur", () => {
    const onPointChange = vi.fn()
    render(<PointAccordionItem {...defaultProps} isOpen onPointChange={onPointChange} />)
    const textarea = screen.getByPlaceholderText(/notes/i)
    fireEvent.change(textarea, { target: { value: "Sandy beach" } })
    fireEvent.blur(textarea)
    expect(onPointChange).toHaveBeenCalledWith(P_ID, { notes: "Sandy beach" })
  })

  it("calls onDelete with the point id when delete is clicked", () => {
    const onDelete = vi.fn()
    render(<PointAccordionItem {...defaultProps} isOpen onDelete={onDelete} />)
    fireEvent.click(screen.getByRole("button", { name: /delete point/i }))
    expect(onDelete).toHaveBeenCalledWith(P_ID)
  })

  it("shows Find nearby POIs button only for interest type", () => {
    render(
      <PointAccordionItem
        {...defaultProps}
        isOpen
        point={{ ...basePoint, type: "interest" }}
        onFetchPois={vi.fn()}
      />,
    )
    expect(screen.getByRole("button", { name: /find nearby/i })).toBeTruthy()
  })

  it("does not show Find nearby POIs button for non-interest types", () => {
    render(<PointAccordionItem {...defaultProps} isOpen />)
    expect(screen.queryByRole("button", { name: /find nearby/i })).toBeNull()
  })

  it("renders POI results as a list when provided", () => {
    const pois: Point[] = [
      { id: "poi-1", type: "interest", name: "Lighthouse" },
      { id: "poi-2", type: "interest", name: "Cave" },
    ]
    render(
      <PointAccordionItem
        {...defaultProps}
        isOpen
        point={{ ...basePoint, type: "interest" }}
        onFetchPois={vi.fn()}
        poiResults={pois}
        onPoiSelect={vi.fn()}
      />,
    )
    expect(screen.getByText("Lighthouse")).toBeTruthy()
    expect(screen.getByText("Cave")).toBeTruthy()
  })

  it("calls onPoiSelect with the POI name when a POI result is clicked", () => {
    const onPoiSelect = vi.fn()
    const pois: Point[] = [{ id: "poi-1", type: "interest", name: "Lighthouse" }]
    render(
      <PointAccordionItem
        {...defaultProps}
        isOpen
        point={{ ...basePoint, type: "interest" }}
        onFetchPois={vi.fn()}
        poiResults={pois}
        onPoiSelect={onPoiSelect}
      />,
    )
    fireEvent.click(screen.getByText("Lighthouse"))
    expect(onPoiSelect).toHaveBeenCalledWith("Lighthouse")
  })
})
