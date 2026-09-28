import {
  type EditableRoute,
  deletePoint,
  editPoint,
  insertionDayId,
  insertPoint,
  movePointByDrag,
  movePointToDay,
  movePointWithinDay,
  nearestPointInDay,
  orderedPoints,
} from "../route-edits"

// A two-day route. The overnight stop (camp) ends day 1 and starts day 2; like
// every shared boundary it belongs to the arriving day (day-route.ts explains why).
function twoDayRoute(): EditableRoute {
  return {
    days: [
      { id: "d0", dayNumber: 0, date: null, startPointId: null, endPointId: null },
      { id: "d1", dayNumber: 1, date: "2026-10-01", startPointId: "putin", endPointId: "camp" },
      { id: "d2", dayNumber: 2, date: "2026-10-02", startPointId: "camp", endPointId: "takeout" },
    ],
    points: [
      point("putin", "d1", "00001000"),
      point("cape", "d1", "00002000"),
      point("camp", "d2", "00003000"),
      point("bay", "d2", "00004000"),
      point("takeout", "d2", "00005000"),
      point("unassigned", "d0", "00006000"),
    ],
  }
}

function point(id: string, dayId: string, orderKey: string) {
  return { id, dayId, orderKey, latitude: 42, longitude: 3, name: id, notes: null, type: "stop" }
}

function order(route: EditableRoute): string[] {
  return orderedPoints(route.points).map((p) => p.id)
}

function day(route: EditableRoute, id: string) {
  return route.days.find((d) => d.id === id)!
}

describe("editPoint", () => {
  it("changes a point's name, type and notes and nothing else", () => {
    const edited = editPoint(twoDayRoute(), "cape", { name: "Cap de Creus", notes: "Swell wraps round" })

    const cape = edited.points.find((p) => p.id === "cape")!
    expect(cape).toMatchObject({ name: "Cap de Creus", notes: "Swell wraps round", type: "stop" })
    expect(order(edited)).toEqual(order(twoDayRoute()))
  })

  // M34 WP1: dragging a marker repositions it without touching its order or day.
  it("changes a point's latitude and longitude and nothing else", () => {
    const edited = editPoint(twoDayRoute(), "cape", { latitude: 42.5, longitude: 3.2 })

    const cape = edited.points.find((p) => p.id === "cape")!
    expect(cape).toMatchObject({ latitude: 42.5, longitude: 3.2, name: "cape", dayId: "d1" })
    expect(order(edited)).toEqual(order(twoDayRoute()))
  })
})

describe("deletePoint", () => {
  it("removes a point inside a day", () => {
    const edited = deletePoint(twoDayRoute(), "cape")

    expect(order(edited)).toEqual(["putin", "camp", "bay", "takeout", "unassigned"])
    expect(day(edited, "d1")).toMatchObject({ startPointId: "putin", endPointId: "camp" })
  })

  // Rerouting past a planned camp: the next stop becomes the overnight stop.
  it("moves the overnight stop on to the next point when the camp is deleted", () => {
    const edited = deletePoint(twoDayRoute(), "camp")

    expect(day(edited, "d1")).toMatchObject({ startPointId: "putin", endPointId: "bay" })
    expect(day(edited, "d2")).toMatchObject({ startPointId: "bay", endPointId: "takeout" })
  })

  it("moves the put-in on when the first point is deleted", () => {
    const edited = deletePoint(twoDayRoute(), "putin")

    expect(day(edited, "d1").startPointId).toBe("cape")
  })
})

describe("insertPoint", () => {
  // "Add stop here": an emergency stop inside today's paddle.
  it("inserts a point after the chosen stop, in that day", () => {
    const stop = { id: "beach", latitude: 42.1, longitude: 3.1, name: "Beach", notes: null, type: "stop" }

    const edited = insertPoint(twoDayRoute(), "d1", "putin", stop)

    expect(order(edited)).toEqual(["putin", "beach", "cape", "camp", "bay", "takeout", "unassigned"])
    expect(edited.points.find((p) => p.id === "beach")!.dayId).toBe("d1")
    expect(day(edited, "d1")).toMatchObject({ startPointId: "putin", endPointId: "camp" })
  })

  it("extends the trip when a point is added after the last one", () => {
    const stop = { id: "extra", latitude: 42.2, longitude: 3.2, name: null, notes: null, type: "stop" }

    const edited = insertPoint(twoDayRoute(), "d2", "takeout", stop)

    expect(day(edited, "d2").endPointId).toBe("extra")
  })

  it("puts a point first in its day when there is nothing to put it after", () => {
    const stop = { id: "early", latitude: 42, longitude: 3, name: null, notes: null, type: "stop" }

    const edited = insertPoint(twoDayRoute(), "d1", null, stop)

    expect(order(edited)[0]).toBe("early")
    expect(day(edited, "d1").startPointId).toBe("early")
  })
})

describe("movePointToDay", () => {
  it("moves a point to the end of another day's own stops", () => {
    const edited = movePointToDay(twoDayRoute(), "cape", "d2")

    expect(order(edited)).toEqual(["putin", "camp", "bay", "takeout", "cape", "unassigned"])
    expect(edited.points.find((p) => p.id === "cape")!.dayId).toBe("d2")
    expect(day(edited, "d2").endPointId).toBe("cape")
  })
})

describe("movePointWithinDay", () => {
  it("swaps a point with the next stop of the same day", () => {
    const edited = movePointWithinDay(twoDayRoute(), "camp", 1)

    expect(order(edited)).toEqual(["putin", "cape", "bay", "camp", "takeout", "unassigned"])
    // The day now starts from bay, so that is where day 1 ends.
    expect(day(edited, "d2").startPointId).toBe("bay")
    expect(day(edited, "d1").endPointId).toBe("bay")
  })

  it("leaves the first stop of a day where it is when moved earlier", () => {
    const edited = movePointWithinDay(twoDayRoute(), "putin", -1)

    expect(order(edited)).toEqual(order(twoDayRoute()))
  })
})

describe("nearestPointInDay", () => {
  it("finds the day's point closest to a position", () => {
    const route = twoDayRoute()
    route.points = route.points.map((p) =>
      p.id === "cape" ? { ...p, latitude: 42.5, longitude: 3.5 } : p,
    )

    expect(nearestPointInDay(route, "d1", 42.49, 3.51)).toBe("cape")
  })

  it("only looks at that day's own points", () => {
    expect(nearestPointInDay(twoDayRoute(), "d1", 42, 3)).toMatch(/putin|cape/)
  })

  it("is null for a day with no points", () => {
    const route = twoDayRoute()
    route.days.push({ id: "d3", dayNumber: 3, date: null, startPointId: null, endPointId: null })

    expect(nearestPointInDay(route, "d3", 42, 3)).toBeNull()
  })
})

describe("order keys", () => {
  // The server rebuilds its linked list from these (spec §7.2), sorting them as
  // strings, so they must sort in the intended order as strings.
  it("re-keys the route so string order is route order", () => {
    const edited = insertPoint(twoDayRoute(), "d1", "putin", {
      id: "beach",
      latitude: 42,
      longitude: 3,
      name: null,
      notes: null,
      type: "stop",
    })

    const keys = orderedPoints(edited.points).map((p) => p.orderKey!)
    expect([...keys].sort()).toEqual(keys)
    expect(new Set(keys.map((key) => key.length)).size).toBe(1)
  })

  it("leaves Day 0's staging points out of the day boundaries", () => {
    const edited = deletePoint(twoDayRoute(), "cape")

    expect(day(edited, "d0")).toMatchObject({ startPointId: null, endPointId: null })
  })
})

// M34 WP1/WP3 (merged): dragging a point repositions it and reorders it to
// match its new geographic neighbours within its own day. Moving a point to a
// different day is out of scope here (left for the future day-boundaries work).
// M34 WP4: mid-route insertion's day rule, ported from web's M20 handleLegClick —
// the successor's day first, falling back to the predecessor's, falling back to
// Day 0. Mid-day the two agree; this only bites right at a day boundary.
describe("insertionDayId", () => {
  it("uses the shared day when predecessor and successor agree", () => {
    expect(insertionDayId(twoDayRoute(), "putin")).toBe("d1")
  })

  it("uses the successor's day when inserting right before a boundary stop", () => {
    // cape (d1) -> camp (d2, the boundary). Inserting after cape lands on the
    // day the boundary stop opens, not the one it closes.
    expect(insertionDayId(twoDayRoute(), "cape")).toBe("d2")
  })

  it("uses the predecessor's day when appending at the very end", () => {
    expect(insertionDayId(twoDayRoute(), "unassigned")).toBe("d0")
  })

  it("uses the first point's day when inserting with no predecessor", () => {
    expect(insertionDayId(twoDayRoute(), null)).toBe("d1")
  })

  it("falls back to Day 0 for a route with no points at all", () => {
    const empty: EditableRoute = {
      days: [{ id: "d0", dayNumber: 0, date: null, startPointId: null, endPointId: null }],
      points: [],
    }
    expect(insertionDayId(empty, null)).toBe("d0")
  })
})

describe("movePointByDrag", () => {
  it("repositions and reorders a point dragged past its day's other points", () => {
    const route: EditableRoute = {
      days: [{ id: "d1", dayNumber: 1, date: null, startPointId: null, endPointId: null }],
      points: [
        { id: "a", dayId: "d1", orderKey: "00001000", latitude: 0, longitude: 0, name: "a", notes: null, type: "stop" },
        { id: "b", dayId: "d1", orderKey: "00002000", latitude: 0, longitude: 1, name: "b", notes: null, type: "stop" },
        { id: "c", dayId: "d1", orderKey: "00003000", latitude: 0, longitude: 2, name: "c", notes: null, type: "stop" },
      ],
    }

    // Dragging "a" out past "c" repositions it there and reorders it to last,
    // since "c" is now its nearest remaining neighbour.
    const edited = movePointByDrag(route, "a", 0, 2.1)

    expect(orderedPoints(edited.points).map((p) => p.id)).toEqual(["b", "c", "a"])
    const a = edited.points.find((p) => p.id === "a")!
    expect(a).toMatchObject({ latitude: 0, longitude: 2.1, dayId: "d1" })
  })

  it("moves a point earlier when dragged near the front of its day", () => {
    const route: EditableRoute = {
      days: [{ id: "d1", dayNumber: 1, date: null, startPointId: null, endPointId: null }],
      points: [
        { id: "a", dayId: "d1", orderKey: "00001000", latitude: 0, longitude: 0, name: "a", notes: null, type: "stop" },
        { id: "b", dayId: "d1", orderKey: "00002000", latitude: 0, longitude: 1, name: "b", notes: null, type: "stop" },
        { id: "c", dayId: "d1", orderKey: "00003000", latitude: 0, longitude: 2, name: "c", notes: null, type: "stop" },
      ],
    }

    // "c" dragged right next to "a" always lands AFTER its nearest remaining
    // neighbour, regardless of which side it approached from — no before/after
    // directionality, matching the plan's own scope (nearestPointInDay's
    // distance alone, nothing fancier).
    const edited = movePointByDrag(route, "c", 0, 0.1)

    expect(orderedPoints(edited.points).map((p) => p.id)).toEqual(["a", "c", "b"])
  })

  it("leaves the day unchanged — moving a point to a different day is out of scope here", () => {
    const edited = movePointByDrag(twoDayRoute(), "cape", 42, 3)

    expect(edited.points.find((p) => p.id === "cape")).toMatchObject({ dayId: "d1" })
  })
})
