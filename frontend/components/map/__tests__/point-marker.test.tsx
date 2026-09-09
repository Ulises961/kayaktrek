import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import type { Point } from "@/lib/dtos/point"

// Capture the last Marker props so tests can assert draggability/handlers and
// fire the drag/dragend events the real Leaflet marker would emit.
type CapturedMarkerProps = {
  draggable?: boolean
  eventHandlers?: {
    drag?: (e: unknown) => void
    dragend?: (e: unknown) => void
    click?: () => void
    mouseover?: () => void
  }
}
let lastMarkerProps: CapturedMarkerProps = {}

vi.mock("leaflet", () => ({ default: {} }))
vi.mock("react-leaflet", () => ({
  Marker: vi.fn((props: CapturedMarkerProps & { children?: ReactNode }) => {
    lastMarkerProps = props
    return props.children ?? null
  }),
  Tooltip: vi.fn(({ children }) => children ?? null),
}))
vi.mock("../ring-icon", () => ({ ringIcon: vi.fn(() => ({ _mocked: true })) }))

import { PointMarker } from "../point-marker"
import * as ringIconModule from "../ring-icon"

const leafletDragEvent = (lat: number, lng: number) => ({
  target: { getLatLng: () => ({ lat, lng }) },
})

const BASE_POINT: Point & { latitude: number; longitude: number } = {
  id: "point-1",
  type: "position",
  latitude: 43.0,
  longitude: 13.0,
  dayId: "day-1",
}

const BASE_PROPS = {
  point: BASE_POINT,
  color: "#4a90d9",
  type: "position" as const,
  onDragMove: vi.fn(),
  onDragEnd: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

describe("PointMarker — icon memoization", () => {
  it("calls ringIcon once on initial render", () => {
    render(<PointMarker {...BASE_PROPS} />)
    expect(ringIconModule.ringIcon).toHaveBeenCalledTimes(1)
    expect(ringIconModule.ringIcon).toHaveBeenCalledWith("#4a90d9", "position", undefined)
  })

  it("does not call ringIcon again when re-rendered with same color and type but new callback refs", () => {
    const { rerender } = render(<PointMarker {...BASE_PROPS} />)
    vi.clearAllMocks()

    // Simulate MapCore re-render during drag: same color/type, new callback references
    rerender(<PointMarker {...BASE_PROPS} onDragMove={vi.fn()} onDragEnd={vi.fn()} />)

    expect(ringIconModule.ringIcon).not.toHaveBeenCalled()
  })

  it("calls ringIcon again when color changes", () => {
    const { rerender } = render(<PointMarker {...BASE_PROPS} />)
    vi.clearAllMocks()

    rerender(<PointMarker {...BASE_PROPS} color="#e05a2b" />)

    expect(ringIconModule.ringIcon).toHaveBeenCalledTimes(1)
    expect(ringIconModule.ringIcon).toHaveBeenCalledWith("#e05a2b", "position", undefined)
  })

  it("calls ringIcon again when type changes", () => {
    const { rerender } = render(<PointMarker {...BASE_PROPS} />)
    vi.clearAllMocks()

    rerender(<PointMarker {...BASE_PROPS} type="stop" />)

    expect(ringIconModule.ringIcon).toHaveBeenCalledTimes(1)
    expect(ringIconModule.ringIcon).toHaveBeenCalledWith("#4a90d9", "stop", undefined)
  })

  it("calls ringIcon again when index changes", () => {
    const { rerender } = render(<PointMarker {...BASE_PROPS} index={1} />)
    vi.clearAllMocks()

    rerender(<PointMarker {...BASE_PROPS} index={2} />)

    expect(ringIconModule.ringIcon).toHaveBeenCalledTimes(1)
    expect(ringIconModule.ringIcon).toHaveBeenCalledWith("#4a90d9", "position", 2)
  })
})

describe("PointMarker — distance label", () => {
  it("renders the label tooltip when a label is provided", () => {
    render(<PointMarker {...BASE_PROPS} label="6.2 nm · 2h 30min" />)
    expect(screen.getByText("6.2 nm · 2h 30min")).toBeInTheDocument()
  })

  it("renders no label tooltip when label is null", () => {
    render(<PointMarker {...BASE_PROPS} label={null} />)
    expect(screen.queryByText(/nm/)).not.toBeInTheDocument()
  })
})

describe("PointMarker — dragging", () => {
  it("reports the live position via onDragMove while dragging", () => {
    const onDragMove = vi.fn()
    render(<PointMarker {...BASE_PROPS} onDragMove={onDragMove} />)
    lastMarkerProps.eventHandlers?.drag?.(leafletDragEvent(44.5, -3.2))
    expect(onDragMove).toHaveBeenCalledWith(44.5, -3.2)
  })

  it("reports the final position via onDragEnd when the drag finishes", () => {
    const onDragEnd = vi.fn()
    render(<PointMarker {...BASE_PROPS} onDragEnd={onDragEnd} />)
    lastMarkerProps.eventHandlers?.dragend?.(leafletDragEvent(44.7, -3.4))
    expect(onDragEnd).toHaveBeenCalledWith(44.7, -3.4)
  })

  it("is draggable by default", () => {
    render(<PointMarker {...BASE_PROPS} />)
    expect(lastMarkerProps.draggable).toBe(true)
  })

  it("is not draggable when draggable is explicitly false (e.g. a locked boundary marker)", () => {
    render(<PointMarker {...BASE_PROPS} draggable={false} />)
    expect(lastMarkerProps.draggable).toBe(false)
  })
})

describe("PointMarker — undo affordance", () => {
  it("renders a discard control when showUndo is true", () => {
    render(<PointMarker {...BASE_PROPS} showUndo onUndo={vi.fn()} />)
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument()
  })

  it("renders no discard control when showUndo is false", () => {
    render(<PointMarker {...BASE_PROPS} showUndo={false} onUndo={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /discard/i })).not.toBeInTheDocument()
  })

  it("calls onUndo when the discard control is clicked", async () => {
    const onUndo = vi.fn()
    render(<PointMarker {...BASE_PROPS} showUndo onUndo={onUndo} />)
    await userEvent.click(screen.getByRole("button", { name: /discard/i }))
    expect(onUndo).toHaveBeenCalledOnce()
  })

  it("does not let the discard click bubble into the marker's own click handler", async () => {
    const onUndo = vi.fn()
    const onClick = vi.fn()
    render(<PointMarker {...BASE_PROPS} showUndo onUndo={onUndo} onClick={onClick} />)
    await userEvent.click(screen.getByRole("button", { name: /discard/i }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onClick).not.toHaveBeenCalled()
  })

  it("shows the discard control alongside the distance label rather than replacing it", () => {
    render(<PointMarker {...BASE_PROPS} showUndo onUndo={vi.fn()} label="6.2 nm · 2h 30min" />)
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument()
    expect(screen.getByText("6.2 nm · 2h 30min")).toBeInTheDocument()
  })

  it("carries no visible supporting text, only the discard icon", () => {
    render(<PointMarker {...BASE_PROPS} showUndo onUndo={vi.fn()} />)
    const button = screen.getByRole("button", { name: /discard/i })
    expect(button).toHaveTextContent("")
  })
})

describe("PointMarker — click/hover forwarding", () => {
  it("does not wire a click handler when onClick is not provided", () => {
    render(<PointMarker {...BASE_PROPS} />)
    expect(lastMarkerProps.eventHandlers?.click).toBeUndefined()
  })

  it("fires onClick via the marker's click handler when provided", () => {
    const onClick = vi.fn()
    render(<PointMarker {...BASE_PROPS} onClick={onClick} />)
    lastMarkerProps.eventHandlers?.click?.()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("fires onMouseOver via the marker's mouseover handler when provided", () => {
    const onMouseOver = vi.fn()
    render(<PointMarker {...BASE_PROPS} onMouseOver={onMouseOver} />)
    lastMarkerProps.eventHandlers?.mouseover?.()
    expect(onMouseOver).toHaveBeenCalledOnce()
  })
})
