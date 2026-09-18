import { describe, it, expect } from "vitest"
import {
  haversineNm,
  totalDistanceNm,
  toKm,
  toNm,
  formatDistance,
  formatDistanceForInput,
  estimatedTime,
  formatTime,
  legLabel,
  routeLegs,
  dayRouteLegs,
  groupStopsWithVia,
} from "../distance"

describe("haversineNm", () => {
  it("returns 0 for identical points", () => {
    expect(
      haversineNm({ latitude: 44, longitude: 14 }, { latitude: 44, longitude: 14 }),
    ).toBeCloseTo(0)
  })

  it("calculates ~60 nm per degree of latitude at the equator", () => {
    const a = { latitude: 0, longitude: 0 }
    const b = { latitude: 1, longitude: 0 }
    // (2π × 3440.065) / 360 ≈ 60.04 nm per degree
    expect(haversineNm(a, b)).toBeCloseTo(60.04, 1)
  })

  it("is symmetric", () => {
    const a = { latitude: 44.5, longitude: 14.2 }
    const b = { latitude: 44.8, longitude: 14.5 }
    expect(haversineNm(a, b)).toBeCloseTo(haversineNm(b, a), 10)
  })
})

describe("totalDistanceNm", () => {
  it("returns 0 for an empty list", () => {
    expect(totalDistanceNm([])).toBe(0)
  })

  it("returns 0 for a single point", () => {
    expect(totalDistanceNm([{ latitude: 44, longitude: 14 }])).toBe(0)
  })

  it("sums segment distances across three points", () => {
    const a = { latitude: 0, longitude: 0 }
    const b = { latitude: 1, longitude: 0 }
    const c = { latitude: 2, longitude: 0 }
    const expected = haversineNm(a, b) + haversineNm(b, c)
    expect(totalDistanceNm([a, b, c])).toBeCloseTo(expected, 10)
  })
})

describe("toKm", () => {
  it("converts 1 nm to 1.852 km", () => {
    expect(toKm(1)).toBeCloseTo(1.852)
  })

  it("converts 10 nm to 18.52 km", () => {
    expect(toKm(10)).toBeCloseTo(18.52)
  })
})

describe("toNm", () => {
  it("converts 1.852 km to 1 nm", () => {
    expect(toNm(1.852)).toBeCloseTo(1)
  })

  it("is the inverse of toKm", () => {
    expect(toNm(toKm(12.3))).toBeCloseTo(12.3)
  })
})

describe("formatDistance", () => {
  it("formats in nm with 1 decimal", () => {
    expect(formatDistance(12.567, "nm")).toBe("12.6")
  })

  it("converts to km and formats with 1 decimal", () => {
    // 10 nm × 1.852 = 18.520 → "18.5"
    expect(formatDistance(10, "km")).toBe("18.5")
  })
})

describe("formatDistanceForInput", () => {
  // A log auto-generated from an expedition carries the full float the haversine
  // sum produced. Bound straight into an editable field it rendered as
  // "0.6568740073199207" — sub-millimetre precision, in a box a person is meant
  // to read and correct.
  it("trims a computed distance to something a person can edit", () => {
    expect(formatDistanceForInput(0.6568740073199207)).toBe("0.66")
  })

  it("drops trailing zeros rather than padding to a fixed width", () => {
    expect(formatDistanceForInput(12)).toBe("12")
    expect(formatDistanceForInput(6.1)).toBe("6.1")
    expect(formatDistanceForInput(6.4)).toBe("6.4")
  })

  it("keeps 10-metre resolution, which 1 decimal would lose on a short paddle", () => {
    expect(formatDistanceForInput(0.65)).toBe("0.65")
    expect(formatDistanceForInput(0.649)).toBe("0.65")
  })

  it("handles zero and very small distances without scientific notation", () => {
    expect(formatDistanceForInput(0)).toBe("0")
    expect(formatDistanceForInput(0.0001)).toBe("0")
  })
})

describe("estimatedTime", () => {
  it("calculates hours and minutes for 4.2 nm at 2.5 knots", () => {
    expect(estimatedTime(4.2, 2.5)).toEqual({ hours: 1, minutes: 41 })
  })

  it("calculates hours and minutes for 0.5 nm at 2.5 knots", () => {
    expect(estimatedTime(0.5, 2.5)).toEqual({ hours: 0, minutes: 12 })
  })
})

describe("formatTime", () => {
  it("formats 7h 22min", () => {
    expect(formatTime({ hours: 7, minutes: 22 })).toBe("7h 22min")
  })

  it("formats minutes only when hours is 0", () => {
    expect(formatTime({ hours: 0, minutes: 41 })).toBe("41min")
  })
})

describe("legLabel", () => {
  it("formats leg label in nautical miles", () => {
    expect(legLabel(4.2, 2.5, "nm")).toBe("4.2 nm · 1h 41min")
  })

  it("formats leg label in kilometers", () => {
    expect(legLabel(4.2, 2.5, "km")).toBe("7.8 km · 1h 41min")
  })
})

describe("routeLegs", () => {
  // Points along a meridian (lon 0); each 0.5° latitude step ≈ 30 nm.
  const at = (lat: number, type: string, id: string) => ({ id, latitude: lat, longitude: 0, type })

  it("aggregates intervening positions into the leg toward the next stop", () => {
    const legs = routeLegs([at(0, "stop", "a"), at(0.5, "position", "b"), at(1.0, "stop", "c")])
    const anchors = legs.filter((l) => l.isAnchor)
    expect(anchors.map((l) => l.point.id)).toEqual(["a", "c"]) // position dropped from anchors
    expect(anchors[1].legNm).toBeCloseTo(60, 0) // a→c via b, not a single segment
    expect(anchors[1].cumulativeNm).toBeCloseTo(60, 0)
  })

  it("marks the day's first point as the start with no leg", () => {
    const [first] = routeLegs([at(0, "stop", "a"), at(0.5, "stop", "b")])
    expect(first.isStart).toBe(true)
    expect(first.legNm).toBe(0)
  })

  it("treats the first and last points as anchors even when typed position", () => {
    const legs = routeLegs([at(0, "position", "a"), at(0.5, "position", "b")])
    expect(legs.every((l) => l.isAnchor)).toBe(true)
    expect(legs[1].legNm).toBeCloseTo(30, 0)
  })

  it("reports a position's running distance from the last anchor", () => {
    const legs = routeLegs([at(0, "stop", "a"), at(0.5, "position", "b"), at(1.0, "position", "c")])
    const b = legs.find((l) => l.point.id === "b")!
    const c = legs.find((l) => l.point.id === "c")!
    expect(b.isAnchor).toBe(false)
    expect(b.legNm).toBeCloseTo(30, 0)
    expect(c.legNm).toBeCloseTo(60, 0) // aggregated from stop "a" across "b"
  })

  it("skips points without coordinates", () => {
    const legs = routeLegs([
      at(0, "stop", "a"),
      { id: "b", latitude: null, longitude: null, type: "position" },
      at(1.0, "stop", "c"),
    ])
    expect(legs.map((l) => l.point.id)).toEqual(["a", "c"])
  })
})

describe("dayRouteLegs", () => {
  // Points along a meridian (lon 0); each 0.5° latitude step ≈ 30 nm.
  const at = (lat: number, type: string, id: string) => ({ id, latitude: lat, longitude: 0, type })

  it("measures the day's first point from the stop it was paddled from", () => {
    // The overnight stop (the seed) belongs to the previous day. Before this, the
    // first point of a day reported nothing at all — leg 0 and isStart true — and
    // the crossing was dropped from every per-point readout.
    const legs = dayRouteLegs(at(0, "stop", "overnight"), [
      at(0.5, "position", "a"),
      at(1.0, "stop", "b"),
    ])

    expect(legs.map((l) => l.point.id)).toEqual(["a", "b"])
    expect(legs[0].isStart).toBe(false)
    expect(legs[0].legNm).toBeCloseTo(30, 0)
    // Cumulative starts at the overnight stop, so it agrees with the day total the
    // boundary divider shows (which has always included the crossing leg).
    expect(legs[1].cumulativeNm).toBeCloseTo(60, 0)
  })

  it("falls back to a plain walk for the first day, which has nothing before it", () => {
    const legs = dayRouteLegs(null, [at(0, "stop", "a"), at(0.5, "stop", "b")])
    expect(legs.map((l) => l.point.id)).toEqual(["a", "b"])
    expect(legs[0].isStart).toBe(true)
    expect(legs[0].legNm).toBe(0)
  })

  it("ignores a seed with no coordinates rather than dropping the day's first point", () => {
    const unplaced: {
      id: string
      latitude: number | null
      longitude: number | null
      type: string
    } = { id: "seed", latitude: null, longitude: null, type: "stop" }
    const legs = dayRouteLegs(unplaced, [at(0, "stop", "a"), at(0.5, "stop", "b")])
    expect(legs.map((l) => l.point.id)).toEqual(["a", "b"])
    expect(legs[0].isStart).toBe(true)
  })

  it("still anchors on stops within the day", () => {
    const legs = dayRouteLegs(at(0, "stop", "overnight"), [
      at(0.5, "position", "a"),
      at(1.0, "stop", "b"),
      at(1.5, "position", "c"),
    ])
    expect(legs.filter((l) => l.isAnchor).map((l) => l.point.id)).toEqual(["b", "c"])
    // "c" is the day's last point, so it is an anchor and reports its leg from "b".
    expect(legs.find((l) => l.point.id === "c")!.legNm).toBeCloseTo(30, 0)
  })
})

describe("groupStopsWithVia", () => {
  // Points along a meridian (lon 0); each 0.5° latitude step ≈ 30 nm.
  const at = (lat: number, type: string, id: string) => ({ id, latitude: lat, longitude: 0, type })

  it("carries the intervening positions on the stop that follows them", () => {
    const groups = groupStopsWithVia([
      at(0, "stop", "a"),
      at(0.5, "position", "b"),
      at(1.0, "stop", "c"),
    ])
    expect(groups.map((g) => g.point.id)).toEqual(["a", "c"])
    const [, stopC] = groups
    expect(stopC.via.map((leg) => leg.point.id)).toEqual(["b"])
    // "b"'s own legNm is its running distance from "a", not the leg to "c".
    expect(stopC.via[0].legNm).toBeCloseTo(30, 0)
    expect(stopC.legNm).toBeCloseTo(60, 0) // a -> c via b
  })

  it("reports an empty via list for two adjacent stops", () => {
    const groups = groupStopsWithVia([at(0, "stop", "a"), at(0.5, "stop", "b")])
    expect(groups[1].via).toEqual([])
  })

  it("attaches multiple intervening positions in order", () => {
    const groups = groupStopsWithVia([
      at(0, "stop", "a"),
      at(0.2, "position", "b"),
      at(0.4, "position", "c"),
      at(0.6, "stop", "d"),
    ])
    const stopD = groups[1]
    expect(stopD.via.map((leg) => leg.point.id)).toEqual(["b", "c"])
    // Each position's legNm is its own running distance from "a", not from its neighbour.
    expect(stopD.via[1].legNm).toBeGreaterThan(stopD.via[0].legNm)
  })
})
