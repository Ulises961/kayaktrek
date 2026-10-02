import type { MapViewState } from "../project-lng-lat"
import { VIEW_SETTLE_MS, viewChanged } from "../view-change"

const view: MapViewState = { center: [-4.5, 54.1], zoom: 10, bearing: 0, pitch: 0 }

describe("viewChanged", () => {
  it("is false for the same view reported again, as a map at rest does", () => {
    expect(viewChanged(view, { ...view, center: [...view.center] })).toBe(false)
  })

  it("is true when the zoom changes", () => {
    expect(viewChanged(view, { ...view, zoom: 10.05 })).toBe(true)
  })

  it("is true when the map is panned", () => {
    expect(viewChanged(view, { ...view, center: [-4.499, 54.1] })).toBe(true)
    expect(viewChanged(view, { ...view, center: [-4.5, 54.101] })).toBe(true)
  })

  it("is true when the map is rotated", () => {
    expect(viewChanged(view, { ...view, bearing: 5 })).toBe(true)
  })

  it("ignores differences too small to be movement", () => {
    expect(viewChanged(view, { ...view, zoom: 10.0000001, center: [-4.50000001, 54.1], bearing: 0.001 })).toBe(false)
  })
})

describe("VIEW_SETTLE_MS", () => {
  it("is long enough to ride out a pinch's pauses and short enough to feel immediate", () => {
    expect(VIEW_SETTLE_MS).toBeGreaterThanOrEqual(250)
    expect(VIEW_SETTLE_MS).toBeLessThanOrEqual(500)
  })
})
