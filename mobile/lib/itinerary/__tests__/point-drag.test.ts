import { isPointDraggable } from "../point-drag"

// Found on a device: a swipe or pan that passed over a point picked it up and moved it, then a
// pan started on one point moved the next. A point is only draggable once it is selected, so
// moving one is a deliberate two-step (tap it, then drag it) and a pan across the map can never
// carry the others away.
describe("isPointDraggable", () => {
  it("lets the selected point be dragged while editing", () => {
    expect(isPointDraggable({ editing: true, pointId: "p1", selectedPointId: "p1" })).toBe(true)
  })

  it("does not let a pan pick up a point that is not selected", () => {
    expect(isPointDraggable({ editing: true, pointId: "p2", selectedPointId: "p1" })).toBe(false)
    expect(isPointDraggable({ editing: true, pointId: "p2", selectedPointId: null })).toBe(false)
  })

  it("drags nothing outside edit mode, selected or not", () => {
    expect(isPointDraggable({ editing: false, pointId: "p1", selectedPointId: "p1" })).toBe(false)
  })

  it("does not drag a point that has no id yet", () => {
    expect(isPointDraggable({ editing: true, pointId: undefined, selectedPointId: null })).toBe(false)
    expect(isPointDraggable({ editing: true, pointId: undefined, selectedPointId: "p1" })).toBe(false)
  })
})
