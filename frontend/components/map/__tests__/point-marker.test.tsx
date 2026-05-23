import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import type { Point } from "@/lib/dtos/point"

vi.mock("leaflet", () => ({ default: {} }))
vi.mock("react-leaflet", () => ({ Marker: vi.fn(() => null) }))
vi.mock("../ring-icon", () => ({ ringIcon: vi.fn(() => ({ _mocked: true })) }))

import { PointMarker } from "../point-marker"
import * as ringIconModule from "../ring-icon"

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
    expect(ringIconModule.ringIcon).toHaveBeenCalledWith("#4a90d9", "position")
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
    expect(ringIconModule.ringIcon).toHaveBeenCalledWith("#e05a2b", "position")
  })

  it("calls ringIcon again when type changes", () => {
    const { rerender } = render(<PointMarker {...BASE_PROPS} />)
    vi.clearAllMocks()

    rerender(<PointMarker {...BASE_PROPS} type="stop" />)

    expect(ringIconModule.ringIcon).toHaveBeenCalledTimes(1)
    expect(ringIconModule.ringIcon).toHaveBeenCalledWith("#4a90d9", "stop")
  })
})
