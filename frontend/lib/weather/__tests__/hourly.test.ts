import { describe, it, expect } from "vitest"
import { formatHour, hourOf, representativeHour } from "../hourly"

describe("formatHour", () => {
  it("trims seconds from an HH:MM:SS time", () => {
    expect(formatHour("12:00:00")).toBe("12:00")
  })

  it("returns — for missing time", () => {
    expect(formatHour(null)).toBe("—")
    expect(formatHour(undefined)).toBe("—")
  })
})

describe("hourOf", () => {
  it("extracts the hour from HH:MM:SS time strings", () => {
    expect(hourOf("12:30:00")).toBe(12)
    expect(hourOf("06:15:45")).toBe(6)
    expect(hourOf("23:59:59")).toBe(23)
  })

  it("returns 0 for midnight", () => {
    expect(hourOf("00:00:00")).toBe(0)
  })

  it("returns null for null or undefined", () => {
    expect(hourOf(null)).toBeNull()
    expect(hourOf(undefined)).toBeNull()
  })

  it("returns null for unparseable hour values", () => {
    expect(hourOf("XX:00:00")).toBeNull()
    expect(hourOf("not-a-time")).toBeNull()
  })
})

describe("representativeHour", () => {
  it("prefers the midday reading", () => {
    const states = [{ time: "06:00:00" }, { time: "12:00:00" }, { time: "18:00:00" }]
    expect(representativeHour(states)).toBe(states[1])
  })

  it("falls back to the middle hour when there is no noon reading", () => {
    const states = [{ time: "06:00:00" }, { time: "09:00:00" }, { time: "15:00:00" }]
    expect(representativeHour(states)).toBe(states[1])
  })

  it("returns undefined for empty or missing series", () => {
    expect(representativeHour([])).toBeUndefined()
    expect(representativeHour(null)).toBeUndefined()
  })
})
