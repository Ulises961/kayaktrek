import { describe, it, expect } from "vitest"
import { addMinutesToTime, deriveCorrectedTide } from "../tidal"

describe("addMinutesToTime", () => {
  it("adds a positive offset", () => {
    expect(addMinutesToTime("09:42", 35)).toBe("10:17")
  })

  it("subtracts a negative offset", () => {
    expect(addMinutesToTime("03:10", -20)).toBe("02:50")
  })

  it("wraps past midnight", () => {
    expect(addMinutesToTime("23:50", 30)).toBe("00:20")
    expect(addMinutesToTime("00:10", -30)).toBe("23:40")
  })
})

describe("deriveCorrectedTide", () => {
  it("derives corrected times and range from the Admiralty example", () => {
    const result = deriveCorrectedTide({
      baseHighTide: "09:42",
      baseLowTide: "03:10",
      baseHwHeightM: 7.2,
      baseLwHeightM: 1.1,
      hwTimeOffsetMinutes: 35,
      lwTimeOffsetMinutes: 28,
      hwHeightRatio: 0.92,
      lwHeightRatio: 1.05,
    })
    expect(result.highTide).toBe("10:17")
    expect(result.lowTide).toBe("03:38")
    // 7.2*0.92 - 1.1*1.05 = 6.624 - 1.155 = 5.469 → 5.47
    expect(result.tidalRangeM).toBe(5.47)
  })

  it("defaults ratios and offsets to identity when absent", () => {
    const result = deriveCorrectedTide({
      baseHighTide: "09:42",
      baseLowTide: "03:10",
      baseHwHeightM: 6,
      baseLwHeightM: 1,
    })
    expect(result.highTide).toBe("09:42")
    expect(result.lowTide).toBe("03:10")
    expect(result.tidalRangeM).toBe(5)
  })

  it("returns nulls when base values are missing", () => {
    const result = deriveCorrectedTide({ hwTimeOffsetMinutes: 35 })
    expect(result.highTide).toBeNull()
    expect(result.lowTide).toBeNull()
    expect(result.tidalRangeM).toBeNull()
  })
})
