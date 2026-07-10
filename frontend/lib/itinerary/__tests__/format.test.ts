import { describe, it, expect } from "vitest"
import { formatRouteRange } from "../format"

describe("formatRouteRange", () => {
  it("joins two distinct names with 'to'", () => {
    expect(formatRouteRange("Henningsvær", "Nusfjord")).toBe("Henningsvær to Nusfjord")
  })

  it("returns just the start name when start and end are the same", () => {
    expect(formatRouteRange("Kabelvåg", "Kabelvåg")).toBe("Kabelvåg")
  })

  it("returns just the start name when there is no end name", () => {
    expect(formatRouteRange("Kabelvåg", null)).toBe("Kabelvåg")
  })

  it("returns an empty string when there is no start name", () => {
    expect(formatRouteRange(null, "Nusfjord")).toBe("")
  })

  it("returns an empty string when both names are absent", () => {
    expect(formatRouteRange(null, null)).toBe("")
  })
})
