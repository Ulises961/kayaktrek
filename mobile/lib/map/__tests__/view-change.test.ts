import type { MapViewState } from "../project-lng-lat"
import {
  BEARING_EPSILON_DEGREES,
  CENTER_EPSILON_DEGREES,
  VIEW_SETTLE_MS,
  viewChanged,
  ZOOM_EPSILON,
} from "../view-change"

const view: MapViewState = { center: [-4.5, 54.1], zoom: 10, bearing: 0, pitch: 0 }

describe("viewChanged", () => {
  it("is false for the same view reported again, as a map at rest does", () => {
    expect(viewChanged(view, { ...view, center: [...view.center] })).toBe(false)
  })

  it("is true when the zoom changes by more than the threshold", () => {
    expect(viewChanged(view, { ...view, zoom: view.zoom + ZOOM_EPSILON * 2 })).toBe(true)
  })

  it("is true when the map is panned by more than the threshold, in either direction", () => {
    const step = CENTER_EPSILON_DEGREES * 2
    expect(viewChanged(view, { ...view, center: [view.center[0] + step, view.center[1]] })).toBe(true)
    expect(viewChanged(view, { ...view, center: [view.center[0], view.center[1] - step] })).toBe(true)
  })

  it("is true when the map is rotated by more than the threshold", () => {
    expect(viewChanged(view, { ...view, bearing: view.bearing + BEARING_EPSILON_DEGREES * 2 })).toBe(true)
  })

  it("ignores differences below each threshold, which are the map reporting the same view", () => {
    expect(
      viewChanged(view, {
        ...view,
        zoom: view.zoom + ZOOM_EPSILON / 2,
        center: [view.center[0] + CENTER_EPSILON_DEGREES / 2, view.center[1] - CENTER_EPSILON_DEGREES / 2],
        bearing: view.bearing + BEARING_EPSILON_DEGREES / 2,
      }),
    ).toBe(false)
  })
})

describe("VIEW_SETTLE_MS", () => {
  it("is long enough to ride out the pause between two frames of a gesture, and short enough to feel immediate", () => {
    // The map reports a view every frame or so while moving: well under this.
    expect(VIEW_SETTLE_MS).toBeGreaterThanOrEqual(100)
    expect(VIEW_SETTLE_MS).toBeLessThanOrEqual(500)
  })
})
