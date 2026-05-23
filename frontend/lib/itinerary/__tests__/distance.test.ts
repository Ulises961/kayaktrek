import { describe, it, expect } from "vitest"
import { haversineNm, totalDistanceNm, segmentMidpoint, toKm, formatDistance } from "../distance"

describe("haversineNm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineNm({ latitude: 44, longitude: 14 }, { latitude: 44, longitude: 14 })).toBeCloseTo(0)
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

describe("segmentMidpoint", () => {
  it("returns the midpoint between two lat/lng pairs", () => {
    const a = { latitude: 44, longitude: 14 }
    const b = { latitude: 46, longitude: 16 }
    const mid = segmentMidpoint(a, b)
    expect(mid.latitude).toBeCloseTo(45)
    expect(mid.longitude).toBeCloseTo(15)
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

describe("formatDistance", () => {
  it("formats in nm with 1 decimal", () => {
    expect(formatDistance(12.567, "nm")).toBe("12.6")
  })

  it("converts to km and formats with 1 decimal", () => {
    // 10 nm × 1.852 = 18.520 → "18.5"
    expect(formatDistance(10, "km")).toBe("18.5")
  })
})
