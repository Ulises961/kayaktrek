import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import React from "react"

const mockAddTo = vi.fn()
const mockRemoveLayer = vi.fn()
const mockLayer = { addTo: mockAddTo }
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
