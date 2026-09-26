import { describe, it, expect } from "vitest"
import { formatHour, hasWaveForecast, hourOf, representativeHour } from "../hourly"

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

// A lake has no marine forecast at all: Open-Meteo returns every wave and swell value
// as missing, and the backend stores those 24 hours as rows of nulls.
describe("hasWaveForecast", () => {
  const empty = { time: "12:00:00", waveHeight: null, waveDirection: null }

  it("is false for a missing or empty series", () => {
    expect(hasWaveForecast(null)).toBe(false)
    expect(hasWaveForecast(undefined)).toBe(false)
    expect(hasWaveForecast([])).toBe(false)
  })

  it("is false when every hour is missing every wave and swell value", () => {
    expect(hasWaveForecast([empty, { ...empty, swellWaveHeight: null }])).toBe(false)
  })

  it("is true as soon as one hour has a wave height", () => {
    expect(hasWaveForecast([empty, { ...empty, waveHeight: 0.4 }])).toBe(true)
  })

  it("is true when only the swell is present", () => {
    expect(hasWaveForecast([{ ...empty, swellWaveHeight: 0.9 }])).toBe(true)
    expect(hasWaveForecast([{ ...empty, swellPeriod: 8 }])).toBe(true)
  })

  it("counts a calm 0 m reading as a forecast", () => {
    expect(hasWaveForecast([{ ...empty, waveHeight: 0 }])).toBe(true)
  })
})
