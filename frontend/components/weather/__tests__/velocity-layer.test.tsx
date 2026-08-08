import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import React from "react"

const mockAddTo = vi.fn()
const mockRemoveLayer = vi.fn()
const mockSetOptions = vi.fn()
const mockLayer = { addTo: mockAddTo, setOptions: mockSetOptions }
const mockMap = {
  removeLayer: mockRemoveLayer,
}

// Make requestAnimationFrame synchronous so tests can verify callbacks inline.
// In jsdom, rAF never fires on its own; the synchronous stub simulates the deferred addTo.
vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
  cb(0)
  return 0
})
vi.stubGlobal("cancelAnimationFrame", vi.fn())

vi.mock("react-leaflet", () => ({
  useMap: () => mockMap,
}))

vi.mock("leaflet", () => ({
  default: {
    velocityLayer: vi.fn(() => mockLayer),
  },
}))

vi.mock("leaflet-velocity", () => ({}))

import { VelocityLayer } from "../velocity-layer"
import type { VelocityGridLayer } from "@/lib/types/ui"
import L from "leaflet"

const GRID_LAYER: VelocityGridLayer = {
  header: {
    parameterUnit: "m/s",
    parameterCategory: 2,
    parameterNumber: 2,
    parameterNumberName: "eastward_wind",
    la1: 40,
    la2: 50,
    lo1: 10,
    lo2: 20,
    nx: 2,
    ny: 2,
    dx: 5,
    dy: 5,
  },
  data: [1, 2, 3, 4],
}

beforeEach(() => vi.clearAllMocks())

describe("VelocityLayer", () => {
  it("creates and adds a leaflet-velocity layer when data is provided", () => {
    render(<VelocityLayer data={[GRID_LAYER]} />)
    expect(
      (L as unknown as { velocityLayer: ReturnType<typeof vi.fn> }).velocityLayer,
    ).toHaveBeenCalledWith(expect.objectContaining({ displayValues: false, data: [GRID_LAYER] }))
    expect(mockAddTo).toHaveBeenCalledWith(mockMap)
  })

  it("does not create a layer when data array is empty", () => {
    render(<VelocityLayer data={[]} />)
    expect(
      (L as unknown as { velocityLayer: ReturnType<typeof vi.fn> }).velocityLayer,
    ).not.toHaveBeenCalled()
    expect(mockAddTo).not.toHaveBeenCalled()
  })

  it("merges options into the velocityLayer call", () => {
    render(<VelocityLayer data={[GRID_LAYER]} options={{ velocityScale: 0.005 }} />)
    expect(
      (L as unknown as { velocityLayer: ReturnType<typeof vi.fn> }).velocityLayer,
    ).toHaveBeenCalledWith(expect.objectContaining({ velocityScale: 0.005 }))
  })

  it("recreates the layer with the CURRENT options when the data changes", () => {
    const OTHER_GRID: VelocityGridLayer = { ...GRID_LAYER, data: [5, 6, 7, 8] }
    const velocityLayer = (L as unknown as { velocityLayer: ReturnType<typeof vi.fn> })
      .velocityLayer
    const { rerender } = render(
      <VelocityLayer data={[GRID_LAYER]} options={{ colorScale: ["#0d47a1"] }} />,
    )
    // Data AND options change in the same render — the rebuilt layer must use the
    // new colour scale, not the one the previous render was drawn with.
    rerender(<VelocityLayer data={[OTHER_GRID]} options={{ colorScale: ["#ffffff"] }} />)

    expect(velocityLayer).toHaveBeenCalledTimes(2)
    expect(velocityLayer).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: [OTHER_GRID], colorScale: ["#ffffff"] }),
    )
    // The superseded layer is torn down, not left stacked on the map.
    expect(mockRemoveLayer).toHaveBeenCalledWith(mockLayer)
  })

  it("applies an options-only change in place instead of rebuilding the layer", () => {
    const velocityLayer = (L as unknown as { velocityLayer: ReturnType<typeof vi.fn> })
      .velocityLayer
    // One stable array — callers memoise their grids, and the layer is rebuilt on
    // data identity, so a fresh literal per render would rebuild for the wrong reason.
    const data = [GRID_LAYER]
    const { rerender } = render(
      <VelocityLayer data={data} options={{ particleMultiplier: 0.001 }} />,
    )
    rerender(<VelocityLayer data={data} options={{ particleMultiplier: 0.002 }} />)

    expect(velocityLayer).toHaveBeenCalledTimes(1)
    expect(mockRemoveLayer).not.toHaveBeenCalled()
    expect(mockSetOptions).toHaveBeenCalledWith({ particleMultiplier: 0.002 })
  })

  it("removes the layer from the map on unmount", () => {
    const { unmount } = render(<VelocityLayer data={[GRID_LAYER]} />)
    unmount()
    expect(mockRemoveLayer).toHaveBeenCalledWith(mockLayer)
  })

  it("does not call removeLayer when data was empty (no layer was added)", () => {
    const { unmount } = render(<VelocityLayer data={[]} />)
    unmount()
    expect(mockRemoveLayer).not.toHaveBeenCalled()
  })
})
