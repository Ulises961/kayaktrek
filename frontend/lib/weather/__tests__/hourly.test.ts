import { describe, it, expect } from "vitest"
import { formatHour, representativeHour } from "../hourly"

describe("formatHour", () => {
  it("trims seconds from an HH:MM:SS time", () => {
    expect(formatHour("12:00:00")).toBe("12:00")
  })

  it("returns — for missing time", () => {
    expect(formatHour(null)).toBe("—")
    expect(formatHour(undefined)).toBe("—")
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
