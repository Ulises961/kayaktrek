import { describe, it, expect } from "vitest"
import { formatVesselLength } from "../format"

describe("formatVesselLength", () => {
  it("converts centimetres to metres with two decimal places", () => {
    expect(formatVesselLength(520)).toBe("5.20 m")
  })

  it("returns null for null", () => {
    expect(formatVesselLength(null)).toBeNull()
  })

  it("returns null for undefined", () => {
    expect(formatVesselLength(undefined)).toBeNull()
  })

  it("does not drop a legitimate zero", () => {
    // `!cm` treats 0 as absent and silently hides it — must use `== null` instead.
    expect(formatVesselLength(0)).toBe("0.00 m")
  })
})
