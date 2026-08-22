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

const mockCancelAnimFrame = vi.fn()

vi.mock("leaflet", () => ({
  default: {
    velocityLayer: vi.fn(() => mockLayer),
    Util: { cancelAnimFrame: (handle: number) => mockCancelAnimFrame(handle) },
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

  // leaflet-velocity's canvas layer leaves two calls scheduled from onAdd — a
  // requestAnimFrame into drawLayer and a setTimeout(0) into _onLayerDidMove —
  // and cancels neither on removal. Both dereference `this._map`, which Leaflet
  // has already nulled, so on a slow machine unmounting the map mid-window threw
  // an uncaught TypeError onto the page. Stand in for the plugin's canvas layer
  // and assert both deferrals are defused, in the order that matters.
  describe("teardown defuses leaflet-velocity's pending callbacks", () => {
    // The real _onLayerDidMove reads this._map, which is null after removal —
    // so a faithful stand-in throws exactly like the plugin does.
    const makeCanvasLayer = () => ({
      _canvas: undefined,
      _frame: 42 as number | null,
      _onLayerDidMove: () => {
        throw new TypeError("Cannot read properties of null (reading 'containerPointToLayerPoint')")
      },
    })

    it("cancels the pending draw frame and neutralizes the deferred reposition", () => {
      const canvasLayer = makeCanvasLayer()
      Object.assign(mockLayer, { _canvasLayer: canvasLayer })

      const { unmount } = render(<VelocityLayer data={[GRID_LAYER]} />)
      // Precondition: untouched while mounted, or the assertions below prove nothing.
      expect(mockCancelAnimFrame).not.toHaveBeenCalled()
      expect(() => canvasLayer._onLayerDidMove()).toThrow(TypeError)

      unmount()

      expect(mockCancelAnimFrame).toHaveBeenCalledWith(42)
      expect(canvasLayer._frame).toBeNull()
      // The pending setTimeout(0) lands here after the map is gone; it must be inert.
      expect(() => canvasLayer._onLayerDidMove()).not.toThrow()

      delete (mockLayer as { _canvasLayer?: unknown })._canvasLayer
    })

    it("defuses the callbacks only after removeLayer, so onRemove can still detach its handlers", () => {
      const canvasLayer = makeCanvasLayer()
      Object.assign(mockLayer, { _canvasLayer: canvasLayer })

      const order: string[] = []
      mockRemoveLayer.mockImplementation(() => {
        // onRemove rebuilds its handler object from _onLayerDidMove to `map.off`
        // it — so at this point it must still be the original function.
        order.push(
          canvasLayer._onLayerDidMove.toString().includes("TypeError") ? "original" : "stub",
        )
      })
      mockCancelAnimFrame.mockImplementation(() => order.push("cancelFrame"))

      const { unmount } = render(<VelocityLayer data={[GRID_LAYER]} />)
      unmount()

      expect(order).toEqual(["original", "cancelFrame"])

      mockRemoveLayer.mockReset()
      mockCancelAnimFrame.mockReset()
      delete (mockLayer as { _canvasLayer?: unknown })._canvasLayer
    })
  })
})
