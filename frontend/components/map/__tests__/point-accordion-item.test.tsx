import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { PointAccordionItem } from "../point-accordion-item"
import type { Point } from "@/lib/dtos/point"

vi.mock("@/lib/itinerary/actions", () => ({
  setImagePublic: vi.fn(),
}))

import { setImagePublic } from "@/lib/itinerary/actions"

const P_ID = "01952f1a-0000-7000-8000-000000000021"

const basePoint: Point = {
  id: P_ID,
  type: "position",
  latitude: 44.0,
  longitude: 14.0,
}

const IMAGE = {
  id: "i1",
  location: "https://example.com/1.jpg",
  name: "one",
  size: 1000,
  isPublic: false,
}

const defaultProps = {
  point: basePoint,
  index: 1,
  isOpen: false,
  onToggle: vi.fn(),
  onPointChange: vi.fn(),
  onDelete: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

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

  it("shows the image gallery when the point has images", () => {
    render(
      <PointAccordionItem {...defaultProps} isOpen point={{ ...basePoint, images: [IMAGE] }} />,
    )
    expect(screen.getByRole("img")).toBeTruthy()
  })

  it("toggles image visibility and updates the point's images via onPointChange", async () => {
    const onPointChange = vi.fn()
    const updatedImage = { ...IMAGE, isPublic: true }
    vi.mocked(setImagePublic).mockResolvedValue({ success: true, image: updatedImage })
    render(
      <PointAccordionItem
        {...defaultProps}
        isOpen
        point={{ ...basePoint, images: [IMAGE] }}
        onPointChange={onPointChange}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /make one public/i }))
    expect(setImagePublic).toHaveBeenCalledWith(P_ID, "i1", true)
    await waitFor(() =>
      expect(onPointChange).toHaveBeenCalledWith(P_ID, { images: [updatedImage] }),
    )
  })

  it("does not call onPointChange when the visibility toggle fails", async () => {
    const onPointChange = vi.fn()
    vi.mocked(setImagePublic).mockResolvedValue({ success: false, error: "nope" })
    render(
      <PointAccordionItem
        {...defaultProps}
        isOpen
        point={{ ...basePoint, images: [IMAGE] }}
        onPointChange={onPointChange}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /make one public/i }))
    await waitFor(() => expect(setImagePublic).toHaveBeenCalled())
    expect(onPointChange).not.toHaveBeenCalled()
  })
})
