import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PointRow } from "../point-row"
import type { Point } from "@/lib/dtos/point"

const pt = (id: string, overrides: Partial<Point> = {}): Point => ({
  id,
  type: "position",
  latitude: 44,
  longitude: 14,
  ...overrides,
})

describe("PointRow — collapsed", () => {
  it("renders the 1-based index as label when no name", () => {
    render(<PointRow point={pt("a")} index={1} isExpanded={false} onExpand={vi.fn()} isBoundary={false} dayColor="#888" />)
    expect(screen.getByText("1")).toBeInTheDocument()
  })

  it("renders the point name when present", () => {
    render(<PointRow point={pt("a", { name: "Cedeira harbour" })} index={2} isExpanded={false} onExpand={vi.fn()} isBoundary={false} dayColor="#888" />)
    expect(screen.getByText("Cedeira harbour")).toBeInTheDocument()
  })

  it("calls onExpand with the point id when the row is clicked", async () => {
    const onExpand = vi.fn()
    render(<PointRow point={pt("abc")} index={1} isExpanded={false} onExpand={onExpand} isBoundary={false} dayColor="#888" />)
    await userEvent.click(screen.getByRole("button"))
    expect(onExpand).toHaveBeenCalledWith("abc")
  })

  it("does not show the type selector when collapsed", () => {
    render(<PointRow point={pt("a")} index={1} isExpanded={false} onExpand={vi.fn()} isBoundary={false} dayColor="#888" onTypeChange={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /stop/i })).not.toBeInTheDocument()
  })

  it("does not show the name input when collapsed", () => {
    render(<PointRow point={pt("a")} index={1} isExpanded={false} onExpand={vi.fn()} isBoundary={false} dayColor="#888" onNameChange={vi.fn()} />)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })
})

describe("PointRow — expanded", () => {
  it("shows the type selector chips", () => {
    render(<PointRow point={pt("a")} index={1} isExpanded={true} onExpand={vi.fn()} isBoundary={false} dayColor="#888" onTypeChange={vi.fn()} />)
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /position/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /interest/i })).toBeInTheDocument()
  })

  it("shows the name input field", () => {
    render(<PointRow point={pt("a")} index={1} isExpanded={true} onExpand={vi.fn()} isBoundary={false} dayColor="#888" onNameChange={vi.fn()} />)
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })

  it("shows the delete button when onDelete is provided", () => {
    render(<PointRow point={pt("a")} index={1} isExpanded={true} onExpand={vi.fn()} isBoundary={false} dayColor="#888" onDelete={vi.fn()} />)
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument()
  })

  it("does not show the delete button when onDelete is omitted", () => {
    render(<PointRow point={pt("a")} index={1} isExpanded={true} onExpand={vi.fn()} isBoundary={false} dayColor="#888" />)
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument()
  })

  it("calls onTypeChange with the selected type when a chip is clicked", async () => {
    const onTypeChange = vi.fn()
    render(<PointRow point={pt("a", { type: "position" })} index={1} isExpanded={true} onExpand={vi.fn()} isBoundary={false} dayColor="#888" onTypeChange={onTypeChange} />)
    await userEvent.click(screen.getByRole("button", { name: /stop/i }))
    expect(onTypeChange).toHaveBeenCalledWith("stop")
  })

  it("calls onDelete when the delete button is clicked", async () => {
    const onDelete = vi.fn()
    render(<PointRow point={pt("a")} index={1} isExpanded={true} onExpand={vi.fn()} isBoundary={false} dayColor="#888" onDelete={onDelete} />)
    await userEvent.click(screen.getByRole("button", { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it("pre-fills the name input with the point name", () => {
    render(<PointRow point={pt("a", { name: "Cedeira" })} index={1} isExpanded={true} onExpand={vi.fn()} isBoundary={false} dayColor="#888" onNameChange={vi.fn()} />)
    expect(screen.getByRole("textbox")).toHaveValue("Cedeira")
  })

  it("calls onNameChange as the user types", async () => {
    const onNameChange = vi.fn()
    render(<PointRow point={pt("a")} index={1} isExpanded={true} onExpand={vi.fn()} isBoundary={false} dayColor="#888" onNameChange={onNameChange} />)
    await userEvent.type(screen.getByRole("textbox"), "Porto")
    expect(onNameChange).toHaveBeenLastCalledWith("Porto")
  })
})

describe("PointRow — boundary point", () => {
  it("does not render the type selector when isBoundary is true", () => {
    render(<PointRow point={pt("a", { type: "stop" })} index={1} isExpanded={true} onExpand={vi.fn()} isBoundary={true} dayColor="#888" onTypeChange={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /stop/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /position/i })).not.toBeInTheDocument()
  })
})
